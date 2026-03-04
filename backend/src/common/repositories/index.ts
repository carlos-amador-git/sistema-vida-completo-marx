// src/common/repositories/index.ts
export type { BaseRepository, PaginationOptions, PaginatedResult } from './base.repository';
export { userRepository } from './user.repository';
export type { UserEntity, CreateUserInput, UpdateUserInput } from './user.repository';
export { auditLogRepository } from './audit-log.repository';
export type { AuditLogEntity, CreateAuditLogInput } from './audit-log.repository';
export { emergencyAccessRepository } from './emergency-access.repository';
export type { EmergencyAccessEntity, CreateEmergencyAccessInput } from './emergency-access.repository';
