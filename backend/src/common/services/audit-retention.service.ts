// src/common/services/audit-retention.service.ts
/**
 * Servicio de Retención y Rotación de Logs de Auditoría
 *
 * Implementa políticas de retención para cumplir con:
 * - Requisitos legales de conservación de datos médicos
 * - Optimización de almacenamiento
 * - GDPR/regulaciones de privacidad
 */

import { createHash } from 'crypto';
import { gzipSync } from 'zlib';
import { s3Service } from './s3.service';
import { logger } from './logger.service';
import config from '../../config';

import { prisma } from '../prisma';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DE RETENCIÓN
// ═══════════════════════════════════════════════════════════════════════════

interface RetentionPolicy {
  // Días de retención en base de datos activa
  activeDays: number;
  // Días adicionales en archivo (antes de eliminar permanentemente)
  archiveDays: number;
  // Si archivar antes de eliminar
  archiveBeforeDelete: boolean;
}

const RETENTION_POLICIES: Record<string, RetentionPolicy> = {
  // Logs de admin: 2 años activos + 3 años archivo (requisito legal datos médicos)
  admin_audit: {
    activeDays: 730, // 2 años
    archiveDays: 1095, // 3 años adicionales
    archiveBeforeDelete: true,
  },
  // Logs de acceso de emergencia: 5 años (puede ser evidencia legal)
  emergency_access: {
    activeDays: 1825, // 5 años
    archiveDays: 1825, // 5 años adicionales
    archiveBeforeDelete: true,
  },
  // Sesiones expiradas: 90 días
  expired_sessions: {
    activeDays: 90,
    archiveDays: 0,
    archiveBeforeDelete: false,
  },
  // Eventos de webhook: 30 días
  webhook_events: {
    activeDays: 30,
    archiveDays: 60,
    archiveBeforeDelete: true,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICIO DE RETENCIÓN
// ═══════════════════════════════════════════════════════════════════════════

interface RetentionResult {
  table: string;
  archivedCount: number;
  deletedCount: number;
  errors: string[];
}

interface ArchiveEntry {
  id: string;
  originalTable: string;
  data: any;
  archivedAt: Date;
  deleteAfter: Date;
}

class AuditRetentionService {
  /**
   * Ejecuta la política de retención para todos los logs
   * Diseñado para ejecutarse como cron job diario
   */
  async executeRetentionPolicies(): Promise<RetentionResult[]> {
    logger.info('[RETENTION] Iniciando ejecución de políticas de retención...');
    const results: RetentionResult[] = [];

    // 1. Procesar logs de auditoría de admin
    results.push(await this.processAdminAuditLogs());

    // 2. Procesar logs de acceso de emergencia
    results.push(await this.processEmergencyAccessLogs());

    // 3. Limpiar sesiones expiradas
    results.push(await this.cleanExpiredSessions());

    // 4. Limpiar archivo de logs antiguos
    results.push(await this.cleanArchivedLogs());

    logger.info('[RETENTION] Ejecución completada:', results);
    return results;
  }

  /**
   * Procesa logs de auditoría de administradores
   */
  private async processAdminAuditLogs(): Promise<RetentionResult> {
    const policy = RETENTION_POLICIES.admin_audit;
    const result: RetentionResult = {
      table: 'AdminAuditLog',
      archivedCount: 0,
      deletedCount: 0,
      errors: [],
    };

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.activeDays);

      // Obtener logs antiguos
      const oldLogs = await prisma.adminAuditLog.findMany({
        where: {
          createdAt: { lt: cutoffDate },
        },
        take: 1000, // Procesar en lotes
      });

      if (oldLogs.length === 0) {
        return result;
      }

      if (policy.archiveBeforeDelete) {
        // Archivar antes de eliminar
        const archiveDate = new Date();
        archiveDate.setDate(archiveDate.getDate() + policy.archiveDays);

        // Archivar en lotes
        const archiveEntries = oldLogs.map(log => ({
          originalTable: 'AdminAuditLog',
          originalId: log.id,
          data: {
            adminId: log.adminId,
            action: log.action,
            resource: log.resource,
            resourceId: log.resourceId,
            details: log.details,
            ipAddress: log.ipAddress,
            createdAt: log.createdAt,
          },
          archivedAt: new Date(),
          deleteAfter: archiveDate,
        }));

        // Guardar en tabla de archivo
        await prisma.auditArchive.createMany({
          data: archiveEntries.map(entry => ({
            originalTable: entry.originalTable,
            originalId: entry.originalId,
            data: entry.data,
            archivedAt: entry.archivedAt,
            deleteAfter: entry.deleteAfter,
          })),
        });

        result.archivedCount = oldLogs.length;

        // En producción, también subir a S3 para almacenamiento a largo plazo
        if (config.env === 'production' && s3Service.isServiceConfigured()) {
          try {
            await this.archiveToS3('AdminAuditLog', oldLogs.map(log => log.id), archiveEntries);
            logger.info('Logs de admin archivados a S3', { count: archiveEntries.length });
          } catch (s3Error) {
            logger.error('Error archivando a S3', s3Error);
            // No fallar - ya están en la tabla de archivo
          }
        }
      }

      // Eliminar logs procesados
      const deleteResult = await prisma.adminAuditLog.deleteMany({
        where: {
          id: { in: oldLogs.map(l => l.id) },
        },
      });

      result.deletedCount = deleteResult.count;

      logger.info(
        `[RETENTION] AdminAuditLog: ${result.archivedCount} archivados, ${result.deletedCount} eliminados`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
      result.errors.push(errorMsg);
      logger.error('[RETENTION] Error procesando AdminAuditLog:', error);
    }

    return result;
  }

  /**
   * Procesa logs de acceso de emergencia
   */
  private async processEmergencyAccessLogs(): Promise<RetentionResult> {
    const policy = RETENTION_POLICIES.emergency_access;
    const result: RetentionResult = {
      table: 'EmergencyAccess',
      archivedCount: 0,
      deletedCount: 0,
      errors: [],
    };

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.activeDays);

      // Contar logs antiguos (no eliminar por defecto - solo reportar)
      const count = await prisma.emergencyAccess.count({
        where: {
          accessedAt: { lt: cutoffDate },
        },
      });

      if (count > 0) {
        logger.info(
          `[RETENTION] EmergencyAccess: ${count} registros exceden política de ${policy.activeDays} días`
        );
        // NOTA: Por requisitos legales, los logs de acceso de emergencia
        // generalmente no se eliminan automáticamente. Requieren revisión manual.
        result.archivedCount = count;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
      result.errors.push(errorMsg);
      logger.error('[RETENTION] Error procesando EmergencyAccess:', error);
    }

    return result;
  }

  /**
   * Limpia sesiones expiradas
   */
  private async cleanExpiredSessions(): Promise<RetentionResult> {
    const policy = RETENTION_POLICIES.expired_sessions;
    const result: RetentionResult = {
      table: 'Session',
      archivedCount: 0,
      deletedCount: 0,
      errors: [],
    };

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.activeDays);

      // Eliminar sesiones expiradas antiguas
      const deleteResult = await prisma.session.deleteMany({
        where: {
          expiresAt: { lt: cutoffDate },
        },
      });

      result.deletedCount = deleteResult.count;

      if (result.deletedCount > 0) {
        logger.info(`[RETENTION] Session: ${result.deletedCount} sesiones expiradas eliminadas`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
      result.errors.push(errorMsg);
      logger.error('[RETENTION] Error limpiando sesiones:', error);
    }

    return result;
  }

  /**
   * Limpia logs archivados que exceden el período de retención total
   */
  private async cleanArchivedLogs(): Promise<RetentionResult> {
    const result: RetentionResult = {
      table: 'AuditArchive',
      archivedCount: 0,
      deletedCount: 0,
      errors: [],
    };

    try {
      const now = new Date();

      // Eliminar registros archivados cuya fecha de eliminación haya pasado
      const deleteResult = await prisma.auditArchive.deleteMany({
        where: {
          deleteAfter: { lt: now },
        },
      });

      result.deletedCount = deleteResult.count;

      if (result.deletedCount > 0) {
        logger.info(`[RETENTION] AuditArchive: ${result.deletedCount} registros eliminados permanentemente`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
      result.errors.push(errorMsg);
      logger.error('[RETENTION] Error limpiando archivo:', error);
    }

    return result;
  }

  /**
   * Archiva logs a S3 como JSON comprimido
   */
  private async archiveToS3(
    tableName: string,
    originalIds: string[],
    entries: { originalTable: string; originalId: string; data: any; archivedAt: Date; deleteAfter: Date }[]
  ): Promise<void> {
    if (entries.length === 0) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `audit-archive-${tableName}-${timestamp}.json.gz`;

    // Comprimir datos
    const jsonData = JSON.stringify(entries, null, 2);
    const compressed = gzipSync(Buffer.from(jsonData, 'utf-8'));

    // Calcular checksum
    const checksum = createHash('sha256').update(compressed).digest('hex');

    // Subir a S3 usando el servicio existente
    const result = await s3Service.uploadFile({
      buffer: compressed,
      fileName,
      mimeType: 'application/gzip',
      folder: 'audit-archive',
    });

    // Actualizar registros con información de S3
    await prisma.auditArchive.updateMany({
      where: { originalId: { in: originalIds } },
      data: {
        s3Key: result.key,
        s3Bucket: config.aws?.bucket || 'vida-archive',
        compressedSize: compressed.length,
        checksum,
      },
    });

    logger.info(`Archivo S3 creado: ${result.key}`, {
      records: entries.length,
      size: compressed.length,
      checksum,
    });
  }

  /**
   * Obtiene estadísticas de retención actuales
   */
  async getRetentionStats(): Promise<{
    adminAuditLogs: { total: number; oldestDate: Date | null };
    emergencyAccess: { total: number; oldestDate: Date | null };
    sessions: { active: number; expired: number };
  }> {
    const [
      adminAuditCount,
      adminOldest,
      emergencyCount,
      emergencyOldest,
      activeSessions,
      expiredSessions,
    ] = await Promise.all([
      prisma.adminAuditLog.count(),
      prisma.adminAuditLog.findFirst({ orderBy: { createdAt: 'asc' } }),
      prisma.emergencyAccess.count(),
      prisma.emergencyAccess.findFirst({ orderBy: { accessedAt: 'asc' } }),
      prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
      prisma.session.count({ where: { expiresAt: { lt: new Date() } } }),
    ]);

    return {
      adminAuditLogs: {
        total: adminAuditCount,
        oldestDate: adminOldest?.createdAt || null,
      },
      emergencyAccess: {
        total: emergencyCount,
        oldestDate: emergencyOldest?.accessedAt || null,
      },
      sessions: {
        active: activeSessions,
        expired: expiredSessions,
      },
    };
  }

  /**
   * Exporta logs para auditoría externa
   * @param startDate Fecha de inicio
   * @param endDate Fecha de fin
   * @param type Tipo de log a exportar
   */
  async exportLogsForAudit(
    startDate: Date,
    endDate: Date,
    type: 'admin' | 'emergency' | 'all'
  ): Promise<{
    exportedAt: Date;
    recordCount: number;
    data: any[];
  }> {
    const data: any[] = [];

    if (type === 'admin' || type === 'all') {
      const adminLogs = await prisma.adminAuditLog.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          admin: {
            select: { email: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      data.push(
        ...adminLogs.map(log => ({
          type: 'admin_audit',
          ...log,
        }))
      );
    }

    if (type === 'emergency' || type === 'all') {
      const emergencyLogs = await prisma.emergencyAccess.findMany({
        where: {
          accessedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { accessedAt: 'desc' },
      });

      data.push(
        ...emergencyLogs.map(log => ({
          type: 'emergency_access',
          ...log,
        }))
      );
    }

    return {
      exportedAt: new Date(),
      recordCount: data.length,
      data,
    };
  }
}

export const auditRetentionService = new AuditRetentionService();
export default auditRetentionService;
