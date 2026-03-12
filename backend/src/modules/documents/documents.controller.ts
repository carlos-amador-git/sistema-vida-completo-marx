// src/modules/documents/documents.controller.ts
import { logger } from '../../common/services/logger.service';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { body, param, query, validationResult } from 'express-validator';
import { authMiddleware } from '../../common/guards/auth.middleware';
import { documentsService, CATEGORY_LABELS } from './documents.service';
import { DocumentCategory } from '@prisma/client';

const router = Router();

// Magic bytes signatures for server-side file type validation
const MAGIC_BYTES: Record<string, { offset: number; bytes: number[] }[]> = {
  'application/pdf': [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
  'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  'image/webp': [{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }],
  'image/heic': [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }], // ftyp box
  'application/msword': [{ offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0] }], // OLE2
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }], // ZIP (OOXML)
};

function validateMagicBytes(buffer: Buffer, claimedMimeType: string): boolean {
  const signatures = MAGIC_BYTES[claimedMimeType];
  if (!signatures) return false;
  return signatures.every(sig => {
    if (buffer.length < sig.offset + sig.bytes.length) return false;
    return sig.bytes.every((byte, i) => buffer[sig.offset + i] === byte);
  });
}

// Configurar multer para almacenar en memoria
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    // Tipos permitidos
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Use PDF, imágenes (JPG, PNG) o documentos Word.'));
    }
  },
});

// Middleware de autenticación para todos los endpoints
router.use(authMiddleware);

/**
 * GET /api/v1/documents
 * Lista documentos del usuario
 */
router.get(
  '/',
  query('category').optional().isIn(Object.keys(DocumentCategory)),
  query('search').optional().isString(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const documents = await documentsService.listDocuments(req.userId!, {
        category: req.query.category as DocumentCategory | undefined,
        search: req.query.search as string | undefined,
      });

      res.json({
        success: true,
        data: {
          documents,
          categories: CATEGORY_LABELS,
        },
      });
    } catch (error: any) {
      console.error('[DOCUMENTS_LIST_ERROR]', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: error?.message || 'Error listing documents',
          details: error?.stack || error?.message || String(error)
        },
      });
    }
  }
);

/**
 * GET /api/v1/documents/stats
 * Estadísticas de documentos
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await documentsService.getDocumentStats(req.userId!);

    res.json({
      success: true,
      data: { stats },
    });
  } catch (error: any) {
    console.error('[DOCUMENTS_STATS_ERROR]', error);
    res.status(500).json({
      success: false,
      error: { 
        code: 'SERVER_ERROR', 
        message: error?.message || 'Error getting document stats',
        details: error?.stack || error?.message || String(error)
      },
    });
  }
});

/**
 * GET /api/v1/documents/categories
 * Lista de categorías disponibles
 */
router.get('/categories', (req: Request, res: Response) => {
  const categories = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  res.json({
    success: true,
    data: { categories },
  });
});

/**
 * GET /api/v1/documents/:id
 * Obtiene un documento específico
 */
router.get(
  '/:id',
  param('id').isUUID(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const document = await documentsService.getDocument(req.userId!, req.params.id);

      if (!document) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: req.t('api:documents.notFound') },
        });
      }

      res.json({
        success: true,
        data: { document },
      });
    } catch (error: any) {
      logger.error('Error obteniendo documento:', error);
      console.error('[DOCUMENT_GET_ERROR]', error);
      res.status(500).json({
        success: false,
        error: { 
          code: 'SERVER_ERROR', 
          message: error.message || req.t('api:generic.serverError'),
          details: error.message
        },
      });
    }
  }
);

/**
 * GET /api/v1/documents/:id/download
 * Obtiene URL de descarga del documento
 */
router.get(
  '/:id/download',
  param('id').isUUID(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const downloadUrl = await documentsService.getDownloadUrl(req.userId!, req.params.id);

      if (!downloadUrl) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: req.t('api:documents.notFound') },
        });
      }

      res.json({
        success: true,
        data: { downloadUrl },
      });
    } catch (error: any) {
      logger.error('Error obteniendo URL de descarga:', error);
      console.error('[DOCUMENT_DOWNLOAD_ERROR]', error);
      res.status(500).json({
        success: false,
        error: { 
          code: 'SERVER_ERROR', 
          message: error.message || req.t('api:generic.serverError'),
          details: error.message
        },
      });
    }
  }
);

/**
 * POST /api/v1/documents
 * Sube un nuevo documento
 */
router.post(
  '/',
  upload.single('file'),
  body('title').trim().notEmpty().withMessage('Título requerido'),
  body('category').isIn(Object.keys(DocumentCategory)).withMessage('Categoría inválida'),
  body('description').optional().trim(),
  body('documentDate').optional().isISO8601().toDate(),
  body('doctorName').optional().trim(),
  body('institution').optional().trim(),
  body('isVisible').optional().isBoolean(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_FILE', message: req.t('api:documents.fileRequired') },
        });
      }

      // Validate magic bytes (server-side file type verification)
      if (!validateMagicBytes(req.file.buffer, req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_FILE_TYPE', message: 'El contenido del archivo no coincide con el tipo declarado.' },
        });
      }

      const document = await documentsService.createDocument(
        req.userId!,
        {
          title: req.body.title,
          description: req.body.description,
          category: req.body.category as DocumentCategory,
          documentDate: req.body.documentDate,
          doctorName: req.body.doctorName,
          institution: req.body.institution,
          isVisible: req.body.isVisible === 'true' || req.body.isVisible === true,
        },
        {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        }
      );

      res.status(201).json({
        success: true,
        message: req.t('api:documents.uploaded'),
        data: { document },
      });
    } catch (error: any) {
      logger.error('Error subiendo documento:', error);
      res.status(500).json({
        success: false,
        error: { code: 'UPLOAD_ERROR', message: error.message || req.t('api:documents.uploadError') },
      });
    }
  }
);

/**
 * PUT /api/v1/documents/:id
 * Actualiza metadatos de un documento
 */
router.put(
  '/:id',
  param('id').isUUID(),
  body('title').optional().trim().notEmpty(),
  body('category').optional().isIn(Object.keys(DocumentCategory)),
  body('description').optional().trim(),
  body('documentDate').optional().isISO8601().toDate(),
  body('doctorName').optional().trim(),
  body('institution').optional().trim(),
  body('isVisible').optional().isBoolean(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const document = await documentsService.updateDocument(req.userId!, req.params.id, {
        title: req.body.title,
        description: req.body.description,
        category: req.body.category as DocumentCategory,
        documentDate: req.body.documentDate,
        doctorName: req.body.doctorName,
        institution: req.body.institution,
        isVisible: req.body.isVisible,
      });

      if (!document) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: req.t('api:documents.notFound') },
        });
      }

      res.json({
        success: true,
        message: req.t('api:documents.updated'),
        data: { document },
      });
    } catch (error: any) {
      logger.error('Error actualizando documento:', error);
      console.error('[DOCUMENT_UPDATE_ERROR]', error);
      res.status(500).json({
        success: false,
        error: { 
          code: 'SERVER_ERROR', 
          message: error.message || req.t('api:generic.serverError'),
          details: error.message
        },
      });
    }
  }
);

/**
 * DELETE /api/v1/documents/:id
 * Elimina un documento
 */
router.delete(
  '/:id',
  param('id').isUUID(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const deleted = await documentsService.deleteDocument(req.userId!, req.params.id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: req.t('api:documents.notFound') },
        });
      }

      res.json({
        success: true,
        message: req.t('api:documents.deleted'),
      });
    } catch (error: any) {
      logger.error('Error eliminando documento:', error);
      console.error('[DOCUMENT_DELETE_ERROR]', error);
      res.status(500).json({
        success: false,
        error: { 
          code: 'SERVER_ERROR', 
          message: error.message || req.t('api:generic.serverError'),
          details: error.message
        },
      });
    }
  }
);

export default router;
