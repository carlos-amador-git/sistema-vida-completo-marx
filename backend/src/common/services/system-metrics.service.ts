// src/common/services/system-metrics.service.ts
/**
 * Servicio de Métricas del Sistema
 *
 * Monitorea la salud y rendimiento del sistema:
 * - Uso de memoria
 * - Uso de CPU
 * - Conexiones a base de datos
 * - Conexiones a Redis
 * - Latencia de servicios externos
 * - Métricas de aplicación
 */

import * as os from 'os';
import config from '../../config';
import { cacheService } from './cache.service';
import { logger } from './logger.service';

import { prisma } from '../prisma';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    database: HealthCheck;
    cache: HealthCheck;
    memory: HealthCheck;
    disk: HealthCheck;
  };
}

export interface HealthCheck {
  status: 'ok' | 'warning' | 'error';
  message?: string;
  latency?: number;
  details?: Record<string, any>;
}

export interface SystemMetrics {
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  cpu: {
    cores: number;
    loadAverage: number[];
    usagePercent: number;
  };
  process: {
    uptime: number;
    pid: number;
    memoryUsage: {
      heapUsed: number;
      heapTotal: number;
      external: number;
      rss: number;
    };
  };
  database: {
    connected: boolean;
    poolSize?: number;
    activeConnections?: number;
  };
  cache: {
    type: 'redis' | 'memory';
    connected: boolean;
    memoryUsage?: number;
  };
}

export interface ApplicationMetrics {
  requests: {
    total: number;
    successful: number;
    failed: number;
    avgLatency: number;
  };
  users: {
    total: number;
    active: number;
    newToday: number;
  };
  subscriptions: {
    total: number;
    active: number;
    premium: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICIO
// ═══════════════════════════════════════════════════════════════════════════

class SystemMetricsService {
  private requestMetrics = {
    total: 0,
    successful: 0,
    failed: 0,
    totalLatency: 0,
  };

  private startTime: number = Date.now();

  /**
   * Obtiene el estado de salud general del sistema
   */
  async getHealth(): Promise<SystemHealth> {
    const [dbCheck, cacheCheck, memoryCheck, diskCheck] = await Promise.all([
      this.checkDatabase(),
      this.checkCache(),
      this.checkMemory(),
      this.checkDisk(),
    ]);

    // Determinar estado general
    const checks = { database: dbCheck, cache: cacheCheck, memory: memoryCheck, disk: diskCheck };
    const statuses = Object.values(checks).map(c => c.status);

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (statuses.includes('error')) {
      overallStatus = 'unhealthy';
    } else if (statuses.includes('warning')) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: process.env.npm_package_version || '1.0.0',
      environment: config.env,
      checks,
    };
  }

  /**
   * Obtiene métricas del sistema
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const cpus = os.cpus();

    // Calcular uso de CPU aproximado
    let cpuUsage = 0;
    const loadAvg = os.loadavg();
    if (cpus.length > 0) {
      cpuUsage = (loadAvg[0] / cpus.length) * 100;
    }

    // Estado de base de datos
    let dbConnected = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    // Estado de cache
    const cacheHealth = await cacheService.healthCheck();
    const cacheBackend = cacheHealth.details?.backend as string || 'unknown';

    return {
      memory: {
        total: totalMem,
        used: totalMem - freeMem,
        free: freeMem,
        usagePercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
      },
      cpu: {
        cores: cpus.length,
        loadAverage: loadAvg,
        usagePercent: Math.round(cpuUsage),
      },
      process: {
        uptime: process.uptime(),
        pid: process.pid,
        memoryUsage: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external,
          rss: memUsage.rss,
        },
      },
      database: {
        connected: dbConnected,
      },
      cache: {
        type: cacheBackend.includes('redis') ? 'redis' : 'memory',
        connected: cacheHealth.status === 'healthy',
      },
    };
  }

  /**
   * Obtiene métricas de la aplicación
   */
  async getApplicationMetrics(): Promise<ApplicationMetrics> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Contar usuarios
    const [totalUsers, activeUsers, newUsersToday] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          lastLoginAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 días
          },
        },
      }),
      prisma.user.count({
        where: {
          createdAt: { gte: startOfDay },
        },
      }),
    ]);

    // Contar suscripciones
    const [totalSubs, activeSubs, premiumSubs] = await Promise.all([
      prisma.subscription.count(),
      prisma.subscription.count({
        where: { status: 'ACTIVE' },
      }),
      prisma.subscription.count({
        where: {
          status: 'ACTIVE',
          plan: {
            slug: { not: 'free' },
          },
        },
      }),
    ]);

    return {
      requests: {
        total: this.requestMetrics.total,
        successful: this.requestMetrics.successful,
        failed: this.requestMetrics.failed,
        avgLatency: this.requestMetrics.total > 0
          ? Math.round(this.requestMetrics.totalLatency / this.requestMetrics.total)
          : 0,
      },
      users: {
        total: totalUsers,
        active: activeUsers,
        newToday: newUsersToday,
      },
      subscriptions: {
        total: totalSubs,
        active: activeSubs,
        premium: premiumSubs,
      },
    };
  }

  /**
   * Registra una métrica de request
   */
  recordRequest(statusCode: number, latency: number): void {
    this.requestMetrics.total++;
    this.requestMetrics.totalLatency += latency;

    if (statusCode >= 200 && statusCode < 400) {
      this.requestMetrics.successful++;
    } else {
      this.requestMetrics.failed++;
    }
  }

  /**
   * Obtiene resumen para dashboard
   */
  async getDashboardSummary(): Promise<{
    health: SystemHealth;
    metrics: SystemMetrics;
    application: ApplicationMetrics;
  }> {
    const [health, metrics, application] = await Promise.all([
      this.getHealth(),
      this.getSystemMetrics(),
      this.getApplicationMetrics(),
    ]);

    return { health, metrics, application };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECKS INDIVIDUALES
  // ═══════════════════════════════════════════════════════════════════════════

  private async checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();

    try {
      await prisma.$queryRaw`SELECT 1`;
      const latency = Date.now() - start;

      return {
        status: latency > 1000 ? 'warning' : 'ok',
        message: latency > 1000 ? 'High latency' : 'Connected',
        latency,
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Database connection failed',
      };
    }
  }

  private async checkCache(): Promise<HealthCheck> {
    try {
      const health = await cacheService.healthCheck();
      const backend = health.details?.backend as string || 'unknown';

      return {
        status: health.status === 'healthy' ? 'ok' : health.status === 'degraded' ? 'warning' : 'error',
        message: `Using ${backend}`,
        details: health,
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Cache check failed',
      };
    }
  }

  private checkMemory(): HealthCheck {
    const usage = process.memoryUsage();
    const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;

    if (heapUsedPercent > 90) {
      return {
        status: 'error',
        message: `Heap usage critical: ${heapUsedPercent.toFixed(1)}%`,
        details: {
          heapUsed: this.formatBytes(usage.heapUsed),
          heapTotal: this.formatBytes(usage.heapTotal),
          rss: this.formatBytes(usage.rss),
        },
      };
    }

    if (heapUsedPercent > 75) {
      return {
        status: 'warning',
        message: `Heap usage high: ${heapUsedPercent.toFixed(1)}%`,
        details: {
          heapUsed: this.formatBytes(usage.heapUsed),
          heapTotal: this.formatBytes(usage.heapTotal),
        },
      };
    }

    return {
      status: 'ok',
      message: `Heap usage: ${heapUsedPercent.toFixed(1)}%`,
      details: {
        heapUsed: this.formatBytes(usage.heapUsed),
        heapTotal: this.formatBytes(usage.heapTotal),
      },
    };
  }

  private checkDisk(): HealthCheck {
    // En Node.js no tenemos acceso fácil al disco sin paquetes externos
    // Retornamos OK por defecto
    return {
      status: 'ok',
      message: 'Disk check not implemented (use monitoring service)',
    };
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let value = bytes;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${value.toFixed(2)} ${units[unitIndex]}`;
  }
}

export const systemMetricsService = new SystemMetricsService();
export default systemMetricsService;
