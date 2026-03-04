// src/common/prisma.ts
// PrismaClient singleton — previene múltiples instancias y connection pool exhaustion
import { PrismaClient } from '@prisma/client';
import { buildPrismaEncryptionMiddleware } from './middleware/prisma-encryption.middleware';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient();

  // Register field-level encryption middleware for PHI fields.
  // This is a no-op for models/fields not listed in ENCRYPTED_FIELDS.
  // The middleware is only registered when ENCRYPTION_MASTER_KEY is set
  // so that unit tests and CI environments without the key still work.
  if (process.env.ENCRYPTION_MASTER_KEY) {
    client.$use(buildPrismaEncryptionMiddleware());
  }

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
