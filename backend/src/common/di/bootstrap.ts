// src/common/di/bootstrap.ts
/**
 * DI Bootstrap — Registers all services and repositories in the container.
 *
 * Call bootstrapContainer() once at application startup (in main.ts)
 * before any service is resolved from the container.
 *
 * This module serves as the composition root where all dependencies
 * are wired together. Services can then be resolved via:
 *   container.resolve<CacheService>(TOKENS.CacheService)
 */
import { container, TOKENS } from './container';

// Infrastructure
import { prisma } from '../prisma';
import { cacheService } from '../services/cache.service';
import { logger } from '../services/logger.service';

// Security
import { encryptionService } from '../services/encryption.service';
import { rbacService } from '../services/rbac.service';
import { securityMetrics } from '../services/security-metrics.service';
import { qrTokenService } from '../services/qr-token.service';

// Domain services
import { emergencyService } from '../../modules/emergency/emergency.service';
import { directivesService } from '../../modules/directives/directives.service';

// Compliance
import { dataRetentionService } from '../services/data-retention.service';
import { auditTrailService } from '../services/audit-trail.service';
import { fhirMapper } from '../../modules/fhir/fhir-mapper.service';

// Repositories
import { userRepository } from '../repositories/user.repository';
import { auditLogRepository } from '../repositories/audit-log.repository';
import { emergencyAccessRepository } from '../repositories/emergency-access.repository';

export function bootstrapContainer(): void {
  // Infrastructure
  container.registerInstance(TOKENS.PrismaClient, prisma);
  container.registerInstance(TOKENS.CacheService, cacheService);
  container.registerInstance(TOKENS.Logger, logger);

  // Security
  container.registerInstance(TOKENS.EncryptionService, encryptionService);
  container.registerInstance(TOKENS.RBACService, rbacService);
  container.registerInstance(TOKENS.SecurityMetrics, securityMetrics);
  container.registerInstance(TOKENS.QRTokenService, qrTokenService);

  // Domain services
  container.registerInstance(TOKENS.EmergencyService, emergencyService);
  container.registerInstance(TOKENS.DirectivesService, directivesService);

  // Compliance
  container.registerInstance(TOKENS.DataRetentionService, dataRetentionService);
  container.registerInstance(TOKENS.AuditTrailService, auditTrailService);
  container.registerInstance(TOKENS.FHIRMapper, fhirMapper);

  // Repositories
  container.registerInstance(TOKENS.UserRepository, userRepository);
  container.registerInstance(TOKENS.AuditLogRepository, auditLogRepository);
  container.registerInstance(TOKENS.EmergencyAccessRepository, emergencyAccessRepository);

  logger.info('DI container bootstrapped', {
    registeredServices: container.listTokens().length,
  });
}
