// src/modules/admin/admin-mfa.service.ts
/**
 * Servicio de Autenticación Multi-Factor (MFA) para Administradores
 *
 * Implementa TOTP (Time-based One-Time Password) compatible con:
 * - Google Authenticator
 * - Microsoft Authenticator
 * - Authy
 * - 1Password
 * - Y otras apps TOTP estándar
 *
 * Almacenamiento:
 * - Datos persistentes (secreto, códigos backup): Base de datos (Prisma)
 * - Datos temporales (setup pendiente): Cache (Redis/Memoria)
 */

import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import config from '../../config';
import { cacheService, CACHE_PREFIXES } from '../../common/services/cache.service';
import { logger } from '../../common/services/logger.service';
// TODO: Service-level translations use the default (server) locale, not the per-request locale.
// To respect per-request locale, pass the locale or req.t into each method.
import i18next from '../../common/i18n/config';

import { prisma } from '../../common/prisma';

/**
 * Genera hash SHA-256 de un código de respaldo para almacenamiento seguro
 */
function hashBackupCode(code: string): string {
  const normalized = code.toUpperCase().replace(/-/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// Nombre de la aplicación para mostrar en authenticators
const APP_NAME = 'Sistema VIDA Admin';

// TTL para MFA pendiente (10 minutos)
const MFA_PENDING_TTL = 600;

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES DE CIFRADO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cifra el secreto MFA antes de guardarlo en la base de datos
 */
function encryptSecret(secret: string): string {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(config.encryption.key, 'hex');
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Formato: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Descifra el secreto MFA
 */
function decryptSecret(encryptedData: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');

  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(config.encryption.key, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export interface MFASetupResult {
  secret: string;
  qrCodeDataUrl: string;
  manualEntryKey: string;
  backupCodes: string[];
}

export interface MFAStatus {
  enabled: boolean;
  enabledAt?: Date;
  backupCodesRemaining?: number;
}

interface PendingMFAData {
  secret: string;
  backupCodes: string[];
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICIO MFA
// ═══════════════════════════════════════════════════════════════════════════

class AdminMFAService {
  /**
   * Genera un nuevo secreto MFA y QR code para configuración
   */
  async setupMFA(adminId: string): Promise<MFASetupResult> {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw { code: 'ADMIN_NOT_FOUND', message: i18next.t('api:admin.mfa.adminNotFound'), status: 404 };
    }

    // Si ya tiene MFA habilitado, no permitir nuevo setup
    if (admin.mfaEnabled) {
      throw { code: 'MFA_ALREADY_ENABLED', message: i18next.t('api:admin.mfa.alreadyEnabled'), status: 400 };
    }

    // Generar nuevo secreto TOTP
    const secretObj = speakeasy.generateSecret({
      name: `${APP_NAME}:${admin.email}`,
      issuer: APP_NAME,
    });
    const secret = secretObj.base32;

    // Generar URL para el QR code
    const otpauthUrl = secretObj.otpauth_url || speakeasy.otpauthURL({
      secret: secret,
      label: admin.email,
      issuer: APP_NAME,
      encoding: 'base32',
    });

    // Generar QR code como Data URL
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      width: 256,
    });

    // Generar códigos de respaldo (10 códigos de 8 caracteres)
    const backupCodes = this.generateBackupCodes(10);

    // Guardar en cache (temporal, expira en 10 minutos)
    const pendingData: PendingMFAData = {
      secret,
      backupCodes,
      createdAt: new Date().toISOString(),
    };

    await cacheService.set(adminId, pendingData, {
      prefix: CACHE_PREFIXES.MFA_PENDING,
      ttl: MFA_PENDING_TTL,
    });

    logger.info('MFA setup iniciado', { adminId, email: admin.email });

    return {
      secret, // Solo se muestra una vez durante setup
      qrCodeDataUrl,
      manualEntryKey: this.formatSecretForManualEntry(secret),
      backupCodes,
    };
  }

  /**
   * Verifica el código TOTP y activa MFA
   */
  async verifyAndEnableMFA(adminId: string, code: string): Promise<boolean> {
    // Obtener datos pendientes del cache
    const pendingMFA = await cacheService.get<PendingMFAData>(adminId, {
      prefix: CACHE_PREFIXES.MFA_PENDING,
    });

    if (!pendingMFA) {
      throw {
        code: 'MFA_NOT_SETUP',
        message: i18next.t('api:admin.mfa.notSetup'),
        status: 400,
      };
    }

    // Verificar el código TOTP
    const isValid = speakeasy.totp.verify({
      secret: pendingMFA.secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!isValid) {
      logger.warn('MFA verificación fallida', { adminId });
      throw {
        code: 'INVALID_MFA_CODE',
        message: i18next.t('api:admin.mfa.invalidCode'),
        status: 400,
      };
    }

    // Activar MFA en la base de datos
    await prisma.adminUser.update({
      where: { id: adminId },
      data: {
        mfaEnabled: true,
        mfaSecret: encryptSecret(pendingMFA.secret),
        mfaBackupCodes: pendingMFA.backupCodes.map(c => hashBackupCode(c)),
        mfaEnabledAt: new Date(),
        mfaPendingSecret: null,
        mfaPendingExpires: null,
      },
    });

    // Limpiar cache
    await cacheService.delete(adminId, { prefix: CACHE_PREFIXES.MFA_PENDING });

    // Log de auditoría
    await this.logMFAAction(adminId, 'MFA_ENABLED');

    logger.info('MFA habilitado exitosamente', { adminId });

    return true;
  }

  /**
   * Verifica un código TOTP durante el login
   */
  async verifyMFACode(adminId: string, code: string): Promise<boolean> {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: {
        mfaEnabled: true,
        mfaSecret: true,
        mfaBackupCodes: true,
      },
    });

    if (!admin || !admin.mfaEnabled || !admin.mfaSecret) {
      throw {
        code: 'MFA_NOT_ENABLED',
        message: i18next.t('api:admin.mfa.notEnabled'),
        status: 400,
      };
    }

    // Descifrar secreto
    const secret = decryptSecret(admin.mfaSecret);

    // Primero intentar verificar como código TOTP
    const isValidTOTP = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (isValidTOTP) {
      await this.logMFAAction(adminId, 'MFA_VERIFIED');
      return true;
    }

    // Si no es TOTP válido, verificar si es código de respaldo
    const hashedCode = hashBackupCode(code);
    const backupCodeIndex = admin.mfaBackupCodes.findIndex(
      (bc: string) => bc === hashedCode
    );

    if (backupCodeIndex !== -1) {
      // Marcar código de respaldo como usado
      const updatedBackupCodes = [...admin.mfaBackupCodes];
      updatedBackupCodes[backupCodeIndex] = `USED:${updatedBackupCodes[backupCodeIndex]}`;

      await prisma.adminUser.update({
        where: { id: adminId },
        data: { mfaBackupCodes: updatedBackupCodes },
      });

      await this.logMFAAction(adminId, 'MFA_BACKUP_CODE_USED', { codeIndex: backupCodeIndex });

      logger.warn('Código de respaldo MFA usado', { adminId, codeIndex: backupCodeIndex });

      return true;
    }

    throw {
      code: 'INVALID_MFA_CODE',
      message: i18next.t('api:admin.mfa.invalidCode'),
      status: 401,
    };
  }

  /**
   * Deshabilita MFA para un administrador
   */
  async disableMFA(adminId: string, code: string): Promise<void> {
    // Verificar código antes de deshabilitar
    await this.verifyMFACode(adminId, code);

    // Deshabilitar en BD
    await prisma.adminUser.update({
      where: { id: adminId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: [],
        mfaEnabledAt: null,
      },
    });

    await this.logMFAAction(adminId, 'MFA_DISABLED');

    logger.info('MFA deshabilitado', { adminId });
  }

  /**
   * Obtiene el estado de MFA para un administrador
   */
  async getMFAStatus(adminId: string): Promise<MFAStatus> {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: {
        mfaEnabled: true,
        mfaEnabledAt: true,
        mfaBackupCodes: true,
      },
    });

    if (!admin || !admin.mfaEnabled) {
      return { enabled: false };
    }

    const usedBackupCodes = admin.mfaBackupCodes.filter((c: string) =>
      c.startsWith('USED:')
    ).length;

    return {
      enabled: true,
      enabledAt: admin.mfaEnabledAt || undefined,
      backupCodesRemaining: admin.mfaBackupCodes.length - usedBackupCodes,
    };
  }

  /**
   * Regenera códigos de respaldo
   */
  async regenerateBackupCodes(adminId: string, code: string): Promise<string[]> {
    // Verificar código actual
    await this.verifyMFACode(adminId, code);

    const newBackupCodes = this.generateBackupCodes(10);

    await prisma.adminUser.update({
      where: { id: adminId },
      data: { mfaBackupCodes: newBackupCodes.map(c => hashBackupCode(c)) },
    });

    await this.logMFAAction(adminId, 'MFA_BACKUP_CODES_REGENERATED');

    logger.info('Códigos de respaldo MFA regenerados', { adminId });

    return newBackupCodes;
  }

  /**
   * Verifica si MFA está habilitado para un admin
   */
  async isMFAEnabled(adminId: string): Promise<boolean> {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { mfaEnabled: true },
    });

    return admin?.mfaEnabled || false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTODOS PRIVADOS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Genera códigos de respaldo aleatorios
   */
  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`);
    }
    return codes;
  }

  /**
   * Formatea el secreto para entrada manual
   */
  private formatSecretForManualEntry(secret: string): string {
    return secret.match(/.{1,4}/g)?.join(' ') || secret;
  }

  /**
   * Registra acción MFA en auditoría
   */
  private async logMFAAction(
    adminId: string,
    action: string,
    details?: Record<string, any>
  ): Promise<void> {
    try {
      await prisma.adminAuditLog.create({
        data: {
          adminId,
          action,
          resource: 'admin_mfa',
          details,
        },
      });
    } catch (error) {
      logger.error('Error logging MFA action', error, { adminId, action });
    }
  }
}

export const adminMFAService = new AdminMFAService();
export default adminMFAService;
