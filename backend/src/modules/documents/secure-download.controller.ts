// src/modules/documents/secure-download.controller.ts
/**
 * Controlador de descarga segura de archivos locales
 *
 * Este controlador reemplaza el servicio estático de archivos y añade:
 * - Autenticación JWT para usuarios normales
 * - Validación de propiedad del documento
 * - Soporte para acceso de emergencia con token temporal
 */

import { Router, Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { authMiddleware } from '../../common/guards/auth.middleware';
import config from '../../config';
import { documentEncryptionService } from '../../common/services/document-encryption.service';
import { logger } from '../../common/services/logger.service';
import { cacheService, CACHE_PREFIXES } from '../../common/services/cache.service';
import { downloadTrackingService } from '../../common/services/download-tracking.service';

import { prisma } from '../../common/prisma';

const router = Router();

// Tipo para datos de token de descarga
interface DownloadTokenData {
  s3Key: string;
  expiresAt: string; // ISO string para serialización
  userId?: string;
  emergencyAccessId?: string;
}

/**
 * Genera un token temporal para acceso a un archivo
 * Almacenado en Redis/Cache para persistencia y escalabilidad
 */
export async function generateTemporaryDownloadToken(
  s3Key: string,
  expiresInSeconds: number = 900, // 15 minutos por defecto
  options?: { userId?: string; emergencyAccessId?: string }
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  const tokenData: DownloadTokenData = {
    s3Key,
    expiresAt: expiresAt.toISOString(),
    userId: options?.userId,
    emergencyAccessId: options?.emergencyAccessId,
  };

  await cacheService.set(token, tokenData, {
    prefix: CACHE_PREFIXES.DOWNLOAD_TOKEN,
    ttl: expiresInSeconds,
  });

  return token;
}

/**
 * Genera URL segura para descarga local
 */
export async function getSecureLocalUrl(
  s3Key: string,
  expiresInSeconds: number = 900,
  options?: { userId?: string; emergencyAccessId?: string }
): Promise<string> {
  const token = await generateTemporaryDownloadToken(s3Key, expiresInSeconds, options);
  
  // En desarrollo local (localhost), puerto 3000 es el backend
  let baseUrl = config.backendUrl;
  if (config.env === 'development' && baseUrl.includes('localhost')) {
     baseUrl = baseUrl.replace('5173', '3000');
  }

  return `${baseUrl}/api/v1/secure-download/${token}`;
}

/**
 * GET /api/v1/secure-download/:token
 * Descarga un archivo usando un token temporal
 */
router.get('/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    // Buscar token en cache (Redis o memoria)
    const tokenData = await cacheService.get<DownloadTokenData>(token, {
      prefix: CACHE_PREFIXES.DOWNLOAD_TOKEN,
    });

    if (!tokenData) {
      return res.status(404).json({
        success: false,
        error: { code: 'TOKEN_NOT_FOUND', message: req.t('api:documents.notFound') }
      });
    }

    // Verificar expiración (doble check, el cache ya debería haber expirado)
    if (new Date(tokenData.expiresAt) < new Date()) {
      await cacheService.delete(token, { prefix: CACHE_PREFIXES.DOWNLOAD_TOKEN });
      return res.status(410).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: req.t('api:documents.notFound') }
      });
    }

    // Construir ruta del archivo
    const uploadsPath = path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadsPath, tokenData.s3Key);

    // Validar que la ruta no escape del directorio de uploads (prevenir path traversal)
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(uploadsPath)) {
      logger.error(`[SECURITY] Intento de path traversal detectado: ${tokenData.s3Key}`);
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: req.t('api:generic.notAuthorized') }
      });
    }

    // Verificar que el archivo existe
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: req.t('api:documents.notFound') }
      });
    }

    // Verificar si el archivo está cifrado
    const isEncrypted = await documentEncryptionService.isFileEncrypted(filePath);

    // Obtener información del archivo
    let ext = path.extname(filePath).toLowerCase();
    let originalFileName = path.basename(filePath);

    // Si está cifrado, remover extensión .enc para determinar tipo original
    if (isEncrypted && ext === '.enc') {
      originalFileName = originalFileName.slice(0, -4); // Remover .enc
      ext = path.extname(originalFileName).toLowerCase();
    }

    // Determinar Content-Type
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.heic': 'image/heic',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // Determinar tipo de acceso
    const accessType = tokenData.emergencyAccessId ? 'emergency' : (tokenData.userId ? 'owner' : 'admin');

    // Registrar acceso en tracking (auditoría)
    downloadTrackingService.trackDownload({
      documentKey: tokenData.s3Key,
      userId: tokenData.userId,
      emergencyAccessId: tokenData.emergencyAccessId,
      accessType,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      success: true,
    }).catch(err => {
      logger.error('Error registrando tracking de descarga', err);
    });

    // Log de acceso
    logger.info('Archivo servido via secure-download', {
      s3Key: tokenData.s3Key,
      token: token.substring(0, 8) + '...',
      isEncrypted,
      userId: tokenData.userId,
      emergencyAccessId: tokenData.emergencyAccessId,
    });

    // Headers de seguridad
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${originalFileName}"`);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Permitir embedding en iframes para vista previa de documentos
    // El frontend puede estar en diferentes puertos (5173, 5174 para Vite, 3000 para backend)
    // Sobrescribimos los headers de Helmet para permitir el embedding seguro
    const allowedOrigins = [
      config.frontendUrl,
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      ...config.corsOrigins,
    ].filter((v, i, a) => a.indexOf(v) === i).join(' '); // Eliminar duplicados

    // CSP frame-ancestors permite especificar qué orígenes pueden embeber este contenido
    res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${allowedOrigins}`);
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    if (isEncrypted) {
      // Extraer documentId del nombre del archivo o s3Key para derivar clave
      const documentId = path.basename(tokenData.s3Key).split('.')[0] ||
        path.basename(filePath).split('.')[0];

      try {
        // Descifrar archivo
        const decryptedData = await documentEncryptionService.decryptFile(filePath, documentId);

        res.setHeader('Content-Length', decryptedData.length);
        res.send(decryptedData);

        logger.debug('Archivo descifrado y enviado', { documentId });
      } catch (decryptError) {
        logger.error('Error descifrando archivo', decryptError, {
          filePath,
          documentId,
        });

        // Fallback: enviar archivo sin descifrar (puede no ser visible para el cliente)
        const stat = fs.statSync(filePath);
        res.setHeader('Content-Length', stat.size);
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
      }
    } else {
      // Archivo no cifrado - servir directamente
      const stat = fs.statSync(filePath);
      res.setHeader('Content-Length', stat.size);
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    }

    await cacheService.delete(token, { prefix: CACHE_PREFIXES.DOWNLOAD_TOKEN });

  } catch (error) {
    // Registrar acceso fallido
    const { token } = req.params;
    downloadTrackingService.trackDownload({
      documentKey: token || 'unknown',
      accessType: 'owner',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      success: false,
      errorReason: error instanceof Error ? error.message : 'Unknown error',
    }).catch(() => {});

    logger.error('Error en descarga segura:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DOWNLOAD_ERROR', message: req.t('api:generic.serverError') }
    });
  }
});

/**
 * GET /api/v1/secure-download/document/:documentId
 * Descarga un documento por ID (requiere autenticación)
 */
router.get('/document/:documentId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    const userId = req.userId!;

    // Buscar documento y verificar propiedad
    const document = await prisma.medicalDocument.findFirst({
      where: {
        id: documentId,
        userId: userId,
      },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        error: { code: 'DOCUMENT_NOT_FOUND', message: req.t('api:documents.notFound') }
      });
    }

    // Generar token temporal y redirigir
    const token = await generateTemporaryDownloadToken(document.s3Key, 300, { userId });

    // Redirigir al endpoint de descarga por token
    res.redirect(`/api/v1/secure-download/${token}`);

  } catch (error) {
    logger.error('Error obteniendo documento:', error);
    res.status(500).json({
      success: false,
      error: { code: 'ERROR', message: req.t('api:generic.serverError') }
    });
  }
});

export default router;
