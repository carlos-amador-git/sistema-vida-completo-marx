// src/common/services/__tests__/encryption.service.test.ts
/**
 * Unit tests for EncryptionService
 *
 * All tests run without a database and without the global ENCRYPTION_MASTER_KEY
 * env var — they set up their own test KEK and reset the singleton between cases.
 */

import * as crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function randomHex64(): string {
  return crypto.randomBytes(32).toString('hex');
}

function withTestKEK<T>(keyHex: string, fn: () => T): T {
  const original = process.env.ENCRYPTION_MASTER_KEY;
  process.env.ENCRYPTION_MASTER_KEY = keyHex;

  // Reset the singleton so a fresh service is constructed with our test KEK.
  const { resetEncryptionServiceSingleton } = require('../encryption.service');
  resetEncryptionServiceSingleton();

  try {
    return fn();
  } finally {
    if (original === undefined) {
      delete process.env.ENCRYPTION_MASTER_KEY;
    } else {
      process.env.ENCRYPTION_MASTER_KEY = original;
    }
    resetEncryptionServiceSingleton();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Import (deferred so we control env before first construction)
// ─────────────────────────────────────────────────────────────────────────────

let EncryptionService: typeof import('../encryption.service').EncryptionService;

beforeAll(() => {
  // Ensure the module is loaded fresh on each test run by clearing the cache
  // only when the module has not been required yet.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  EncryptionService = require('../encryption.service').EncryptionService;
});

afterEach(() => {
  const { resetEncryptionServiceSingleton } = require('../encryption.service');
  resetEncryptionServiceSingleton();
  delete process.env.ENCRYPTION_MASTER_KEY;
});

// ─────────────────────────────────────────────────────────────────────────────
// Construction
// ─────────────────────────────────────────────────────────────────────────────

describe('EncryptionService — construction', () => {
  it('throws when ENCRYPTION_MASTER_KEY is not set', () => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    expect(() => new EncryptionService()).toThrow('ENCRYPTION_MASTER_KEY is not set');
  });

  it('throws when ENCRYPTION_MASTER_KEY is too short', () => {
    process.env.ENCRYPTION_MASTER_KEY = 'abc123';
    expect(() => new EncryptionService()).toThrow('must be exactly 64 hex characters');
  });

  it('throws when ENCRYPTION_MASTER_KEY is not valid hex', () => {
    process.env.ENCRYPTION_MASTER_KEY = 'z'.repeat(64);
    expect(() => new EncryptionService()).toThrow('valid hex string');
  });

  it('constructs successfully with a valid 64-char hex key', () => {
    process.env.ENCRYPTION_MASTER_KEY = randomHex64();
    expect(() => new EncryptionService()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// encryptField / decryptField
// ─────────────────────────────────────────────────────────────────────────────

describe('encryptField / decryptField', () => {
  const kek = randomHex64();

  it('roundtrip: decrypted value matches the original plaintext', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const plaintext = 'Tipo de sangre: O+';
      const encrypted = svc.encryptField(plaintext);
      expect(svc.decryptField(encrypted)).toBe(plaintext);
    });
  });

  it('roundtrip works with empty-ish but truthy strings', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const plaintext = ' ';
      const encrypted = svc.encryptField(plaintext);
      expect(svc.decryptField(encrypted)).toBe(plaintext);
    });
  });

  it('different plaintexts produce different ciphertexts', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const ct1 = svc.encryptField('Penicilina');
      const ct2 = svc.encryptField('Mariscos');
      expect(ct1).not.toBe(ct2);
    });
  });

  it('same plaintext produces different ciphertexts on each call (random IV)', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const plaintext = 'Diabetes tipo 2';
      const ct1 = svc.encryptField(plaintext);
      const ct2 = svc.encryptField(plaintext);
      expect(ct1).not.toBe(ct2); // different DEK + IV each time
    });
  });

  it('encrypted value is valid JSON with required keys', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const encrypted = svc.encryptField('Metformina 500mg');
      const parsed = JSON.parse(encrypted);
      expect(parsed).toHaveProperty('ciphertext');
      expect(parsed).toHaveProperty('iv');
      expect(parsed).toHaveProperty('tag');
      expect(parsed).toHaveProperty('dek');
    });
  });

  it('throws on tampered ciphertext (GCM auth tag mismatch)', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const encrypted = svc.encryptField('datos sensibles');
      const parsed = JSON.parse(encrypted);
      // Corrupt the ciphertext
      const originalCt = Buffer.from(parsed.ciphertext, 'base64');
      originalCt[0] ^= 0xff;
      parsed.ciphertext = originalCt.toString('base64');
      expect(() => svc.decryptField(JSON.stringify(parsed))).toThrow();
    });
  });

  it('throws when input is not valid JSON', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      expect(() => svc.decryptField('not-json')).toThrow('JSON parse failed');
    });
  });

  it('throws when required EncryptedField keys are missing', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const bad = JSON.stringify({ ciphertext: 'abc' }); // missing iv, tag, dek
      expect(() => svc.decryptField(bad)).toThrow('missing required properties');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// encryptFieldOrNull / decryptFieldOrNull
// ─────────────────────────────────────────────────────────────────────────────

describe('encryptFieldOrNull / decryptFieldOrNull', () => {
  const kek = randomHex64();

  it('returns null for null input', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      expect(svc.encryptFieldOrNull(null)).toBeNull();
      expect(svc.decryptFieldOrNull(null)).toBeNull();
    });
  });

  it('returns null for undefined input', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      expect(svc.encryptFieldOrNull(undefined)).toBeNull();
      expect(svc.decryptFieldOrNull(undefined)).toBeNull();
    });
  });

  it('returns null for empty string', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      expect(svc.encryptFieldOrNull('')).toBeNull();
      expect(svc.decryptFieldOrNull('')).toBeNull();
    });
  });

  it('encrypts and decrypts non-empty values normally', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const plaintext = 'Hipertensión';
      const encrypted = svc.encryptFieldOrNull(plaintext)!;
      expect(encrypted).not.toBeNull();
      expect(svc.decryptFieldOrNull(encrypted)).toBe(plaintext);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DEK management (encryptDEK / decryptDEK)
// ─────────────────────────────────────────────────────────────────────────────

describe('DEK management', () => {
  const kek = randomHex64();

  it('generateDEK returns a 32-byte Buffer', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const dek = svc.generateDEK();
      expect(dek).toBeInstanceOf(Buffer);
      expect(dek.length).toBe(32);
    });
  });

  it('encryptDEK / decryptDEK roundtrip', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const dek = svc.generateDEK();
      const encryptedDek = svc.encryptDEK(dek);
      const recovered = svc.decryptDEK(encryptedDek);
      expect(recovered).toEqual(dek);
    });
  });

  it('encryptDEK output is a base64 string', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const dek = svc.generateDEK();
      const encryptedDek = svc.encryptDEK(dek);
      // Must be valid base64
      const decoded = Buffer.from(encryptedDek, 'base64').toString('base64');
      expect(decoded).toBe(encryptedDek);
    });
  });

  it('wrong KEK fails to decrypt the DEK', () => {
    const kek1 = randomHex64();
    const kek2 = randomHex64();

    let encryptedDek: string;

    withTestKEK(kek1, () => {
      const svc = new EncryptionService();
      const dek = svc.generateDEK();
      encryptedDek = svc.encryptDEK(dek);
    });

    withTestKEK(kek2, () => {
      const svc = new EncryptionService();
      expect(() => svc.decryptDEK(encryptedDek)).toThrow();
    });
  });

  it('wrong KEK fails to decrypt the field', () => {
    const kek1 = randomHex64();
    const kek2 = randomHex64();
    const plaintext = 'secreto médico';
    let encrypted: string;

    withTestKEK(kek1, () => {
      const svc = new EncryptionService();
      encrypted = svc.encryptField(plaintext);
    });

    withTestKEK(kek2, () => {
      const svc = new EncryptionService();
      expect(() => svc.decryptField(encrypted)).toThrow();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Blind index
// ─────────────────────────────────────────────────────────────────────────────

describe('createBlindIndex', () => {
  const kek = randomHex64();

  it('is deterministic: same input always produces the same index', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const value = 'CURP123456HDFABC01';
      const idx1 = svc.createBlindIndex(value);
      const idx2 = svc.createBlindIndex(value);
      expect(idx1).toBe(idx2);
    });
  });

  it('normalises case — uppercase and lowercase produce the same index', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const upper = svc.createBlindIndex('PENICILINA');
      const lower = svc.createBlindIndex('penicilina');
      expect(upper).toBe(lower);
    });
  });

  it('normalises whitespace — trimmed and untrimmed produce the same index', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const trimmed = svc.createBlindIndex('penicilina');
      const padded = svc.createBlindIndex('  penicilina  ');
      expect(trimmed).toBe(padded);
    });
  });

  it('different values produce different indexes', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const idx1 = svc.createBlindIndex('penicilina');
      const idx2 = svc.createBlindIndex('mariscos');
      expect(idx1).not.toBe(idx2);
    });
  });

  it('returns a hex string of the expected truncated length (32 chars)', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const idx = svc.createBlindIndex('test value');
      expect(idx).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  it('different KEKs produce different blind indexes for the same value', () => {
    const kek1 = randomHex64();
    const kek2 = randomHex64();
    const value = 'datos del paciente';

    let idx1: string;
    let idx2: string;

    withTestKEK(kek1, () => {
      idx1 = new EncryptionService().createBlindIndex(value);
    });
    withTestKEK(kek2, () => {
      idx2 = new EncryptionService().createBlindIndex(value);
    });

    // Different KEKs derive different blindIndexKeys, so indexes must differ.
    expect(idx1!).not.toBe(idx2!);
  });
});

describe('createCurpBlindIndex', () => {
  const kek = randomHex64();

  it('normalises to uppercase — lowercase CURP matches uppercase', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const upper = svc.createCurpBlindIndex('CURP123456HDFABC01');
      const lower = svc.createCurpBlindIndex('curp123456hdfabc01');
      expect(upper).toBe(lower);
    });
  });

  it('produces a different index than createBlindIndex for the same input', () => {
    // Because createBlindIndex lowercases and createCurpBlindIndex uppercases,
    // inputs with mixed case will differ.  Use a mixed-case value to verify.
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const mixedCase = 'CuRp123456HdFaBc01';
      const blindIdx = svc.createBlindIndex(mixedCase);
      const curpIdx = svc.createCurpBlindIndex(mixedCase);
      // The two helpers normalise differently, so outputs must differ for mixed case.
      expect(blindIdx).not.toBe(curpIdx);
    });
  });

  it('is irreversible: cannot recover plaintext from blind index alone', () => {
    // This is a structural guarantee — the blind index is an HMAC truncation.
    // We verify that the index does not contain the plaintext.
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const curp = 'AAAA900101HDFBBB01';
      const idx = svc.createCurpBlindIndex(curp);
      expect(idx).not.toContain(curp.toLowerCase());
      expect(idx).not.toContain(curp.toUpperCase());
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unicode / special characters
// ─────────────────────────────────────────────────────────────────────────────

describe('Unicode and special characters', () => {
  const kek = randomHex64();

  it('handles accented characters correctly', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const plaintext = 'Alergia: Ácido acetilsalicílico (Aspirina)';
      expect(svc.decryptField(svc.encryptField(plaintext))).toBe(plaintext);
    });
  });

  it('handles emoji / arbitrary Unicode', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const plaintext = '🩺 Diagnóstico: Hipertensión arterial 血压';
      expect(svc.decryptField(svc.encryptField(plaintext))).toBe(plaintext);
    });
  });

  it('handles long strings (simulates medical notes)', () => {
    withTestKEK(kek, () => {
      const svc = new EncryptionService();
      const plaintext = 'A'.repeat(10_000);
      expect(svc.decryptField(svc.encryptField(plaintext))).toBe(plaintext);
    });
  });
});
