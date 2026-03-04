// src/modules/legal/legal.controller.ts
import { Router, Request, Response } from 'express';
import { privacyNotice, privacyNoticeSimplified } from './privacy-notice';
import { logger } from '../../common/services/logger.service';

const router = Router();

/**
 * GET /api/v1/legal/privacy-notice
 * Returns the full LFPDPPP-compliant privacy notice as structured data.
 * Public endpoint — no authentication required.
 */
router.get('/privacy-notice', (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: privacyNotice,
    });
  } catch (error) {
    logger.error('Error al obtener aviso de privacidad completo', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Error al obtener el aviso de privacidad',
      },
    });
  }
});

/**
 * GET /api/v1/legal/privacy-notice/simplified
 * Returns the simplified privacy notice for registration flows and small screens.
 * Public endpoint — no authentication required.
 */
router.get('/privacy-notice/simplified', (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: privacyNoticeSimplified,
    });
  } catch (error) {
    logger.error('Error al obtener aviso de privacidad simplificado', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Error al obtener el aviso de privacidad simplificado',
      },
    });
  }
});

export default router;
