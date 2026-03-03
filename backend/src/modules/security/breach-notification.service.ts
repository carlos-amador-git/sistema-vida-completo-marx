// src/modules/security/breach-notification.service.ts
/**
 * Servicio de Notificación de Vulneraciones de Datos Personales
 *
 * Cumple con LFPDPPP Art. 20:
 * - Detección de vulneraciones de seguridad
 * - Notificación al titular en un plazo máximo de 72 horas
 * - Reporte al INAI cuando la vulneración afecte de manera significativa
 *   los derechos patrimoniales o morales de los titulares
 *
 * Flujo: Detección -> Registro -> Evaluación -> Notificación (72h) -> Reporte INAI
 */

import { v4 as uuidv4 } from 'uuid';
import { emailService } from '../../common/services/email.service';
import { logger } from '../../common/services/logger.service';
import { prisma } from '../../common/prisma';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export type BreachSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type BreachType =
  | 'UNAUTHORIZED_ACCESS'    // Acceso no autorizado a datos
  | 'DATA_LEAK'              // Filtración de datos
  | 'SYSTEM_COMPROMISE'      // Compromiso de sistema
  | 'CREDENTIAL_BREACH'      // Credenciales comprometidas
  | 'ENCRYPTION_FAILURE'     // Fallo de cifrado
  | 'INSIDER_THREAT'         // Amenaza interna
  | 'RANSOMWARE'             // Ataque de ransomware
  | 'OTHER';

export type BreachStatus =
  | 'DETECTED'               // Recién detectada
  | 'UNDER_INVESTIGATION'    // En investigación
  | 'CONFIRMED'              // Confirmada
  | 'USERS_NOTIFIED'         // Titulares notificados
  | 'INAI_REPORTED'          // Reportada al INAI
  | 'RESOLVED'               // Resuelta
  | 'FALSE_POSITIVE';        // Falso positivo

export interface BreachIncident {
  id: string;
  folio: string;
  type: BreachType;
  severity: BreachSeverity;
  status: BreachStatus;
  title: string;
  description: string;
  dataAffected: string[];          // Tipos de datos afectados
  affectedUserIds: string[];       // IDs de usuarios afectados
  affectedUserCount: number;
  detectedAt: Date;
  confirmedAt?: Date;
  usersNotifiedAt?: Date;
  inaiReportedAt?: Date;
  resolvedAt?: Date;
  notificationDeadline: Date;      // 72h desde detección
  remedialActions: string[];
  detectedBy: string;              // Sistema o persona que detectó
  investigationNotes: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface CreateBreachInput {
  type: BreachType;
  severity: BreachSeverity;
  title: string;
  description: string;
  dataAffected: string[];
  affectedUserIds?: string[];
  detectedBy: string;
}

interface NotifyUsersInput {
  incidentId: string;
  customMessage?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════

const BREACH_CONFIG = {
  notificationDeadlineHours: 72,
  inaiEmail: process.env.INAI_REPORT_EMAIL || 'atencion@inai.org.mx',
  dpoEmail: process.env.DPO_EMAIL || process.env.SECURITY_ALERT_EMAILS?.split(',')[0] || '',
  adminEmails: (process.env.SECURITY_ALERT_EMAILS || '').split(',').filter(Boolean),
  appName: 'Sistema VIDA',
  appUrl: process.env.FRONTEND_URL || 'https://vida.app',
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICIO
// ═══════════════════════════════════════════════════════════════════════════

class BreachNotificationService {
  /**
   * Genera folio de incidente: BREACH-YYYY-NNNN
   */
  private async generateFolio(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `BREACH-${year}-`;

    // Buscar último folio del año en el log de auditoría
    const lastIncident = await prisma.auditLog.findFirst({
      where: {
        action: 'BREACH_REGISTERED',
        details: { path: ['folio'], string_starts_with: prefix },
      },
      orderBy: { createdAt: 'desc' },
    });

    let sequence = 1;
    if (lastIncident) {
      const details = lastIncident.details as any;
      if (details?.folio) {
        const lastSeq = parseInt(details.folio.replace(prefix, ''), 10);
        if (!isNaN(lastSeq)) sequence = lastSeq + 1;
      }
    }

    return `${prefix}${sequence.toString().padStart(4, '0')}`;
  }

  /**
   * Registra una nueva vulneración de seguridad
   */
  async registerBreach(input: CreateBreachInput): Promise<BreachIncident> {
    const id = uuidv4();
    const folio = await this.generateFolio();
    const now = new Date();
    const deadline = new Date(now.getTime() + BREACH_CONFIG.notificationDeadlineHours * 60 * 60 * 1000);

    const incident: BreachIncident = {
      id,
      folio,
      type: input.type,
      severity: input.severity,
      status: 'DETECTED',
      title: input.title,
      description: input.description,
      dataAffected: input.dataAffected,
      affectedUserIds: input.affectedUserIds || [],
      affectedUserCount: input.affectedUserIds?.length || 0,
      detectedAt: now,
      notificationDeadline: deadline,
      remedialActions: [],
      detectedBy: input.detectedBy,
      investigationNotes: [],
      createdAt: now,
      updatedAt: now,
    };

    // Registrar en log de auditoría
    await prisma.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        actorName: input.detectedBy,
        action: 'BREACH_REGISTERED',
        resource: 'security_breach',
        resourceId: id,
        details: {
          incidentId: id,
          folio,
          type: input.type,
          severity: input.severity,
          title: input.title,
          dataAffected: input.dataAffected,
          affectedUserCount: incident.affectedUserCount,
          affectedUserIds: input.affectedUserIds || [],
          notificationDeadline: deadline.toISOString(),
          detectedBy: input.detectedBy,
        },
      },
    });

    logger.error('VULNERACIÓN DE SEGURIDAD DETECTADA', {
      folio,
      severity: input.severity,
      type: input.type,
      title: input.title,
      affectedUsers: incident.affectedUserCount,
      deadline: deadline.toISOString(),
    });

    // Notificar inmediatamente a administradores
    await this.notifyAdmins(incident);

    // Si es CRITICAL, iniciar notificación inmediata a usuarios
    if (input.severity === 'CRITICAL') {
      logger.warn('Vulneración CRITICAL detectada, iniciando notificación inmediata', { folio });
    }

    return incident;
  }

  /**
   * Notifica a los administradores/DPO sobre la vulneración
   */
  private async notifyAdmins(incident: BreachIncident): Promise<void> {
    const recipients = [...BREACH_CONFIG.adminEmails];
    if (BREACH_CONFIG.dpoEmail && !recipients.includes(BREACH_CONFIG.dpoEmail)) {
      recipients.push(BREACH_CONFIG.dpoEmail);
    }

    if (recipients.length === 0) {
      logger.warn('No hay emails de administradores configurados para alertas de breach');
      return;
    }

    const severityColors: Record<BreachSeverity, string> = {
      LOW: '#059669',
      MEDIUM: '#D97706',
      HIGH: '#DC2626',
      CRITICAL: '#7C2D12',
    };

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${severityColors[incident.severity]}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">ALERTA DE VULNERACIÓN - ${incident.severity}</h1>
          <p style="margin: 4px 0 0; opacity: 0.9;">Folio: ${incident.folio}</p>
        </div>
        <div style="background: #FFFFFF; padding: 24px; border: 1px solid #E5E7EB; border-radius: 0 0 8px 8px;">
          <h2 style="margin: 0 0 16px; color: #111827;">${incident.title}</h2>
          <p style="color: #4B5563;">${incident.description}</p>

          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Tipo</td>
              <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; color: #6B7280;">${incident.type}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Datos afectados</td>
              <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; color: #6B7280;">${incident.dataAffected.join(', ')}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Usuarios afectados</td>
              <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; color: #6B7280;">${incident.affectedUserCount}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Detectado por</td>
              <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; color: #6B7280;">${incident.detectedBy}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: 600; color: #DC2626;">Fecha límite notificación</td>
              <td style="padding: 8px; color: #DC2626; font-weight: 600;">${incident.notificationDeadline.toLocaleString('es-MX')}</td>
            </tr>
          </table>

          <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 6px; padding: 12px; margin-top: 16px;">
            <p style="margin: 0; color: #991B1B; font-size: 14px;">
              <strong>LFPDPPP Art. 20:</strong> Los titulares deben ser notificados en un plazo máximo de 72 horas
              desde la detección de la vulneración.
            </p>
          </div>
        </div>
      </div>
    `;

    try {
      await emailService.send({
        to: recipients,
        subject: `[${incident.severity}] Vulneración de Seguridad - ${incident.folio} - ${BREACH_CONFIG.appName}`,
        html,
      });

      logger.info('Notificación de breach enviada a administradores', {
        folio: incident.folio,
        recipients: recipients.length,
      });
    } catch (error) {
      logger.error('Error enviando notificación de breach a admins', error, {
        folio: incident.folio,
      });
    }
  }

  /**
   * Notifica a los titulares afectados (LFPDPPP Art. 20)
   * Debe ejecutarse dentro de las 72 horas desde la detección
   */
  async notifyAffectedUsers(input: NotifyUsersInput): Promise<{
    notified: number;
    failed: number;
    errors: string[];
  }> {
    // Recuperar datos del incidente del audit log
    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        action: 'BREACH_REGISTERED',
        details: { path: ['incidentId'], equals: input.incidentId },
      },
    });

    if (!auditEntry) {
      throw new Error(`Incidente ${input.incidentId} no encontrado`);
    }

    const details = auditEntry.details as any;
    const affectedUserIds: string[] = details.affectedUserIds || [];

    // Si no hay usuarios específicos, notificar a todos
    const users = affectedUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: affectedUserIds }, isActive: true },
          select: { id: true, email: true, name: true },
        })
      : await prisma.user.findMany({
          where: { isActive: true },
          select: { id: true, email: true, name: true },
        });

    let notified = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        const html = this.buildUserNotificationEmail({
          userName: user.name,
          folio: details.folio,
          title: details.title,
          dataAffected: details.dataAffected || [],
          customMessage: input.customMessage,
        });

        await emailService.send({
          to: user.email,
          subject: `Aviso importante sobre la seguridad de tus datos - ${BREACH_CONFIG.appName}`,
          html,
        });

        notified++;
      } catch (error: any) {
        failed++;
        errors.push(`${user.email}: ${error.message}`);
      }
    }

    // Registrar notificación en auditoría
    await prisma.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        actorName: 'breach-notification-service',
        action: 'BREACH_USERS_NOTIFIED',
        resource: 'security_breach',
        resourceId: input.incidentId,
        details: {
          incidentId: input.incidentId,
          folio: details.folio,
          usersNotified: notified,
          usersFailed: failed,
          notifiedAt: new Date().toISOString(),
        },
      },
    });

    logger.info('Notificación de breach enviada a usuarios', {
      folio: details.folio,
      notified,
      failed,
    });

    return { notified, failed, errors };
  }

  /**
   * Construye el email de notificación al titular (LFPDPPP Art. 20)
   */
  private buildUserNotificationEmail(params: {
    userName: string;
    folio: string;
    title: string;
    dataAffected: string[];
    customMessage?: string;
  }): string {
    const dataLabels: Record<string, string> = {
      email: 'Correo electrónico',
      name: 'Nombre',
      phone: 'Teléfono',
      curp: 'CURP',
      medical_data: 'Datos médicos',
      blood_type: 'Tipo de sangre',
      allergies: 'Alergias',
      conditions: 'Condiciones médicas',
      medications: 'Medicamentos',
      insurance: 'Datos de seguro médico',
      directives: 'Voluntad anticipada',
      documents: 'Documentos médicos',
      representatives: 'Datos de representantes',
    };

    const affectedList = params.dataAffected
      .map(d => dataLabels[d] || d)
      .map(d => `<li style="padding: 4px 0; color: #374151;">${d}</li>`)
      .join('');

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1F2937; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">${BREACH_CONFIG.appName}</h1>
          <p style="margin: 4px 0 0; opacity: 0.8;">Aviso de seguridad importante</p>
        </div>
        <div style="background: #FFFFFF; padding: 24px; border: 1px solid #E5E7EB;">
          <p style="color: #374151;">Estimado(a) <strong>${params.userName}</strong>,</p>

          <p style="color: #374151;">
            Le informamos que se ha detectado un incidente de seguridad que podría afectar
            la confidencialidad de algunos de sus datos personales almacenados en ${BREACH_CONFIG.appName}.
          </p>

          <div style="background: #FFF7ED; border-left: 4px solid #F59E0B; padding: 12px 16px; margin: 16px 0;">
            <p style="margin: 0; font-weight: 600; color: #92400E;">Folio del incidente: ${params.folio}</p>
            <p style="margin: 4px 0 0; color: #92400E;">${params.title}</p>
          </div>

          ${params.customMessage ? `<p style="color: #374151;">${params.customMessage}</p>` : ''}

          <h3 style="color: #111827; margin: 20px 0 8px;">Datos que podrían estar afectados:</h3>
          <ul style="margin: 0; padding-left: 20px;">
            ${affectedList}
          </ul>

          <h3 style="color: #111827; margin: 20px 0 8px;">Acciones que estamos tomando:</h3>
          <ul style="margin: 0; padding-left: 20px;">
            <li style="padding: 4px 0; color: #374151;">Investigación completa del incidente</li>
            <li style="padding: 4px 0; color: #374151;">Refuerzo de medidas de seguridad</li>
            <li style="padding: 4px 0; color: #374151;">Monitoreo continuo para prevenir futuros incidentes</li>
          </ul>

          <h3 style="color: #111827; margin: 20px 0 8px;">Acciones recomendadas para usted:</h3>
          <ul style="margin: 0; padding-left: 20px;">
            <li style="padding: 4px 0; color: #374151;">Cambie su contraseña de ${BREACH_CONFIG.appName} inmediatamente</li>
            <li style="padding: 4px 0; color: #374151;">Si usa la misma contraseña en otros servicios, cámbiela también</li>
            <li style="padding: 4px 0; color: #374151;">Revise la actividad reciente en su cuenta</li>
            <li style="padding: 4px 0; color: #374151;">Monitoree cualquier actividad sospechosa en sus cuentas</li>
          </ul>
        </div>
        <div style="background: #F3F4F6; padding: 16px 24px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="margin: 0; font-size: 13px; color: #6B7280;">
            <strong>Sus derechos ARCO:</strong> Conforme a la LFPDPPP, usted tiene derecho a
            Acceder, Rectificar, Cancelar u Oponerse al tratamiento de sus datos personales.
            Para ejercer estos derechos, envíe su solicitud a
            <a href="mailto:${BREACH_CONFIG.dpoEmail}" style="color: #2563EB;">${BREACH_CONFIG.dpoEmail}</a>
          </p>
          <p style="margin: 8px 0 0; font-size: 13px; color: #6B7280;">
            <strong>Contacto INAI:</strong> Si considera que sus derechos han sido vulnerados,
            puede presentar una denuncia ante el Instituto Nacional de Transparencia, Acceso a
            la Información y Protección de Datos Personales (INAI):
            <a href="https://www.inai.org.mx" style="color: #2563EB;">www.inai.org.mx</a>
          </p>
          <p style="margin: 8px 0 0; font-size: 12px; color: #9CA3AF;">
            Este aviso se envía en cumplimiento del Artículo 20 de la Ley Federal de Protección
            de Datos Personales en Posesión de los Particulares (LFPDPPP).
          </p>
        </div>
      </div>
    `;
  }

  /**
   * Genera reporte para el INAI (cuando la vulneración afecte significativamente
   * los derechos patrimoniales o morales de los titulares)
   */
  async generateINAIReport(incidentId: string): Promise<{
    folio: string;
    reportHtml: string;
    reportDate: Date;
  }> {
    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        action: 'BREACH_REGISTERED',
        details: { path: ['incidentId'], equals: incidentId },
      },
    });

    if (!auditEntry) {
      throw new Error(`Incidente ${incidentId} no encontrado`);
    }

    const details = auditEntry.details as any;
    const reportDate = new Date();

    const reportHtml = `
      <div style="font-family: 'Times New Roman', serif; max-width: 700px; margin: 0 auto; padding: 40px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="font-size: 18px; margin: 0;">REPORTE DE VULNERACIÓN DE SEGURIDAD</h1>
          <h2 style="font-size: 14px; margin: 8px 0; color: #666;">
            Conforme al Artículo 20 de la LFPDPPP
          </h2>
          <p style="font-size: 12px; color: #999;">Folio: ${details.folio}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 10px; border: 1px solid #ccc; font-weight: bold; width: 35%; background: #f5f5f5;">
              Responsable del tratamiento
            </td>
            <td style="padding: 10px; border: 1px solid #ccc;">${BREACH_CONFIG.appName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ccc; font-weight: bold; background: #f5f5f5;">
              Fecha de detección
            </td>
            <td style="padding: 10px; border: 1px solid #ccc;">
              ${new Date(auditEntry.createdAt).toLocaleString('es-MX')}
            </td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ccc; font-weight: bold; background: #f5f5f5;">
              Fecha del reporte
            </td>
            <td style="padding: 10px; border: 1px solid #ccc;">${reportDate.toLocaleString('es-MX')}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ccc; font-weight: bold; background: #f5f5f5;">
              Naturaleza del incidente
            </td>
            <td style="padding: 10px; border: 1px solid #ccc;">${details.title}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ccc; font-weight: bold; background: #f5f5f5;">
              Tipo de vulneración
            </td>
            <td style="padding: 10px; border: 1px solid #ccc;">${details.type}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ccc; font-weight: bold; background: #f5f5f5;">
              Severidad
            </td>
            <td style="padding: 10px; border: 1px solid #ccc;">${details.severity}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ccc; font-weight: bold; background: #f5f5f5;">
              Datos personales afectados
            </td>
            <td style="padding: 10px; border: 1px solid #ccc;">
              ${(details.dataAffected || []).join(', ')}
            </td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ccc; font-weight: bold; background: #f5f5f5;">
              Número de titulares afectados
            </td>
            <td style="padding: 10px; border: 1px solid #ccc;">${details.affectedUserCount}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ccc; font-weight: bold; background: #f5f5f5;">
              Medio de detección
            </td>
            <td style="padding: 10px; border: 1px solid #ccc;">${details.detectedBy}</td>
          </tr>
        </table>

        <h3 style="font-size: 14px; margin-top: 24px;">Medidas correctivas implementadas</h3>
        <p style="font-size: 13px; color: #333;">
          Se han implementado las medidas correctivas necesarias para contener la vulneración
          y prevenir futuros incidentes similares. Los titulares afectados han sido notificados
          conforme a lo dispuesto por el Artículo 20 de la LFPDPPP.
        </p>

        <div style="margin-top: 40px; border-top: 1px solid #ccc; padding-top: 16px;">
          <p style="font-size: 12px; color: #666;">
            Oficial de Protección de Datos: ${BREACH_CONFIG.dpoEmail}<br/>
            Fecha de generación: ${reportDate.toISOString()}
          </p>
        </div>
      </div>
    `;

    // Registrar generación del reporte
    await prisma.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        actorName: 'breach-notification-service',
        action: 'BREACH_INAI_REPORT_GENERATED',
        resource: 'security_breach',
        resourceId: incidentId,
        details: {
          incidentId,
          folio: details.folio,
          reportGeneratedAt: reportDate.toISOString(),
        },
      },
    });

    logger.info('Reporte INAI generado', {
      folio: details.folio,
      incidentId,
    });

    return {
      folio: details.folio,
      reportHtml,
      reportDate,
    };
  }

  /**
   * Lista todos los incidentes de breach registrados
   */
  async listIncidents(): Promise<Array<{
    incidentId: string;
    folio: string;
    type: string;
    severity: string;
    title: string;
    affectedUserCount: number;
    detectedAt: Date;
    notificationDeadline: string;
  }>> {
    const entries = await prisma.auditLog.findMany({
      where: { action: 'BREACH_REGISTERED' },
      orderBy: { createdAt: 'desc' },
    });

    return entries.map(entry => {
      const d = entry.details as any;
      return {
        incidentId: d.incidentId,
        folio: d.folio,
        type: d.type,
        severity: d.severity,
        title: d.title,
        affectedUserCount: d.affectedUserCount || 0,
        detectedAt: entry.createdAt,
        notificationDeadline: d.notificationDeadline,
      };
    });
  }

  /**
   * Verifica si hay incidentes pendientes de notificación que se acercan al deadline
   * Debe ejecutarse periódicamente (cron job)
   */
  async checkPendingNotifications(): Promise<Array<{
    folio: string;
    hoursRemaining: number;
    severity: string;
  }>> {
    const incidents = await this.listIncidents();
    const now = new Date();
    const pending: Array<{ folio: string; hoursRemaining: number; severity: string }> = [];

    for (const incident of incidents) {
      const deadline = new Date(incident.notificationDeadline);
      const hoursRemaining = (deadline.getTime() - now.getTime()) / (60 * 60 * 1000);

      // Check if notification was already sent
      const notified = await prisma.auditLog.findFirst({
        where: {
          action: 'BREACH_USERS_NOTIFIED',
          details: { path: ['incidentId'], equals: incident.incidentId },
        },
      });

      if (!notified && hoursRemaining > 0) {
        pending.push({
          folio: incident.folio,
          hoursRemaining: Math.round(hoursRemaining * 10) / 10,
          severity: incident.severity,
        });

        // Alert if less than 12 hours remaining
        if (hoursRemaining < 12) {
          logger.warn('BREACH: Notificación pendiente con deadline próximo', {
            folio: incident.folio,
            hoursRemaining: Math.round(hoursRemaining),
          });
        }
      }
    }

    return pending;
  }
}

export const breachNotificationService = new BreachNotificationService();
export default breachNotificationService;
