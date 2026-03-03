// src/common/services/nom151.service.ts
/**
 * NOM-151 Timestamping Service — PSC (Prestador de Servicios de Certificación)
 *
 * Provides timestamp sealing for advance directives per NOM-151-SCFI-2002.
 * Supports two modes:
 * - mock: For development/testing (generates simulated certificates)
 * - real: For production (calls actual PSC API — requires contract)
 *
 * Configuration:
 * - NOM151_PROVIDER: 'mock' | 'real' (default: 'mock')
 * - NOM151_PSC_URL: PSC API endpoint (required for 'real')
 * - NOM151_PSC_API_KEY: PSC API key (required for 'real')
 * - NOM151_PSC_NAME: PSC provider name
 */

import * as crypto from 'crypto';
import { logger } from './logger.service';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface NOM151SealRequest {
  documentHash: string;       // SHA-256 hash of the document
  documentId: string;         // Directive ID
  requestedBy: string;        // User ID
}

export interface NOM151SealResponse {
  sealed: boolean;
  certificate: string;        // Certificate/token from PSC
  timestamp: Date;            // Timestamp from PSC
  provider: string;           // PSC provider name
  hashAlgorithm: string;      // Hash algorithm used
  documentHash: string;       // Echo back for verification
}

export interface NOM151VerifyRequest {
  certificate: string;
  documentHash: string;
}

export interface NOM151VerifyResponse {
  valid: boolean;
  timestamp: Date | null;
  provider: string;
  reason?: string;
}

interface IPSC {
  seal(request: NOM151SealRequest): Promise<NOM151SealResponse>;
  verify(request: NOM151VerifyRequest): Promise<NOM151VerifyResponse>;
  getName(): string;
  isAvailable(): boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK PSC (Development/Testing)
// ═══════════════════════════════════════════════════════════════════════════

class MockPSC implements IPSC {
  getName(): string {
    return 'PSC Mock Provider (Desarrollo)';
  }

  isAvailable(): boolean {
    return true;
  }

  async seal(request: NOM151SealRequest): Promise<NOM151SealResponse> {
    // Simulate PSC processing time
    await new Promise(resolve => setTimeout(resolve, 100));

    const certificate = `NOM151-MOCK-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;

    logger.info('NOM-151 mock seal generated', {
      documentId: request.documentId,
      certificate: certificate.substring(0, 20) + '...',
    });

    return {
      sealed: true,
      certificate,
      timestamp: new Date(),
      provider: this.getName(),
      hashAlgorithm: 'SHA-256',
      documentHash: request.documentHash,
    };
  }

  async verify(request: NOM151VerifyRequest): Promise<NOM151VerifyResponse> {
    // Mock: certificates starting with NOM151-MOCK- are always valid
    const isValid = request.certificate.startsWith('NOM151-MOCK-');

    return {
      valid: isValid,
      timestamp: isValid ? new Date() : null,
      provider: this.getName(),
      reason: isValid ? undefined : 'Certificado no reconocido',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REAL PSC (Production — requires PSC contract)
// ═══════════════════════════════════════════════════════════════════════════

class RealPSC implements IPSC {
  private pscUrl: string;
  private apiKey: string;
  private providerName: string;

  constructor() {
    this.pscUrl = process.env.NOM151_PSC_URL || '';
    this.apiKey = process.env.NOM151_PSC_API_KEY || '';
    this.providerName = process.env.NOM151_PSC_NAME || 'PSC Producción';

    if (!this.pscUrl || !this.apiKey) {
      logger.warn('NOM-151 Real PSC not fully configured', {
        hasUrl: !!this.pscUrl,
        hasKey: !!this.apiKey,
      });
    }
  }

  getName(): string {
    return this.providerName;
  }

  isAvailable(): boolean {
    return !!this.pscUrl && !!this.apiKey;
  }

  async seal(request: NOM151SealRequest): Promise<NOM151SealResponse> {
    if (!this.isAvailable()) {
      throw new Error('PSC real no configurado. Configure NOM151_PSC_URL y NOM151_PSC_API_KEY');
    }

    // TODO: Implement actual PSC API call when contract is in place
    // The interface is ready for integration with any NOM-151 certified PSC:
    // - Advantage Security
    // - Cecoban (PSC Santander)
    // - SAT (as PSC)
    //
    // Typical API flow:
    // 1. POST /api/timestamp with document hash
    // 2. Receive timestamped certificate (TSA token per RFC 3161)
    // 3. Store certificate for future verification

    logger.error('PSC real no implementado. Use NOM151_PROVIDER=mock para desarrollo', {
      documentId: request.documentId,
    });

    throw new Error(
      'La integración con el PSC real está pendiente de contrato. ' +
      'Configure NOM151_PROVIDER=mock para desarrollo.'
    );
  }

  async verify(request: NOM151VerifyRequest): Promise<NOM151VerifyResponse> {
    if (!this.isAvailable()) {
      throw new Error('PSC real no configurado');
    }

    // TODO: Implement actual PSC verification
    throw new Error('Verificación con PSC real pendiente de implementación');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

const NOM151_PROVIDER = process.env.NOM151_PROVIDER || 'mock';

class NOM151Service {
  private psc: IPSC;

  constructor() {
    if (NOM151_PROVIDER === 'real') {
      this.psc = new RealPSC();
    } else {
      this.psc = new MockPSC();
    }

    logger.info('NOM-151 service initialized', {
      provider: NOM151_PROVIDER,
      name: this.psc.getName(),
      available: this.psc.isAvailable(),
    });
  }

  /**
   * Seal a document with NOM-151 timestamp
   */
  async sealDocument(request: NOM151SealRequest): Promise<NOM151SealResponse> {
    return this.psc.seal(request);
  }

  /**
   * Verify a NOM-151 certificate
   */
  async verifyCertificate(request: NOM151VerifyRequest): Promise<NOM151VerifyResponse> {
    return this.psc.verify(request);
  }

  /**
   * Get provider info
   */
  getProviderInfo(): { name: string; type: string; available: boolean } {
    return {
      name: this.psc.getName(),
      type: NOM151_PROVIDER,
      available: this.psc.isAvailable(),
    };
  }

  /**
   * Check if using mock provider
   */
  isMock(): boolean {
    return NOM151_PROVIDER === 'mock';
  }
}

export const nom151Service = new NOM151Service();
export default nom151Service;
