// src/common/services/cache.service.ts
/**
 * Servicio de Cache con Redis y fallback a memoria
 *
 * Proporciona almacenamiento temporal para:
 * - Tokens MFA pendientes
 * - Tokens de descarga temporal
 * - Idempotencia de webhooks
 * - Rate limiting
 * - Sesiones (opcional)
 *
 * En desarrollo sin Redis, usa almacenamiento en memoria.
 * En producción, Redis es requerido para escalabilidad.
 */

import { createClient, RedisClientType } from 'redis';
import config from '../../config';
import { logger } from './logger.service';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // timestamp
}

interface CacheOptions {
  ttl?: number; // segundos
  prefix?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICIO DE CACHE
// ═══════════════════════════════════════════════════════════════════════════

class CacheService {
  private redis: RedisClientType | null = null;
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  private isRedisConnected: boolean = false;
  private readonly defaultTTL: number = 900; // 15 minutos
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeRedis();
    this.startMemoryCleanup();
  }

  /**
   * Inicializa conexión a Redis si está configurado
   */
  private async initializeRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      logger.info('Redis no configurado, usando cache en memoria', {
        warning: 'No recomendado para producción',
      });
      return;
    }

    try {
      this.redis = createClient({ url: redisUrl });

      this.redis.on('error', (err) => {
        logger.error('Error de conexión Redis', err);
        this.isRedisConnected = false;
      });

      this.redis.on('connect', () => {
        logger.info('Conectado a Redis');
        this.isRedisConnected = true;
      });

      this.redis.on('reconnecting', () => {
        logger.warn('Reconectando a Redis...');
      });

      await this.redis.connect();
    } catch (error) {
      logger.error('No se pudo conectar a Redis, usando memoria', error);
      this.redis = null;
    }
  }

  /**
   * Limpieza periódica del cache en memoria
   */
  private startMemoryCleanup(): void {
    // Limpiar cada 60 segundos
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, entry] of this.memoryCache.entries()) {
        if (entry.expiresAt < now) {
          this.memoryCache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug(`Cache cleanup: ${cleaned} entradas expiradas eliminadas`);
      }
    }, 60000);
  }

  /**
   * Guarda un valor en cache
   */
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const ttl = options?.ttl || this.defaultTTL;
    const fullKey = options?.prefix ? `${options.prefix}:${key}` : key;

    if (this.isRedisConnected && this.redis) {
      try {
        await this.redis.setEx(fullKey, ttl, JSON.stringify(value));
        return;
      } catch (error) {
        logger.error('Error guardando en Redis, usando memoria', error);
      }
    }

    // Fallback a memoria
    this.memoryCache.set(fullKey, {
      value,
      expiresAt: Date.now() + ttl * 1000,
    });
  }

  /**
   * Obtiene un valor del cache
   */
  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    const fullKey = options?.prefix ? `${options.prefix}:${key}` : key;

    if (this.isRedisConnected && this.redis) {
      try {
        const data = await this.redis.get(fullKey);
        return data ? JSON.parse(data) : null;
      } catch (error) {
        logger.error('Error leyendo de Redis, usando memoria', error);
      }
    }

    // Fallback a memoria
    const entry = this.memoryCache.get(fullKey);
    if (!entry) return null;

    if (entry.expiresAt < Date.now()) {
      this.memoryCache.delete(fullKey);
      return null;
    }

    return entry.value;
  }

  /**
   * Elimina un valor del cache
   */
  async delete(key: string, options?: CacheOptions): Promise<void> {
    const fullKey = options?.prefix ? `${options.prefix}:${key}` : key;

    if (this.isRedisConnected && this.redis) {
      try {
        await this.redis.del(fullKey);
      } catch (error) {
        logger.error('Error eliminando de Redis', error);
      }
    }

    this.memoryCache.delete(fullKey);
  }

  /**
   * Verifica si existe una clave
   */
  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    const fullKey = options?.prefix ? `${options.prefix}:${key}` : key;

    if (this.isRedisConnected && this.redis) {
      try {
        const exists = await this.redis.exists(fullKey);
        return exists === 1;
      } catch (error) {
        logger.error('Error verificando existencia en Redis', error);
      }
    }

    const entry = this.memoryCache.get(fullKey);
    if (!entry) return false;

    if (entry.expiresAt < Date.now()) {
      this.memoryCache.delete(fullKey);
      return false;
    }

    return true;
  }

  /**
   * Incrementa un contador (útil para rate limiting)
   */
  async increment(key: string, options?: CacheOptions): Promise<number> {
    const ttl = options?.ttl || this.defaultTTL;
    const fullKey = options?.prefix ? `${options.prefix}:${key}` : key;

    if (this.isRedisConnected && this.redis) {
      try {
        const result = await this.redis.incr(fullKey);
        // Establecer TTL solo en la primera vez
        if (result === 1) {
          await this.redis.expire(fullKey, ttl);
        }
        return result;
      } catch (error) {
        logger.error('Error incrementando en Redis', error);
      }
    }

    // Fallback a memoria
    const entry = this.memoryCache.get(fullKey);
    const now = Date.now();

    if (!entry || entry.expiresAt < now) {
      this.memoryCache.set(fullKey, {
        value: 1,
        expiresAt: now + ttl * 1000,
      });
      return 1;
    }

    entry.value = (entry.value as number) + 1;
    return entry.value;
  }

  /**
   * Obtiene múltiples valores usando MGET (Redis) o batch en memoria
   */
  async getMany<T>(keys: string[], options?: CacheOptions): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    const prefix = options?.prefix;
    const fullKeys = keys.map(k => prefix ? `${prefix}:${k}` : k);

    if (this.isRedisConnected && this.redis) {
      try {
        const values = await this.redis.mGet(fullKeys);
        for (let i = 0; i < keys.length; i++) {
          if (values[i] !== null) {
            result.set(keys[i], JSON.parse(values[i]!) as T);
          }
        }
        return result;
      } catch (error) {
        logger.error('Error en MGET de Redis, usando memoria', error);
      }
    }

    // Fallback a memoria
    const now = Date.now();
    for (let i = 0; i < keys.length; i++) {
      const entry = this.memoryCache.get(fullKeys[i]);
      if (entry && entry.expiresAt >= now) {
        result.set(keys[i], entry.value);
      }
    }

    return result;
  }

  /**
   * Elimina todas las claves con un prefijo usando SCAN (no bloquea Redis)
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    let deleted = 0;

    if (this.isRedisConnected && this.redis) {
      try {
        let cursor = '0';
        do {
          const result = await this.redis.scan(cursor, {
            MATCH: `${prefix}:*`,
            COUNT: 100,
          });
          cursor = result.cursor;
          if (result.keys.length > 0) {
            deleted += await this.redis.del(result.keys);
          }
        } while (cursor !== '0');
      } catch (error) {
        logger.error('Error eliminando por prefijo en Redis', error);
      }
    }

    // También limpiar memoria
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(`${prefix}:`)) {
        this.memoryCache.delete(key);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Obtiene estadísticas del cache
   */
  getStats(): {
    type: 'redis' | 'memory';
    connected: boolean;
    memoryEntries: number;
    memorySize: string;
  } {
    const memoryEntries = this.memoryCache.size;

    // Estimación aproximada del tamaño en memoria
    let memorySize = 0;
    for (const [key, entry] of this.memoryCache.entries()) {
      memorySize += key.length * 2; // caracteres UTF-16
      memorySize += JSON.stringify(entry.value).length * 2;
      memorySize += 16; // overhead del objeto
    }

    return {
      type: this.isRedisConnected ? 'redis' : 'memory',
      connected: this.isRedisConnected,
      memoryEntries,
      memorySize: `${(memorySize / 1024).toFixed(2)} KB`,
    };
  }

  /**
   * Verifica la salud del servicio
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details: any }> {
    if (this.isRedisConnected && this.redis) {
      try {
        await this.redis.ping();
        return {
          status: 'healthy',
          details: { backend: 'redis', ...this.getStats() },
        };
      } catch {
        return {
          status: 'degraded',
          details: { backend: 'memory (redis failed)', ...this.getStats() },
        };
      }
    }

    // En producción sin Redis es unhealthy
    if (config.env === 'production') {
      return {
        status: 'unhealthy',
        details: { backend: 'memory (redis not configured)', ...this.getStats() },
      };
    }

    return {
      status: 'degraded',
      details: { backend: 'memory', ...this.getStats() },
    };
  }

  /**
   * Cierra conexiones
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    if (this.redis) {
      await this.redis.quit();
    }

    this.memoryCache.clear();
    logger.info('Cache service shutdown complete');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PREFIJOS ESTÁNDAR
// ═══════════════════════════════════════════════════════════════════════════

export const CACHE_PREFIXES = {
  MFA_PENDING: 'mfa:pending',
  MFA_LOGIN: 'mfa:login',
  DOWNLOAD_TOKEN: 'download:token',
  WEBHOOK_IDEMPOTENCY: 'webhook:idem',
  RATE_LIMIT: 'rate:limit',
  SESSION: 'session',
  EMERGENCY_ACCESS: 'emergency:access',
  CURP_VERIFICATION: 'curp:verify',
  DOWNLOAD_TRACKING: 'download:track',
  RBAC_PERMISSIONS: 'rbac:perms',
  RBAC_ROLES: 'rbac:roles',
} as const;

// Singleton
export const cacheService = new CacheService();
export default cacheService;

// ═══════════════════════════════════════════════════════════════════════════
// REDIS STORE PARA EXPRESS-RATE-LIMIT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Custom Redis store compatible con express-rate-limit v7.
 * Usa el cacheService singleton — fallback a memoria si Redis no disponible.
 */
export class CacheRateLimitStore {
  prefix: string;
  private windowMs: number = 0;

  constructor(prefix = 'rl') {
    this.prefix = prefix;
  }

  init(options: { windowMs: number }) {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date | undefined }> {
    const fullKey = `${this.prefix}:${key}`;
    const ttlSeconds = Math.ceil(this.windowMs / 1000);
    const totalHits = await cacheService.increment(fullKey, { ttl: ttlSeconds });
    const resetTime = new Date(Date.now() + this.windowMs);
    return { totalHits, resetTime };
  }

  async decrement(key: string): Promise<void> {
    // Not needed for basic rate limiting — no-op
  }

  async resetKey(key: string): Promise<void> {
    await cacheService.delete(`${this.prefix}:${key}`);
  }
}
