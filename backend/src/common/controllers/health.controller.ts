// src/common/controllers/health.controller.ts
/**
 * Controlador de Health Check y Métricas
 *
 * Endpoints para monitoreo del sistema:
 * - /health - Estado básico (para load balancers)
 * - /health/detailed - Estado detallado con checks
 * - /health/metrics - Métricas del sistema
 * - /health/ready - Readiness probe (Kubernetes)
 * - /health/live - Liveness probe (Kubernetes)
 */

import { Router, Request, Response } from 'express';
import { systemMetricsService } from '../services/system-metrics.service';
import { securityMetrics } from '../services/security-metrics.service';
import { logArchiverService } from '../services/log-archiver.service';
import { adminAuthMiddleware } from '../guards/admin-auth.middleware';

const router = Router();

/**
 * GET /health
 * Health check básico para load balancers
 * Retorna 200 si el servidor está respondiendo
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const health = await systemMetricsService.getHealth();

    // Para load balancers: 200 = healthy, 503 = unhealthy
    const statusCode = health.status === 'unhealthy' ? 503 : 200;

    res.status(statusCode).json({
      status: health.status,
      timestamp: health.timestamp,
      uptime: health.uptime,
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

/**
 * GET /health/detailed
 * Health check detallado con todos los checks
 */
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const health = await systemMetricsService.getHealth();

    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_ERROR',
        message: 'Error performing health check',
      },
    });
  }
});

/**
 * GET /health/live
 * Kubernetes liveness probe
 * Verifica si la aplicación está viva (no en deadlock)
 */
router.get('/live', (req: Request, res: Response) => {
  // Si podemos responder, estamos vivos
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/ready
 * Kubernetes readiness probe
 * Verifica si la aplicación está lista para recibir tráfico
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const health = await systemMetricsService.getHealth();

    // No estamos listos si la DB no está conectada
    if (health.checks.database.status === 'error') {
      return res.status(503).json({
        status: 'not_ready',
        reason: 'Database not connected',
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      reason: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/metrics
 * Métricas del sistema (requiere autenticación admin)
 */
router.get('/metrics', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const [systemMetrics, appMetrics, securitySummary] = await Promise.all([
      systemMetricsService.getSystemMetrics(),
      systemMetricsService.getApplicationMetrics(),
      securityMetrics.getMetricsSummary(),
    ]);

    res.json({
      success: true,
      data: {
        system: systemMetrics,
        application: appMetrics,
        security: securitySummary,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'METRICS_ERROR',
        message: 'Error fetching metrics',
      },
    });
  }
});

/**
 * GET /health/dashboard
 * Resumen completo para dashboard de admin
 */
router.get('/dashboard', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const summary = await systemMetricsService.getDashboardSummary();
    const recentAlerts = await securityMetrics.getRecentAlerts(10);
    const logStats = await logArchiverService.getStats();

    res.json({
      success: true,
      data: {
        ...summary,
        recentAlerts,
        logStats,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DASHBOARD_ERROR',
        message: 'Error fetching dashboard data',
      },
    });
  }
});

/**
 * GET /health/alerts
 * Alertas de seguridad recientes
 */
router.get('/alerts', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const alerts = await securityMetrics.getRecentAlerts(limit);

    res.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'ALERTS_ERROR',
        message: 'Error fetching alerts',
      },
    });
  }
});

/**
 * GET /health/logs/search
 * Buscar en logs (admin only)
 */
router.get('/logs/search', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 100;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_QUERY',
          message: 'Search query is required',
        },
      });
    }

    const results = await logArchiverService.searchLogs(query, { limit });

    res.json({
      success: true,
      data: {
        query,
        count: results.length,
        results,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SEARCH_ERROR',
        message: 'Error searching logs',
      },
    });
  }
});

/**
 * GET /health/logs/stats
 * Estadísticas de logs
 */
router.get('/logs/stats', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const stats = await logArchiverService.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'STATS_ERROR',
        message: 'Error fetching log stats',
      },
    });
  }
});

export default router;
