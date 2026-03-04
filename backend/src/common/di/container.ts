// src/common/di/container.ts
/**
 * Lightweight Dependency Injection Container
 *
 * Provides service registration and resolution without decorators or reflect-metadata.
 * Supports singleton and transient lifetimes.
 *
 * Usage:
 *   container.registerSingleton('CacheService', () => new CacheService());
 *   const cache = container.resolve<CacheService>('CacheService');
 */

type Factory<T> = () => T;
type Lifetime = 'singleton' | 'transient';

interface Registration<T = any> {
  factory: Factory<T>;
  lifetime: Lifetime;
  instance?: T;
}

class Container {
  private registrations = new Map<string, Registration>();

  /**
   * Register a service factory with singleton lifetime (default).
   * The factory is called once; subsequent resolves return the same instance.
   */
  registerSingleton<T>(token: string, factory: Factory<T>): void {
    this.registrations.set(token, { factory, lifetime: 'singleton' });
  }

  /**
   * Register a service factory with transient lifetime.
   * A new instance is created on every resolve call.
   */
  registerTransient<T>(token: string, factory: Factory<T>): void {
    this.registrations.set(token, { factory, lifetime: 'transient' });
  }

  /**
   * Register an already-instantiated value as a singleton.
   */
  registerInstance<T>(token: string, instance: T): void {
    this.registrations.set(token, {
      factory: () => instance,
      lifetime: 'singleton',
      instance,
    });
  }

  /**
   * Resolve a service by token.
   * Throws if the token is not registered.
   */
  resolve<T>(token: string): T {
    const reg = this.registrations.get(token);
    if (!reg) {
      throw new Error(`[DI] Service "${token}" is not registered`);
    }

    if (reg.lifetime === 'singleton') {
      if (!reg.instance) {
        reg.instance = reg.factory();
      }
      return reg.instance as T;
    }

    return reg.factory() as T;
  }

  /**
   * Check if a token is registered.
   */
  has(token: string): boolean {
    return this.registrations.has(token);
  }

  /**
   * Reset a specific registration (useful for testing).
   */
  reset(token: string): void {
    const reg = this.registrations.get(token);
    if (reg) {
      reg.instance = undefined;
    }
  }

  /**
   * Clear all registrations (useful for testing).
   */
  clearAll(): void {
    this.registrations.clear();
  }

  /**
   * List all registered tokens (for debugging).
   */
  listTokens(): string[] {
    return Array.from(this.registrations.keys());
  }
}

// Global singleton container
export const container = new Container();

// Service tokens — centralized to avoid magic strings
export const TOKENS = {
  // Infrastructure
  PrismaClient: 'PrismaClient',
  CacheService: 'CacheService',
  Logger: 'Logger',

  // Security
  EncryptionService: 'EncryptionService',
  RBACService: 'RBACService',
  ABACService: 'ABACService',
  KeyManagementService: 'KeyManagementService',
  SecurityMetrics: 'SecurityMetrics',
  QRTokenService: 'QRTokenService',

  // Domain services
  AuthService: 'AuthService',
  PUPService: 'PUPService',
  DirectivesService: 'DirectivesService',
  EmergencyService: 'EmergencyService',
  PanicService: 'PanicService',
  HospitalService: 'HospitalService',
  NotificationService: 'NotificationService',
  DocumentsService: 'DocumentsService',

  // Compliance
  DataRetentionService: 'DataRetentionService',
  AuditTrailService: 'AuditTrailService',
  ConsentService: 'ConsentService',
  ARCOService: 'ARCOService',
  FHIRMapper: 'FHIRMapper',

  // Repositories
  UserRepository: 'UserRepository',
  ProfileRepository: 'ProfileRepository',
  DirectiveRepository: 'DirectiveRepository',
  EmergencyAccessRepository: 'EmergencyAccessRepository',
  AuditLogRepository: 'AuditLogRepository',
} as const;

export type TokenKey = keyof typeof TOKENS;
