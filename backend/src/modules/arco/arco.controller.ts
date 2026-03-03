// src/modules/arco/arco.controller.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../common/guards/auth.middleware';
import { arcoService } from './arco.service';
import { logger } from '../../common/services/logger.service';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ==================== SCHEMAS ====================

const createRequestSchema = z.object({
  type: z.enum(['ACCESS', 'RECTIFICATION', 'CANCELLATION', 'OPPOSITION']),
  description: z.string().max(2000).optional(),
});

// ==================== USER ENDPOINTS ====================

/**
 * POST /api/v1/arco/request
 * Create a new ARCO request
 */
router.post('/request', async (req: Request, res: Response) => {
  try {
    const parsed = createRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos', details: parsed.error.issues },
      });
    }

    const { type, description } = parsed.data;
    const ipAddress = req.ip;

    // Special handling for CANCELLATION (account deletion)
    if (type === 'CANCELLATION') {
      const result = await arcoService.initiateAccountDeletion(req.userId!, ipAddress);
      return res.status(201).json({
        success: true,
        data: result,
      });
    }

    const request = await arcoService.createRequest(req.userId!, type, description, ipAddress);

    res.status(201).json({
      success: true,
      data: request,
    });
  } catch (error: any) {
    logger.error('Error creating ARCO request', error);
    res.status(error.status || 500).json({
      success: false,
      error: { code: error.code || 'SERVER_ERROR', message: error.message || 'Error al crear solicitud' },
    });
  }
});

/**
 * GET /api/v1/arco/requests
 * List user's ARCO requests
 */
router.get('/requests', async (req: Request, res: Response) => {
  try {
    const requests = await arcoService.getUserRequests(req.userId!);

    res.json({
      success: true,
      data: requests,
    });
  } catch (error: any) {
    logger.error('Error listing ARCO requests', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error al listar solicitudes' },
    });
  }
});

/**
 * GET /api/v1/arco/request/:id
 * Get a specific ARCO request
 */
router.get('/request/:id', async (req: Request, res: Response) => {
  try {
    const request = await arcoService.getRequest(req.userId!, req.params.id);

    res.json({
      success: true,
      data: request,
    });
  } catch (error: any) {
    logger.error('Error getting ARCO request', error);
    res.status(error.status || 500).json({
      success: false,
      error: { code: error.code || 'SERVER_ERROR', message: error.message || 'Error al obtener solicitud' },
    });
  }
});

/**
 * GET /api/v1/arco/export
 * Export all user data (data portability - free for all plans)
 */
router.get('/export', async (req: Request, res: Response) => {
  try {
    // Create ACCESS request automatically
    await arcoService.createRequest(
      req.userId!,
      'ACCESS',
      'Exportación de datos personales (portabilidad)',
      req.ip
    );

    const data = await arcoService.exportUserData(req.userId!);

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    logger.error('Error exporting user data', error);
    res.status(error.status || 500).json({
      success: false,
      error: { code: error.code || 'SERVER_ERROR', message: error.message || 'Error al exportar datos' },
    });
  }
});

/**
 * POST /api/v1/arco/delete-account
 * Initiate account deletion (CANCELLATION)
 */
router.post('/delete-account', async (req: Request, res: Response) => {
  try {
    const result = await arcoService.initiateAccountDeletion(req.userId!, req.ip);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error('Error initiating account deletion', error);
    res.status(error.status || 500).json({
      success: false,
      error: { code: error.code || 'SERVER_ERROR', message: error.message || 'Error al solicitar eliminación' },
    });
  }
});

export default router;
