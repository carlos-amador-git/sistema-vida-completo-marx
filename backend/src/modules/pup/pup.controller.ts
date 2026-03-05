// src/modules/pup/pup.controller.ts
import { logger } from '../../common/services/logger.service';
import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authMiddleware } from '../../common/guards/auth.middleware';
import { pupService } from './pup.service';
import { premiumFeaturesService } from '../payments/services/premium-features.service';
import { generateQRBuffer, generateQRSVG } from '../../common/utils/qr-generator';
import config from '../../config';

const router = Router();

// Todos los endpoints requieren autenticación
router.use(authMiddleware);

/**
 * GET /api/v1/profile
 * Obtiene el perfil del usuario actual
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const profile = await pupService.getProfile(req.userId!);
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: req.t('api:pup.profileNotFound') },
      });
    }
    
    res.json({
      success: true,
      data: { profile },
    });
  } catch (error) {
    logger.error('Error obteniendo perfil:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: req.t('api:generic.serverError') },
    });
  }
});

/**
 * PUT /api/v1/profile
 * Actualiza el perfil del usuario
 */
router.put('/',
  body('bloodType').optional().isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  body('allergies').optional().isArray(),
  body('conditions').optional().isArray(),
  body('medications').optional().isArray(),
  body('insuranceProvider').optional().isString(),
  body('insurancePolicy').optional().isString(),
  body('insurancePhone').optional().isString(),
  body('isDonor').optional().isBoolean(),
  body('donorPreferences').optional().isObject(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const profile = await pupService.updateProfile(req.userId!, req.body);

      // Regenerar documento PDF del perfil médico en background
      pupService.generateProfileDocument(req.userId!).catch(err => {
        logger.error('Error generando documento de perfil en background:', err);
      });

      res.json({
        success: true,
        data: { profile },
      });
    } catch (error) {
      logger.error('Error actualizando perfil:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: req.t('api:generic.serverError') },
      });
    }
  }
);

/**
 * POST /api/v1/profile/generate-document
 * Genera manualmente el documento PDF del perfil médico
 */
router.post('/generate-document', async (req: Request, res: Response) => {
  try {
    const result = await pupService.generateProfileDocument(req.userId!);

    if (!result) {
      return res.status(500).json({
        success: false,
        error: { code: 'GENERATION_FAILED', message: req.t('api:pup.documentGenerationFailed') },
      });
    }

    res.json({
      success: true,
      message: req.t('api:pup.documentGenerated'),
      data: result,
    });
  } catch (error) {
    logger.error('Error generando documento de perfil:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: req.t('api:generic.serverError') },
    });
  }
});

/**
 * POST /api/v1/profile/photo
 * Actualiza la foto de perfil
 * Espera el URL de la imagen (después de subir a S3)
 */
router.post('/photo',
  body('photoUrl').isURL().withMessage('URL de imagen inválido'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }
      
      const profile = await pupService.updatePhoto(req.userId!, req.body.photoUrl);
      
      res.json({
        success: true,
        data: { profile },
      });
    } catch (error) {
      logger.error('Error actualizando foto:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: req.t('api:generic.serverError') },
      });
    }
  }
);

/**
 * GET /api/v1/profile/share-info
 * Obtiene info para compartir el perfil médico (URL de emergencia + QR + documento)
 */
router.get('/share-info', async (req: Request, res: Response) => {
  try {
    const shareInfo = await pupService.getShareInfo(req.userId!);

    res.json({
      success: true,
      data: shareInfo,
    });
  } catch (error) {
    logger.error('Error obteniendo share info:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: req.t('api:generic.serverError') },
    });
  }
});

/**
 * GET /api/v1/profile/qr
 * Obtiene el código QR del usuario
 */
router.get('/qr', async (req: Request, res: Response) => {
  try {
    const qrData = await pupService.getQR(req.userId!);
    
    if (!qrData) {
      return res.status(404).json({
        success: false,
        error: { code: 'QR_NOT_FOUND', message: req.t('api:pup.qrNotFound') },
      });
    }
    
    res.json({
      success: true,
      data: qrData,
    });
  } catch (error) {
    logger.error('Error obteniendo QR:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: req.t('api:generic.serverError') },
    });
  }
});

/**
 * POST /api/v1/profile/qr/regenerate
 * Regenera el código QR (invalida el anterior)
 */
router.post('/qr/regenerate', async (req: Request, res: Response) => {
  try {
    const qrData = await pupService.regenerateQR(req.userId!);
    
    res.json({
      success: true,
      message: req.t('api:pup.qrRegenerated'),
      data: qrData,
    });
  } catch (error) {
    logger.error('Error regenerando QR:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: req.t('api:generic.serverError') },
    });
  }
});

/**
 * GET /api/v1/profile/qr/download/:format
 * Descarga el código QR en el formato especificado (png, svg)
 * Verifica límites de descarga según plan del usuario
 */
router.get('/qr/download/:format', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const format = req.params.format.toLowerCase() as 'png' | 'svg';

    if (!['png', 'svg'].includes(format)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_FORMAT', message: req.t('api:pup.invalidQrFormat') },
      });
    }

    // Verificar límite de descargas
    const canDownload = await premiumFeaturesService.canDownloadQR(userId);
    if (!canDownload.allowed) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'DOWNLOAD_LIMIT_REACHED',
          message: req.t('api:pup.downloadLimitReached'),
          limit: canDownload.limit,
          current: canDownload.current,
        },
      });
    }

    // Obtener QR token
    const qrData = await pupService.getQR(userId);
    if (!qrData) {
      return res.status(404).json({
        success: false,
        error: { code: 'QR_NOT_FOUND', message: req.t('api:pup.qrNotFound') },
      });
    }

    const emergencyUrl = `${config.frontendUrl}/emergency/${qrData.qrToken}`;

    // Registrar la descarga
    await premiumFeaturesService.trackQRDownload(userId, format, {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (format === 'png') {
      const buffer = await generateQRBuffer(emergencyUrl);
      res.set({
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="vida-qr-${userId.slice(0, 8)}.png"`,
        'Content-Length': buffer.length,
      });
      return res.send(buffer);
    } else {
      const svg = await generateQRSVG(emergencyUrl);
      res.set({
        'Content-Type': 'image/svg+xml',
        'Content-Disposition': `attachment; filename="vida-qr-${userId.slice(0, 8)}.svg"`,
      });
      return res.send(svg);
    }
  } catch (error) {
    logger.error('Error descargando QR:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: req.t('api:generic.serverError') },
    });
  }
});

/**
 * GET /api/v1/profile/qr/stats
 * Obtiene estadísticas de descargas QR del usuario
 */
router.get('/qr/stats', async (req: Request, res: Response) => {
  try {
    const stats = await premiumFeaturesService.getQRDownloadStats(req.userId!);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error obteniendo stats QR:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: req.t('api:generic.serverError') },
    });
  }
});

export default router;
