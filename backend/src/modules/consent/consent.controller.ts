// src/modules/consent/consent.controller.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../common/guards/auth.middleware';
import { consentService } from './consent.service';
import { logger } from '../../common/services/logger.service';

const router = Router();

// ==================== PUBLIC ENDPOINTS ====================

/**
 * GET /api/v1/consent/policy
 * Get the currently active privacy policy
 */
router.get('/policy', async (req: Request, res: Response) => {
  try {
    const policy = await consentService.getActivePolicy();

    if (!policy) {
      return res.status(404).json({
        success: false,
        error: { code: 'NO_POLICY', message: 'No hay política de privacidad publicada' },
      });
    }

    res.json({
      success: true,
      data: {
        id: policy.id,
        version: policy.version,
        content: policy.content,
        summary: policy.summary,
        publishedAt: policy.publishedAt,
      },
    });
  } catch (error: any) {
    logger.error('Error getting active policy', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error al obtener política' },
    });
  }
});

// ==================== AUTHENTICATED ENDPOINTS ====================

const acceptPolicySchema = z.object({
  policyVersionId: z.string().uuid('ID de versión inválido'),
  scope: z.array(z.string()).min(1).default(['essential']),
});

/**
 * POST /api/v1/consent/accept
 * Accept the privacy policy
 */
router.post('/accept', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = acceptPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Datos inválidos',
          details: parsed.error.issues,
        },
      });
    }

    const { policyVersionId, scope } = parsed.data;
    const ipAddress = req.ip;
    const userAgent = req.get('User-Agent');

    const consent = await consentService.acceptPolicy(
      req.userId!,
      policyVersionId,
      ipAddress,
      userAgent,
      scope
    );

    res.status(201).json({
      success: true,
      data: consent,
    });
  } catch (error: any) {
    logger.error('Error accepting policy', error);
    res.status(error.status || 500).json({
      success: false,
      error: { code: error.code || 'SERVER_ERROR', message: error.message || 'Error al aceptar política' },
    });
  }
});

/**
 * GET /api/v1/consent/status
 * Check if user has accepted the current policy
 */
router.get('/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const hasAccepted = await consentService.hasAcceptedCurrentPolicy(req.userId!);
    const activePolicy = await consentService.getActivePolicy();

    res.json({
      success: true,
      data: {
        hasAcceptedCurrentPolicy: hasAccepted,
        currentPolicyVersion: activePolicy?.version || null,
        currentPolicyId: activePolicy?.id || null,
      },
    });
  } catch (error: any) {
    logger.error('Error checking consent status', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error al verificar consentimiento' },
    });
  }
});

/**
 * GET /api/v1/consent/history
 * Get user's consent history
 */
router.get('/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const history = await consentService.getUserConsentHistory(req.userId!);

    res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    logger.error('Error getting consent history', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error al obtener historial' },
    });
  }
});

export default router;
