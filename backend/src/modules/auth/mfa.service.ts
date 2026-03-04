// src/modules/auth/mfa.service.ts
/**
 * TOTP-based Multi-Factor Authentication Service
 *
 * Implements RFC 6238 (TOTP) for MFA using the `otpauth` library.
 * Secrets are encrypted at rest using AES-256-GCM (same key as field-level encryption).
 *
 * Complies with:
 * - LFPDPPP Art. 19 (security measures)
 * - NOM-024-SSA3-2012 (electronic medical record security)
 */

import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import { prisma } from '../../common/prisma';
import { encryptionV2 } from '../../common/services/encryption-v2.service';
import { logger } from '../../common/services/logger.service';
import { AuthError } from './auth.service';

// TOTP window: accept 1 step before and after current time (90 seconds tolerance)
const TOTP_WINDOW = 1;
const TOTP_PERIOD = 30; // seconds
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = 'SHA1';
const ISSUER = 'Sistema VIDA';

class MFAService {
  /**
   * Generates a new TOTP secret for the user.
   * The secret is stored encrypted as a pending secret (not yet activated).
   * Returns the otpauth URI (for QR code) and the base32 secret.
   */
  async generateSecret(userId: string): Promise<{
    otpauthUri: string;
    base32Secret: string;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new AuthError('USER_NOT_FOUND', 'Usuario no encontrado');
    }

    // Generate a new TOTP secret (20 bytes = 160 bits, standard for TOTP)
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      label: user.email,
      algorithm: TOTP_ALGORITHM,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      secret: new OTPAuth.Secret({ size: 20 }),
    });

    const base32Secret = totp.secret.base32;
    const otpauthUri = totp.toString();

    // Store the encrypted secret temporarily on the user record
    // We store it in totpSecret with an "unverified:" prefix so we know it's pending
    const encryptedPendingSecret = encryptionV2.encryptField(`pending:${base32Secret}`);

    await prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: encryptedPendingSecret,
        mfaEnabled: false,
      },
    });

    logger.info('TOTP secret generated (pending verification)', { userId });

    return { otpauthUri, base32Secret };
  }

  /**
   * Generates a QR code Data URL from an otpauth URI.
   */
  async generateQRCode(otpauthUri: string): Promise<string> {
    const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 256,
      color: {
        dark: '#1a1a2e',
        light: '#ffffff',
      },
    });

    return qrDataUrl;
  }

  /**
   * Verifies a TOTP token against the stored secret for the given user.
   * Works for both pending (unverified) and active (verified) secrets.
   */
  async verifyToken(userId: string, token: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, totpSecret: true },
    });

    if (!user || !user.totpSecret) {
      return false;
    }

    const base32Secret = this.decryptSecret(user.totpSecret);
    if (!base32Secret) {
      return false;
    }

    const totp = new OTPAuth.TOTP({
      algorithm: TOTP_ALGORITHM,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      secret: OTPAuth.Secret.fromBase32(base32Secret),
    });

    const delta = totp.validate({ token, window: TOTP_WINDOW });

    return delta !== null;
  }

  /**
   * Verifies the token and enables MFA for the user.
   * Converts the pending secret to an active one.
   */
  async enableMFA(userId: string, token: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, totpSecret: true, mfaEnabled: true },
    });

    if (!user) {
      throw new AuthError('USER_NOT_FOUND', 'Usuario no encontrado');
    }

    if (!user.totpSecret) {
      throw new AuthError('MFA_NOT_SETUP', 'MFA no ha sido configurado. Genera un secreto primero.');
    }

    // Get the raw (possibly prefixed) stored value
    const rawDecrypted = this.decryptRawSecret(user.totpSecret);
    if (!rawDecrypted) {
      throw new AuthError('MFA_INVALID_SECRET', 'Secreto MFA inválido');
    }

    const base32Secret = rawDecrypted.startsWith('pending:')
      ? rawDecrypted.slice('pending:'.length)
      : rawDecrypted;

    const totp = new OTPAuth.TOTP({
      algorithm: TOTP_ALGORITHM,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      secret: OTPAuth.Secret.fromBase32(base32Secret),
    });

    const delta = totp.validate({ token, window: TOTP_WINDOW });

    if (delta === null) {
      throw new AuthError('MFA_INVALID_TOKEN', 'Código de verificación inválido o expirado');
    }

    // Activate MFA: re-encrypt without the "pending:" prefix
    const encryptedActiveSecret = encryptionV2.encryptField(base32Secret);

    await prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: encryptedActiveSecret,
        mfaEnabled: true,
        mfaVerifiedAt: new Date(),
      },
    });

    logger.info('MFA enabled for user', { userId });
  }

  /**
   * Verifies the token and disables MFA for the user.
   * Clears the secret and resets mfaEnabled.
   */
  async disableMFA(userId: string, token: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, totpSecret: true, mfaEnabled: true },
    });

    if (!user) {
      throw new AuthError('USER_NOT_FOUND', 'Usuario no encontrado');
    }

    if (!user.mfaEnabled || !user.totpSecret) {
      throw new AuthError('MFA_NOT_ENABLED', 'MFA no está habilitado');
    }

    const isValid = await this.verifyToken(userId, token);
    if (!isValid) {
      throw new AuthError('MFA_INVALID_TOKEN', 'Código de verificación inválido o expirado');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: null,
        mfaEnabled: false,
        mfaVerifiedAt: null,
      },
    });

    logger.info('MFA disabled for user', { userId });
  }

  /**
   * Decrypts the stored TOTP secret and returns the base32 value.
   * Strips the "pending:" prefix if present.
   */
  private decryptSecret(encryptedSecret: string): string | null {
    try {
      const raw = encryptionV2.decryptField(encryptedSecret);
      if (!raw) return null;
      return raw.startsWith('pending:') ? raw.slice('pending:'.length) : raw;
    } catch (error) {
      logger.error('Error decrypting TOTP secret', error);
      return null;
    }
  }

  /**
   * Decrypts the stored TOTP secret and returns the raw value (including prefix if any).
   */
  private decryptRawSecret(encryptedSecret: string): string | null {
    try {
      return encryptionV2.decryptField(encryptedSecret);
    } catch (error) {
      logger.error('Error decrypting raw TOTP secret', error);
      return null;
    }
  }
}

export const mfaService = new MFAService();
export default mfaService;
