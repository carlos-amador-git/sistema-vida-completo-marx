// src/common/services/download-tracking.service.ts
/**
 * Servicio de Tracking de Descargas
 *
 * Registra y audita todos los accesos a documentos del sistema.
 * Útil para:
 * - Cumplimiento normativo (quién accedió a qué documento)
 * - Detección de accesos no autorizados
 * - Estadísticas de uso
 * - Alertas de seguridad
 */

import { logger } from './logger.service';
import { cacheService, CACHE_PREFIXES } from './cache.service';
import { emailService } from './email.service';
import { emailTemplates } from './email-templates.service';
import config from '../../config';

import { prisma } from '../prisma';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export interface DownloadEvent {
  documentKey: string;
  documentId?: string;
  userId?: string;
  emergencyAccessId?: string;
  accessType: 'owner' | 'emergency' | 'representative' | 'admin';
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorReason?: string;
}

export interface DownloadStats {
  totalDownloads: number;
  uniqueDocuments: number;
  byAccessType: Record<string, number>;
  recentAccess: Array<{
    documentKey: string;
    accessedAt: Date;
    accessType: string;
  }>;
}

interface AccessCount {
  count: number;
  lastAccess: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICIO
// ═══════════════════════════════════════════════════════════════════════════

class DownloadTrackingService {
  /**
   * Registra un evento de descarga/acceso a documento
   */
  async trackDownload(event: DownloadEvent): Promise<void> {
    try {
      // Guardar en base de datos para auditoría permanente
      await prisma.documentAccessLog.create({
        data: {
          documentKey: event.documentKey,
          documentId: event.documentId,
          userId: event.userId,
          emergencyAccessId: event.emergencyAccessId,
          accessType: event.accessType,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          success: event.success,
          errorReason: event.errorReason,
        },
      });

      // Actualizar contador en cache para rate limiting
      await this.incrementAccessCount(event.documentKey, event.userId || event.ipAddress || 'unknown');

      // Log para monitoreo
      logger.info('Documento accedido', {
        documentKey: event.documentKey,
        accessType: event.accessType,
        userId: event.userId,
        success: event.success,
      });

      // Verificar patrones sospechosos
      await this.checkSuspiciousActivity(event);
    } catch (error) {
      logger.error('Error registrando descarga', error, { event });
      // No lanzar error para no interrumpir la descarga
    }
  }

  /**
   * Obtiene el historial de accesos a un documento
   */
  async getDocumentAccessHistory(
    documentKey: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Array<{
    id: string;
    accessedAt: Date;
    accessType: string;
    userId?: string;
    ipAddress?: string;
    success: boolean;
  }>> {
    const { limit = 50, offset = 0 } = options || {};

    const logs = await prisma.documentAccessLog.findMany({
      where: { documentKey },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        createdAt: true,
        accessType: true,
        userId: true,
        ipAddress: true,
        success: true,
      },
    });

    return logs.map(log => ({
      id: log.id,
      accessedAt: log.createdAt,
      accessType: log.accessType,
      userId: log.userId || undefined,
      ipAddress: log.ipAddress || undefined,
      success: log.success,
    }));
  }

  /**
   * Obtiene historial de accesos de un usuario
   */
  async getUserAccessHistory(
    userId: string,
    options?: { limit?: number; startDate?: Date; endDate?: Date }
  ): Promise<Array<{
    id: string;
    documentKey: string;
    accessedAt: Date;
    accessType: string;
    success: boolean;
  }>> {
    const { limit = 100, startDate, endDate } = options || {};

    const where: any = { userId };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const logs = await prisma.documentAccessLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        documentKey: true,
        createdAt: true,
        accessType: true,
        success: true,
      },
    });

    return logs.map(log => ({
      id: log.id,
      documentKey: log.documentKey,
      accessedAt: log.createdAt,
      accessType: log.accessType,
      success: log.success,
    }));
  }

  /**
   * Obtiene estadísticas de descargas
   */
  async getStats(options?: { userId?: string; days?: number }): Promise<DownloadStats> {
    const { userId, days = 30 } = options || {};
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where: any = { createdAt: { gte: startDate } };
    if (userId) where.userId = userId;

    // Total de descargas
    const totalDownloads = await prisma.documentAccessLog.count({ where });

    // Documentos únicos
    const uniqueDocs = await prisma.documentAccessLog.groupBy({
      by: ['documentKey'],
      where,
    });

    // Por tipo de acceso
    const byType = await prisma.documentAccessLog.groupBy({
      by: ['accessType'],
      where,
      _count: true,
    });

    // Accesos recientes
    const recent = await prisma.documentAccessLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        documentKey: true,
        createdAt: true,
        accessType: true,
      },
    });

    return {
      totalDownloads,
      uniqueDocuments: uniqueDocs.length,
      byAccessType: byType.reduce((acc, item) => {
        acc[item.accessType] = item._count;
        return acc;
      }, {} as Record<string, number>),
      recentAccess: recent.map(r => ({
        documentKey: r.documentKey,
        accessedAt: r.createdAt,
        accessType: r.accessType,
      })),
    };
  }

  /**
   * Obtiene accesos de emergencia para un usuario (dueño del perfil)
   */
  async getEmergencyAccessHistory(profileOwnerId: string): Promise<Array<{
    id: string;
    documentKey: string;
    accessedAt: Date;
    emergencyAccessId: string;
    ipAddress?: string;
  }>> {
    // Primero obtener los documentos del usuario
    const userDocs = await prisma.medicalDocument.findMany({
      where: { userId: profileOwnerId },
      select: { s3Key: true },
    });

    const docKeys = userDocs.map(d => d.s3Key);

    // Buscar accesos de emergencia a esos documentos
    const logs = await prisma.documentAccessLog.findMany({
      where: {
        documentKey: { in: docKeys },
        accessType: 'emergency',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return logs.map(log => ({
      id: log.id,
      documentKey: log.documentKey,
      accessedAt: log.createdAt,
      emergencyAccessId: log.emergencyAccessId || '',
      ipAddress: log.ipAddress || undefined,
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTODOS PRIVADOS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Incrementa contador de accesos (para rate limiting)
   */
  private async incrementAccessCount(documentKey: string, identifier: string): Promise<void> {
    const cacheKey = `${documentKey}:${identifier}`;

    const existing = await cacheService.get<AccessCount>(cacheKey, {
      prefix: CACHE_PREFIXES.DOWNLOAD_TRACKING,
    });

    const newCount: AccessCount = {
      count: (existing?.count || 0) + 1,
      lastAccess: new Date().toISOString(),
    };

    await cacheService.set(cacheKey, newCount, {
      prefix: CACHE_PREFIXES.DOWNLOAD_TRACKING,
      ttl: 3600, // 1 hora
    });
  }

  /**
   * Verifica patrones de acceso sospechosos
   */
  private async checkSuspiciousActivity(event: DownloadEvent): Promise<void> {
    const identifier = event.userId || event.ipAddress || 'unknown';
    const cacheKey = `${event.documentKey}:${identifier}`;

    const accessCount = await cacheService.get<AccessCount>(cacheKey, {
      prefix: CACHE_PREFIXES.DOWNLOAD_TRACKING,
    });

    // Alertar si hay muchos accesos en poco tiempo
    if (accessCount && accessCount.count > 10) {
      logger.warn('Patrón de acceso sospechoso detectado', {
        documentKey: event.documentKey,
        identifier,
        accessCount: accessCount.count,
        period: '1 hora',
      });

      // Aquí se podría enviar una alerta o notificación
    }

    // Alertar accesos de emergencia y notificar al dueño
    if (event.accessType === 'emergency') {
      logger.info('Acceso de emergencia registrado', {
        documentKey: event.documentKey,
        emergencyAccessId: event.emergencyAccessId,
        ipAddress: event.ipAddress,
      });

      // Enviar notificación al dueño del documento
      this.notifyDocumentOwner(event).catch(err => {
        logger.error('Error notificando acceso de emergencia', err);
      });
    }
  }

  /**
   * Notifica al dueño del documento sobre un acceso de emergencia
   */
  private async notifyDocumentOwner(event: DownloadEvent): Promise<void> {
    try {
      // Buscar el documento y su dueño
      const document = await prisma.medicalDocument.findFirst({
        where: { s3Key: event.documentKey },
        include: { user: true },
      });

      if (!document?.user) {
        logger.warn('No se encontró dueño del documento para notificar', {
          documentKey: event.documentKey,
        });
        return;
      }

      // Contar documentos accedidos en esta sesión de emergencia
      let documentsAccessed = 1;
      if (event.emergencyAccessId) {
        const accessCount = await prisma.documentAccessLog.count({
          where: {
            emergencyAccessId: event.emergencyAccessId,
            accessType: 'emergency',
          },
        });
        documentsAccessed = accessCount || 1;
      }

      // Verificar cooldown para no spamear al usuario
      const cooldownKey = `emergency-notify:${document.userId}`;
      const recentNotification = await cacheService.get<{ sentAt: string }>(cooldownKey, {
        prefix: 'notify:cooldown',
      });

      if (recentNotification) {
        // Ya se notificó en los últimos 5 minutos, no enviar otra
        logger.debug('Notificación de emergencia en cooldown', { userId: document.userId });
        return;
      }

      // Marcar cooldown
      await cacheService.set(cooldownKey, { sentAt: new Date().toISOString() }, {
        prefix: 'notify:cooldown',
        ttl: 300, // 5 minutos
      });

      // Enviar notificación
      const { subject, html } = emailTemplates.emergencyAccessNotification({
        name: document.user.name,
        accessTime: new Date(),
        accessorInfo: {
          ip: event.ipAddress,
          userAgent: event.userAgent,
        },
        documentsAccessed,
        viewHistoryUrl: `${config.frontendUrl}/access-history`,
      });

      const result = await emailService.send({
        to: document.user.email,
        subject,
        html,
      });

      if (result.success) {
        logger.info('Notificación de acceso de emergencia enviada', {
          userId: document.userId,
          documentKey: event.documentKey,
          documentsAccessed,
        });
      }
    } catch (error) {
      logger.error('Error en notifyDocumentOwner', error);
    }
  }
}

export const downloadTrackingService = new DownloadTrackingService();
export default downloadTrackingService;
