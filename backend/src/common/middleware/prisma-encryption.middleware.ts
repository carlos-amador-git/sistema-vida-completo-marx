// src/common/middleware/prisma-encryption.middleware.ts
/**
 * Prisma Middleware — Transparent Field-Level Encryption for PHI
 *
 * Intercepts Prisma operations and automatically:
 *   - Encrypts specified fields BEFORE writes (create / update / upsert).
 *   - Decrypts specified fields AFTER reads (findUnique / findFirst / findMany).
 *   - Populates blind-index columns for searchable encrypted fields.
 *
 * Configuration lives in ENCRYPTED_FIELDS and BLIND_INDEX_FIELDS below.
 * To add a new field: add it to the corresponding model array and create a
 * migration that widens the column to accommodate the ciphertext length
 * (typically ~350 chars for a short string field).
 *
 * Blind-index columns follow the naming convention `<fieldName>BlindIndex`
 * (e.g., `curp` -> `curpBlindIndex`).
 */

import { Prisma } from '@prisma/client';
import { getEncryptionService } from '../services/encryption.service';
import { logger } from '../services/logger.service';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map of Prisma model name -> array of field names that must be encrypted
 * at rest.  Field names MUST exist on the model and hold String values.
 *
 * Encrypted data is stored in the SAME column — no separate *Enc column is
 * needed unless your schema uses them for backward compatibility.  Add only
 * fields that are not already managed by a separate encrypted column.
 */
export const ENCRYPTED_FIELDS: Record<string, string[]> = {
  PatientProfile: ['medicalConditions', 'allergies', 'medications', 'bloodType'],
  Directive: ['content', 'specificInstructions'],
  User: ['curp'],
};

/**
 * Map of model name -> array of field names for which a blind index should be
 * generated automatically.  The blind index column must exist in the schema as
 * `<fieldName>BlindIndex` (e.g., `curpBlindIndex`).
 */
export const BLIND_INDEX_FIELDS: Record<string, string[]> = {
  User: ['curp'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function blindIndexColumn(fieldName: string): string {
  return `${fieldName}BlindIndex`;
}

/**
 * Encrypt all PHI fields in a data object for the given model.
 * Returns a new object (does not mutate the original).
 */
function encryptData(model: string, data: Record<string, unknown>): Record<string, unknown> {
  const fields = ENCRYPTED_FIELDS[model];
  if (!fields || fields.length === 0) return data;

  const enc = getEncryptionService();
  const result: Record<string, unknown> = { ...data };

  for (const field of fields) {
    const value = result[field];
    if (typeof value === 'string' && value.length > 0) {
      try {
        result[field] = enc.encryptField(value);
      } catch (err) {
        logger.error(`[PrismaEncryption] Failed to encrypt ${model}.${field}`, { error: err });
        throw err;
      }
    }
  }

  // Populate blind indexes
  const biFields = BLIND_INDEX_FIELDS[model];
  if (biFields) {
    for (const field of biFields) {
      const value = data[field]; // use the ORIGINAL plaintext, not the ciphertext
      if (typeof value === 'string' && value.length > 0) {
        const column = blindIndexColumn(field);
        try {
          result[column] =
            field === 'curp'
              ? enc.createCurpBlindIndex(value)
              : enc.createBlindIndex(value);
        } catch (err) {
          logger.error(
            `[PrismaEncryption] Failed to create blind index for ${model}.${field}`,
            { error: err }
          );
          throw err;
        }
      }
    }
  }

  return result;
}

/**
 * Decrypt all PHI fields in a result object returned by Prisma.
 * Handles both single records and arrays.
 * Mutates the object in-place for performance (Prisma objects are not frozen).
 */
function decryptResult(model: string, result: unknown): void {
  if (!result || typeof result !== 'object') return;

  if (Array.isArray(result)) {
    for (const item of result) {
      decryptResult(model, item);
    }
    return;
  }

  const fields = ENCRYPTED_FIELDS[model];
  if (!fields || fields.length === 0) return;

  const enc = getEncryptionService();
  const record = result as Record<string, unknown>;

  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.length > 0) {
      // Only attempt decryption if the value looks like our JSON envelope
      // (starts with '{').  Plain values stored before encryption was enabled
      // are left untouched to prevent runtime errors during migration.
      if (value.trimStart().startsWith('{')) {
        try {
          record[field] = enc.decryptField(value);
        } catch (err) {
          // Log but do not throw — a single corrupt field must not block the
          // entire query.  Callers receive the ciphertext as a sentinel value
          // so they can detect and handle the failure.
          logger.error(
            `[PrismaEncryption] Failed to decrypt ${model}.${field} — returning ciphertext`,
            { error: err }
          );
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the Prisma middleware function.
 *
 * Usage — call this once after creating your PrismaClient:
 *
 *   import { buildPrismaEncryptionMiddleware } from '.../prisma-encryption.middleware';
 *   prisma.$use(buildPrismaEncryptionMiddleware());
 */
export function buildPrismaEncryptionMiddleware(): Prisma.Middleware {
  return async (params: Prisma.MiddlewareParams, next: (params: Prisma.MiddlewareParams) => Promise<unknown>) => {
    const model = params.model as string | undefined;

    // Only intercept models that have encrypted fields
    if (!model || !ENCRYPTED_FIELDS[model]) {
      return next(params);
    }

    // ── Encrypt on write ─────────────────────────────────────────────────────
    if (params.action === 'create' || params.action === 'update') {
      if (params.args?.data && typeof params.args.data === 'object') {
        params.args.data = encryptData(model, params.args.data as Record<string, unknown>);
      }
    }

    if (params.action === 'upsert') {
      if (params.args?.create && typeof params.args.create === 'object') {
        params.args.create = encryptData(model, params.args.create as Record<string, unknown>);
      }
      if (params.args?.update && typeof params.args.update === 'object') {
        params.args.update = encryptData(model, params.args.update as Record<string, unknown>);
      }
    }

    if (params.action === 'createMany') {
      const dataArg = params.args?.data;
      if (Array.isArray(dataArg)) {
        params.args.data = dataArg.map((item: Record<string, unknown>) =>
          encryptData(model, item)
        );
      }
    }

    // ── Execute ──────────────────────────────────────────────────────────────
    const result = await next(params);

    // ── Decrypt on read ──────────────────────────────────────────────────────
    if (
      params.action === 'findUnique' ||
      params.action === 'findFirst' ||
      params.action === 'findMany' ||
      params.action === 'create' ||
      params.action === 'update' ||
      params.action === 'upsert'
    ) {
      decryptResult(model, result);
    }

    return result;
  };
}

export default buildPrismaEncryptionMiddleware;
