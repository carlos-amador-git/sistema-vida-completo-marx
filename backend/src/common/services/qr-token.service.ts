// src/common/services/qr-token.service.ts
/**
 * QR Token Service — Secure tokenization for emergency QR codes
 *
 * QR codes contain a signed, time-limited token instead of PHI.
 * Format: base64url(JSON({ id, ts, scope, sig }))
 * Where sig = HMAC-SHA256(id + ts + scope, QR_TOKEN_SECRET)
 */
import crypto from 'crypto';
import { logger } from './logger.service';

const QR_TOKEN_SECRET = process.env.QR_TOKEN_SECRET || process.env.JWT_SECRET || 'dev-qr-secret-change-in-prod';
const DEFAULT_TTL_HOURS = 8760; // 1 year (QR is long-lived, but verified on each scan)

interface QRTokenPayload {
  id: string;       // UUID referencing the patient profile's qrToken
  ts: number;       // Unix timestamp of generation
  scope: string;    // 'emergency' | 'full'
  exp: number;      // Expiry timestamp
}

interface QRTokenWithSignature extends QRTokenPayload {
  sig: string;       // HMAC-SHA256 signature
}

class QRTokenService {
  /**
   * Generate a signed QR token
   */
  generateToken(patientQrId: string, scope: string = 'emergency', ttlHours: number = DEFAULT_TTL_HOURS): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: QRTokenPayload = {
      id: patientQrId,
      ts: now,
      scope,
      exp: now + (ttlHours * 3600),
    };

    const sig = this.sign(payload);
    const tokenData: QRTokenWithSignature = { ...payload, sig };

    // Encode as base64url for QR-friendly format
    const json = JSON.stringify(tokenData);
    const token = Buffer.from(json).toString('base64url');

    return token;
  }

  /**
   * Verify and decode a QR token
   * Returns the payload if valid, null if invalid/expired
   */
  verifyToken(token: string): QRTokenPayload | null {
    try {
      const json = Buffer.from(token, 'base64url').toString('utf-8');
      const data: QRTokenWithSignature = JSON.parse(json);

      // Verify required fields
      if (!data.id || !data.ts || !data.scope || !data.exp || !data.sig) {
        logger.warn('QR token missing required fields');
        return null;
      }

      // Verify expiry
      const now = Math.floor(Date.now() / 1000);
      if (data.exp < now) {
        logger.warn('QR token expired', { id: data.id, expiredAt: new Date(data.exp * 1000) });
        return null;
      }

      // Verify signature
      const { sig, ...payload } = data;
      const expectedSig = this.sign(payload);
      if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
        logger.warn('QR token signature mismatch', { id: data.id });
        return null;
      }

      return payload;
    } catch (error) {
      logger.warn('QR token decode error', error as Record<string, unknown>);
      return null;
    }
  }

  /**
   * Check if a raw string looks like a legacy UUID token (for backwards compatibility)
   */
  isLegacyToken(token: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);
  }

  /**
   * Resolve a token to the underlying patient qrToken ID
   * Supports both legacy UUID tokens and new signed tokens
   */
  resolveToken(token: string): { id: string; isLegacy: boolean } | null {
    // Legacy UUID format — pass through
    if (this.isLegacyToken(token)) {
      return { id: token, isLegacy: true };
    }

    // New signed format
    const payload = this.verifyToken(token);
    if (!payload) return null;

    return { id: payload.id, isLegacy: false };
  }

  private sign(payload: QRTokenPayload): string {
    const message = `${payload.id}:${payload.ts}:${payload.scope}:${payload.exp}`;
    return crypto
      .createHmac('sha256', QR_TOKEN_SECRET)
      .update(message)
      .digest('hex');
  }
}

export const qrTokenService = new QRTokenService();
