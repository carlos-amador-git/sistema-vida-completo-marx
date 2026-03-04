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

class MifielPSC implements IPSC {
  private apiUrl: string;
  private apiId: string;
  private apiSecret: string;
  private providerName: string;

  constructor() {
    this.apiUrl = process.env.NOM151_PSC_URL || 'https://app.mifiel.com/api/v1';
    this.apiId = process.env.NOM151_PSC_API_ID || process.env.NOM151_PSC_API_KEY || '';
    this.apiSecret = process.env.NOM151_PSC_API_SECRET || '';
    this.providerName = process.env.NOM151_PSC_NAME || 'Mifiel (PSC NOM-151)';

    if (!this.apiId || !this.apiSecret) {
      logger.warn('NOM-151 Mifiel PSC not fully configured', {
        hasApiId: !!this.apiId,
        hasApiSecret: !!this.apiSecret,
      });
    }
  }

  getName(): string {
    return this.providerName;
  }

  isAvailable(): boolean {
    return !!this.apiId && !!this.apiSecret;
  }

  /**
   * Seal a document hash with Mifiel's NOM-151 timestamping API.
   * Flow: POST document hash → receive RFC 3161 TSA token + Mifiel certificate ID
   */
  async seal(request: NOM151SealRequest): Promise<NOM151SealResponse> {
    if (!this.isAvailable()) {
      throw new Error('PSC Mifiel no configurado. Configure NOM151_PSC_API_ID y NOM151_PSC_API_SECRET');
    }

    try {
      const axios = (await import('axios')).default;

      // Mifiel API: create a document for timestamping
      const response = await axios.post(
        `${this.apiUrl}/documents`,
        {
          original_hash: request.documentHash,
          name: `VIDA-Directive-${request.documentId}`,
          callback_url: process.env.NOM151_CALLBACK_URL,
        },
        {
          auth: { username: this.apiId, password: this.apiSecret },
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
        }
      );

      const { id: certificateId, created_at } = response.data;

      // Request timestamping (Constancia de Conservación)
      const tsResponse = await axios.post(
        `${this.apiUrl}/documents/${certificateId}/request_timestamp`,
        {},
        {
          auth: { username: this.apiId, password: this.apiSecret },
          timeout: 30000,
        }
      );

      const certificate = tsResponse.data.timestamp_token || `MIFIEL-${certificateId}`;

      logger.info('NOM-151 Mifiel seal generated', {
        documentId: request.documentId,
        mifielDocId: certificateId,
        timestamp: created_at,
      });

      return {
        sealed: true,
        certificate,
        timestamp: new Date(created_at),
        provider: this.getName(),
        hashAlgorithm: 'SHA-256',
        documentHash: request.documentHash,
      };
    } catch (error: any) {
      logger.error('NOM-151 Mifiel seal failed', {
        documentId: request.documentId,
        error: error.message,
        status: error.response?.status,
      });
      throw new Error(`Error al sellar con PSC Mifiel: ${error.message}`);
    }
  }

  /**
   * Verify a certificate against Mifiel's API.
   */
  async verify(request: NOM151VerifyRequest): Promise<NOM151VerifyResponse> {
    if (!this.isAvailable()) {
      throw new Error('PSC Mifiel no configurado');
    }

    try {
      const axios = (await import('axios')).default;

      // Extract Mifiel document ID from certificate
      const mifielId = request.certificate.startsWith('MIFIEL-')
        ? request.certificate.replace('MIFIEL-', '')
        : request.certificate;

      const response = await axios.get(
        `${this.apiUrl}/documents/${mifielId}`,
        {
          auth: { username: this.apiId, password: this.apiSecret },
          timeout: 15000,
        }
      );

      const { original_hash, created_at, signed } = response.data;
      const hashMatches = original_hash === request.documentHash;

      return {
        valid: hashMatches && signed,
        timestamp: created_at ? new Date(created_at) : null,
        provider: this.getName(),
        reason: !hashMatches ? 'Hash del documento no coincide' : (!signed ? 'Documento no firmado' : undefined),
      };
    } catch (error: any) {
      logger.error('NOM-151 Mifiel verify failed', {
        error: error.message,
      });
      return {
        valid: false,
        timestamp: null,
        provider: this.getName(),
        reason: `Error de verificación: ${error.message}`,
      };
    }
  }
}

/**
 * Generic RFC 3161 PSC — For providers like Edicom, Advantage Security, or SAT.
 * Implements standard TSA (Time-Stamp Authority) protocol.
 */
class GenericTSAPSC implements IPSC {
  private tsaUrl: string;
  private apiKey: string;
  private providerName: string;

  constructor() {
    this.tsaUrl = process.env.NOM151_PSC_URL || '';
    this.apiKey = process.env.NOM151_PSC_API_KEY || '';
    this.providerName = process.env.NOM151_PSC_NAME || 'PSC Genérico (RFC 3161)';
  }

  getName(): string { return this.providerName; }
  isAvailable(): boolean { return !!this.tsaUrl && !!this.apiKey; }

  async seal(request: NOM151SealRequest): Promise<NOM151SealResponse> {
    if (!this.isAvailable()) {
      throw new Error('PSC genérico no configurado. Configure NOM151_PSC_URL y NOM151_PSC_API_KEY');
    }

    try {
      const axios = (await import('axios')).default;

      // Standard RFC 3161 timestamp request
      const response = await axios.post(
        this.tsaUrl,
        {
          hash: request.documentHash,
          hashAlgorithm: 'SHA-256',
          documentId: request.documentId,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          timeout: 30000,
        }
      );

      return {
        sealed: true,
        certificate: response.data.token || response.data.certificate,
        timestamp: new Date(response.data.timestamp || Date.now()),
        provider: this.getName(),
        hashAlgorithm: 'SHA-256',
        documentHash: request.documentHash,
      };
    } catch (error: any) {
      logger.error('NOM-151 Generic TSA seal failed', { error: error.message });
      throw new Error(`Error al sellar con PSC: ${error.message}`);
    }
  }

  async verify(request: NOM151VerifyRequest): Promise<NOM151VerifyResponse> {
    if (!this.isAvailable()) {
      throw new Error('PSC genérico no configurado');
    }

    try {
      const axios = (await import('axios')).default;

      const response = await axios.post(
        `${this.tsaUrl}/verify`,
        {
          certificate: request.certificate,
          hash: request.documentHash,
        },
        {
          headers: { 'Authorization': `Bearer ${this.apiKey}` },
          timeout: 15000,
        }
      );

      return {
        valid: response.data.valid,
        timestamp: response.data.timestamp ? new Date(response.data.timestamp) : null,
        provider: this.getName(),
        reason: response.data.reason,
      };
    } catch (error: any) {
      return {
        valid: false,
        timestamp: null,
        provider: this.getName(),
        reason: `Error de verificación: ${error.message}`,
      };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

const NOM151_PROVIDER = process.env.NOM151_PROVIDER || 'mock';

function createPSCProvider(provider: string): IPSC {
  switch (provider) {
    case 'mifiel':
      return new MifielPSC();
    case 'generic':
    case 'edicom':
    case 'advantage':
      return new GenericTSAPSC();
    case 'mock':
    default:
      return new MockPSC();
  }
}

class NOM151Service {
  private psc: IPSC;

  constructor() {
    this.psc = createPSCProvider(NOM151_PROVIDER);

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
