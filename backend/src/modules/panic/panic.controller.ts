// src/modules/panic/panic.controller.ts
import { logger } from '../../common/services/logger.service';
import { Router, Request, Response } from 'express';
import { panicService } from './panic.service';
import { authMiddleware } from '../../common/guards/auth.middleware';
import { isValidCoordinates } from '../../common/utils/geolocation';

const router = Router();

// Todas las rutas requieren autenticacion
router.use(authMiddleware);

/**
 * POST /api/v1/emergency/panic
 * Activa una alerta de panico
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { latitude, longitude, accuracy, message } = req.body;

    // Validar coordenadas (null y undefined son GPS no disponible)
    const hasCoordinates = latitude != null && longitude != null;

    if (hasCoordinates && !isValidCoordinates(latitude, longitude)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_LOCATION',
          message: req.t('api:panic.invalidCoordinates'),
        },
      });
    }

    // Activar alerta de panico (funciona con o sin coordenadas)
    const result = await panicService.activatePanic({
      userId,
      latitude: hasCoordinates ? latitude : undefined,
      longitude: hasCoordinates ? longitude : undefined,
      accuracy: hasCoordinates ? accuracy : undefined,
      message,
    });

    return res.status(201).json({
      success: true,
      data: result,
      message: req.t('api:panic.activated'),
    });
  } catch (error: any) {
    logger.error('Error activando alerta de panico:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'PANIC_ERROR',
        message: error.message || req.t('api:generic.serverError'),
      },
    });
  }
});

/**
 * DELETE /api/v1/emergency/panic/:alertId
 * Cancela una alerta de panico activa
 */
router.delete('/:alertId', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { alertId } = req.params;

    await panicService.cancelPanic(alertId, userId);

    return res.json({
      success: true,
      message: req.t('api:panic.cancelled'),
    });
  } catch (error: any) {
    logger.error('Error cancelando alerta de panico:', error);

    if (error.message === 'Alerta no encontrada o ya no esta activa') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: req.t('api:panic.notActive'),
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'CANCEL_ERROR',
        message: req.t('api:generic.serverError'),
      },
    });
  }
});

/**
 * GET /api/v1/emergency/panic/active
 * Obtiene alertas activas del usuario
 */
router.get('/active', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const alerts = await panicService.getActiveAlerts(userId);

    return res.json({
      success: true,
      data: {
        alerts,
        count: alerts.length,
      },
    });
  } catch (error: any) {
    logger.error('Error obteniendo alertas activas:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: req.t('api:generic.serverError'),
      },
    });
  }
});

/**
 * GET /api/v1/emergency/panic/history
 * Obtiene historial de alertas
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const limit = parseInt(req.query.limit as string) || 10;

    const alerts = await panicService.getAlertHistory(userId, limit);

    return res.json({
      success: true,
      data: {
        alerts,
        count: alerts.length,
      },
    });
  } catch (error: any) {
    logger.error('Error obteniendo historial de alertas:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: req.t('api:generic.serverError'),
      },
    });
  }
});

/**
 * GET /api/v1/emergency/panic/:alertId
 * Obtiene una alerta especifica
 */
router.get('/:alertId', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { alertId } = req.params;

    const alert = await panicService.getAlertById(alertId, userId);

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: req.t('api:panic.notFound'),
        },
      });
    }

    return res.json({
      success: true,
      data: { alert },
    });
  } catch (error: any) {
    logger.error('Error obteniendo alerta:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: req.t('api:generic.serverError'),
      },
    });
  }
});

export default router;
