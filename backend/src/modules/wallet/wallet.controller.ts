// src/modules/wallet/wallet.controller.ts
import { logger } from '../../common/services/logger.service';
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../common/guards/auth.middleware';
import { walletService } from './wallet.service';
import { pupService } from '../pup/pup.service';
import { premiumFeaturesService } from '../payments/services/premium-features.service';
import { config } from '../../config';

import { prisma } from '../../common/prisma';

const router = Router();

/**
 * GET /api/v1/wallet/status
 * Obtiene el estado de configuración de los wallets
 */
router.get('/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const status = walletService.getStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: req.t('api:wallet.statusError') },
    });
  }
});

/**
 * GET /api/v1/wallet/apple-pass
 * Genera y descarga un pase de Apple Wallet (.pkpass)
 */
router.get('/apple-pass', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Verificar que Apple Wallet está configurado
    if (!walletService.getStatus().appleWallet.configured) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'APPLE_WALLET_NOT_CONFIGURED',
          message: req.t('api:wallet.appleNotConfigured'),
        },
      });
    }

    // Obtener datos del usuario
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        representatives: {
          where: { notifyOnEmergency: true },
          orderBy: { priority: 'asc' },
          take: 1,
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: req.t('api:wallet.userNotFound') },
      });
    }

    // Obtener perfil médico
    const profile = await pupService.getProfile(userId);

    if (!profile?.qrToken) {
      return res.status(400).json({
        success: false,
        error: { message: req.t('api:wallet.emergencyProfileNotConfigured') },
      });
    }

    // Construir URL de emergencia
    const emergencyUrl = `${config.frontendUrl}/emergency/${profile.qrToken}`;

    // Verificar límite de descargas
    const canDownload = await premiumFeaturesService.canDownloadQR(userId);
    if (!canDownload.allowed) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'DOWNLOAD_LIMIT_REACHED',
          message: req.t('api:wallet.downloadLimitReached', { limit: canDownload.limit }),
          limit: canDownload.limit,
          current: canDownload.current,
        },
      });
    }

    // Generar el pase
    const passBuffer = await walletService.generateApplePass({
      id: user.id,
      name: user.name,
      bloodType: profile?.bloodType || undefined,
      allergies: profile?.allergies || [],
      conditions: profile?.conditions || [],
      emergencyContact: user.representatives[0]
        ? {
            name: user.representatives[0].name,
            phone: user.representatives[0].phone,
          }
        : undefined,
      emergencyUrl,
    });

    // Registrar la descarga
    await premiumFeaturesService.trackQRDownload(userId, 'wallet', {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Enviar como archivo .pkpass
    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="vida-emergencia-${user.id.slice(0, 8)}.pkpass"`,
      'Content-Length': passBuffer.length,
    });

    res.send(passBuffer);
  } catch (error: any) {
    logger.error('Error generando Apple Pass:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'APPLE_PASS_GENERATION_ERROR',
        message: error.message || req.t('api:wallet.applePassError'),
      },
    });
  }
});

/**
 * GET /api/v1/wallet/google-pass-url
 * Obtiene la URL para agregar el pase a Google Wallet
 */
router.get('/google-pass-url', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Verificar que Google Wallet está configurado
    if (!walletService.getStatus().googleWallet.configured) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'GOOGLE_WALLET_NOT_CONFIGURED',
          message: req.t('api:wallet.googleNotConfigured'),
        },
      });
    }

    // Obtener datos del usuario
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        representatives: {
          where: { notifyOnEmergency: true },
          orderBy: { priority: 'asc' },
          take: 1,
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: req.t('api:wallet.userNotFound') },
      });
    }

    // Obtener perfil médico
    const profile = await pupService.getProfile(userId);

    if (!profile?.qrToken) {
      return res.status(400).json({
        success: false,
        error: { message: req.t('api:wallet.emergencyProfileNotConfigured') },
      });
    }

    // Construir URL de emergencia
    const emergencyUrl = `${config.frontendUrl}/emergency/${profile.qrToken}`;

    // Verificar límite de descargas
    const canDownload = await premiumFeaturesService.canDownloadQR(userId);
    if (!canDownload.allowed) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'DOWNLOAD_LIMIT_REACHED',
          message: req.t('api:wallet.downloadLimitReached', { limit: canDownload.limit }),
          limit: canDownload.limit,
          current: canDownload.current,
        },
      });
    }

    // Generar URL del pase
    const passUrl = await walletService.getGoogleWalletUrl({
      id: user.id,
      name: user.name,
      bloodType: profile?.bloodType || undefined,
      allergies: profile?.allergies || [],
      conditions: profile?.conditions || [],
      emergencyContact: user.representatives[0]
        ? {
            name: user.representatives[0].name,
            phone: user.representatives[0].phone,
          }
        : undefined,
      emergencyUrl,
    });

    // Registrar la descarga
    await premiumFeaturesService.trackQRDownload(userId, 'wallet', {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      data: {
        url: passUrl,
      },
    });
  } catch (error: any) {
    logger.error('Error generando Google Pass URL:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GOOGLE_PASS_GENERATION_ERROR',
        message: error.message || req.t('api:wallet.googlePassError'),
      },
    });
  }
});

export default router;
