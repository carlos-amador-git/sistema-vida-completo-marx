// src/common/services/security-alerts.service.ts
/**
 * Servicio de Alertas de Seguridad
 *
 * Envía notificaciones por email cuando se detectan eventos de seguridad:
 * - Múltiples intentos de login fallidos
 * - Accesos de emergencia a datos médicos
 * - Cambios de contraseña
 * - Actividad sospechosa
 * - Nuevos dispositivos/ubicaciones
 *
 * Integra con:
 * - security-metrics.service.ts (detección de amenazas)
 * - email.service.ts (envío de notificaciones)
 */

import { emailService } from './email.service';
import { emailTemplates } from './email-templates.service';
import { securityMetrics } from './security-metrics.service';
import { logger } from './logger.service';
import { cacheService, CACHE_PREFIXES } from './cache.service';
import config from '../../config';

import { prisma } from '../prisma';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════

const ALERTS_CONFIG = {
  // Email de administradores para alertas críticas
  adminEmails: (process.env.SECURITY_ALERT_EMAILS || '').split(',').filter(Boolean),
  // Habilitar alertas
  enabled: process.env.SECURITY_ALERTS_ENABLED !== 'false',
  // Cooldown entre alertas del mismo tipo (evitar spam)
  cooldownMinutes: parseInt(process.env.ALERT_COOLDOWN_MINUTES || '15'),
};

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

type AlertType =
  | 'BRUTE_FORCE_DETECTED'
  | 'EMERGENCY_ACCESS'
  | 'PASSWORD_CHANGED'
  | 'NEW_DEVICE_LOGIN'
  | 'SUSPICIOUS_ACTIVITY'
  | 'ADMIN_LOGIN'
  | 'CRITICAL_ERROR';

interface AlertContext {
  userId?: string;
  adminId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  [key: string]: any;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICIO
// ═══════════════════════════════════════════════════════════════════════════

class SecurityAlertsService {
  constructor() {
    // Registrar callback para alertas de seguridad
    if (ALERTS_CONFIG.enabled) {
      securityMetrics.onAlert(alert => {
        this.handleSecurityMetricAlert(alert).catch(err => {
          logger.error('Error manejando alerta de métricas', err);
        });
      });

      logger.info('Security alerts service inicializado', {
        adminEmails: ALERTS_CONFIG.adminEmails.length,
        cooldownMinutes: ALERTS_CONFIG.cooldownMinutes,
      });
    }
  }

  /**
   * Envía alerta de acceso de emergencia al dueño del perfil
   */
  async alertEmergencyAccess(params: {
    patientUserId: string;
    accessorInfo: {
      ip: string;
      userAgent?: string;
      accessType: string;
    };
    documentsAccessed: string[];
  }): Promise<void> {
    if (!ALERTS_CONFIG.enabled) return;

    const user = await prisma.user.findUnique({
      where: { id: params.patientUserId },
    });

    if (!user) return;

    // Verificar cooldown
    const canSend = await this.checkCooldown('EMERGENCY_ACCESS', user.id);
    if (!canSend) return;

    const { subject, html } = emailTemplates.securityAlert({
      name: user.name,
      alertType: 'suspicious_activity',
      details: {
        ipAddress: params.accessorInfo.ip,
        userAgent: params.accessorInfo.userAgent,
        time: new Date(),
        location: 'Acceso de emergencia a tu información médica',
      },
    });

    await emailService.send({
      to: user.email,
      subject: '🚨 Acceso de emergencia a tu información - Sistema VIDA',
      html,
    });

    logger.info('Alerta de acceso de emergencia enviada', {
      userId: user.id,
      documentsCount: params.documentsAccessed.length,
    });
  }

  /**
   * Envía alerta de cambio de contraseña
   */
  async alertPasswordChanged(params: {
    userId: string;
    ip?: string;
    userAgent?: string;
  }): Promise<void> {
    if (!ALERTS_CONFIG.enabled) return;

    const user = await prisma.user.findUnique({
      where: { id: params.userId },
    });

    if (!user) return;

    const { subject, html } = emailTemplates.passwordChanged({
      name: user.name,
      changedAt: new Date(),
      ipAddress: params.ip,
    });

    await emailService.send({
      to: user.email,
      subject,
      html,
    });

    logger.info('Alerta de cambio de contraseña enviada', { userId: user.id });
  }

  /**
   * Envía alerta de nuevo dispositivo/ubicación
   */
  async alertNewDevice(params: {
    userId: string;
    ip: string;
    userAgent?: string;
    location?: string;
  }): Promise<void> {
    if (!ALERTS_CONFIG.enabled) return;

    // Verificar si es un dispositivo conocido
    const isKnown = await this.isKnownDevice(params.userId, params.ip, params.userAgent);
    if (isKnown) return;

    const user = await prisma.user.findUnique({
      where: { id: params.userId },
    });

    if (!user) return;

    // Verificar cooldown
    const canSend = await this.checkCooldown('NEW_DEVICE_LOGIN', params.userId);
    if (!canSend) return;

    const { subject, html } = emailTemplates.securityAlert({
      name: user.name,
      alertType: 'new_device',
      details: {
        ipAddress: params.ip,
        userAgent: params.userAgent,
        location: params.location,
        time: new Date(),
      },
    });

    await emailService.send({
      to: user.email,
      subject,
      html,
    });

    // Guardar dispositivo como conocido
    await this.recordKnownDevice(params.userId, params.ip, params.userAgent);

    logger.info('Alerta de nuevo dispositivo enviada', { userId: user.id });
  }

  /**
   * Envía alerta de actividad sospechosa a administradores
   */
  async alertSuspiciousActivity(params: {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    details: Record<string, any>;
  }): Promise<void> {
    if (!ALERTS_CONFIG.enabled) return;
    if (ALERTS_CONFIG.adminEmails.length === 0) return;

    // Solo alertar por email en severidad alta o crítica
    if (params.severity !== 'high' && params.severity !== 'critical') return;

    // Verificar cooldown
    const canSend = await this.checkCooldown('SUSPICIOUS_ACTIVITY', params.type);
    if (!canSend) return;

    const html = this.buildAdminAlertEmail(params);

    for (const adminEmail of ALERTS_CONFIG.adminEmails) {
      await emailService.send({
        to: adminEmail,
        subject: `🚨 [${params.severity.toUpperCase()}] Alerta de seguridad - Sistema VIDA`,
        html,
      });
    }

    logger.security('Alerta de seguridad enviada a admins', {
      type: params.type,
      severity: params.severity,
      adminCount: ALERTS_CONFIG.adminEmails.length,
    });
  }

  /**
   * Envía alerta de login de administrador
   */
  async alertAdminLogin(params: {
    adminId: string;
    email: string;
    ip: string;
    userAgent?: string;
  }): Promise<void> {
    if (!ALERTS_CONFIG.enabled) return;
    if (ALERTS_CONFIG.adminEmails.length === 0) return;

    // Solo alertar si es un IP nuevo
    const isKnown = await this.isKnownDevice(`admin:${params.adminId}`, params.ip);
    if (isKnown) return;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">🔐 Login de Administrador Detectado</h2>
        <p>Se ha registrado un nuevo acceso al panel de administración:</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Admin:</strong></td><td>${params.email}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>IP:</strong></td><td>${params.ip}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Dispositivo:</strong></td><td>${params.userAgent || 'Desconocido'}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Fecha:</strong></td><td>${new Date().toLocaleString('es-MX')}</td></tr>
        </table>
        <p style="margin-top: 20px; color: #666;">Si no reconoces esta actividad, contacta inmediatamente al equipo de seguridad.</p>
      </div>
    `;

    for (const adminEmail of ALERTS_CONFIG.adminEmails) {
      await emailService.send({
        to: adminEmail,
        subject: `🔐 Login de administrador: ${params.email}`,
        html,
      });
    }

    await this.recordKnownDevice(`admin:${params.adminId}`, params.ip);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTODOS PRIVADOS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Maneja alertas del servicio de métricas de seguridad
   */
  private async handleSecurityMetricAlert(alert: {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    context: Record<string, any>;
  }): Promise<void> {
    // Mapear a nuestro sistema de alertas
    await this.alertSuspiciousActivity({
      type: alert.type,
      severity: alert.severity,
      details: {
        message: alert.message,
        ...alert.context,
      },
    });
  }

  /**
   * Verifica el cooldown para evitar spam de alertas
   */
  private async checkCooldown(alertType: AlertType, identifier: string): Promise<boolean> {
    const cacheKey = `${alertType}:${identifier}`;

    const existing = await cacheService.get<{ sentAt: string }>(cacheKey, {
      prefix: 'alert:cooldown',
    });

    if (existing) {
      const sentAt = new Date(existing.sentAt);
      const cooldownMs = ALERTS_CONFIG.cooldownMinutes * 60 * 1000;

      if (Date.now() - sentAt.getTime() < cooldownMs) {
        logger.debug('Alerta en cooldown, omitiendo', { alertType, identifier });
        return false;
      }
    }

    // Marcar como enviada
    await cacheService.set(cacheKey, { sentAt: new Date().toISOString() }, {
      prefix: 'alert:cooldown',
      ttl: ALERTS_CONFIG.cooldownMinutes * 60,
    });

    return true;
  }

  /**
   * Verifica si un dispositivo es conocido
   */
  private async isKnownDevice(
    userId: string,
    ip: string,
    userAgent?: string
  ): Promise<boolean> {
    const cacheKey = `${userId}:${ip}`;

    const existing = await cacheService.get<{ knownSince: string }>(cacheKey, {
      prefix: 'known:device',
    });

    return !!existing;
  }

  /**
   * Registra un dispositivo como conocido
   */
  private async recordKnownDevice(
    userId: string,
    ip: string,
    userAgent?: string
  ): Promise<void> {
    const cacheKey = `${userId}:${ip}`;

    await cacheService.set(
      cacheKey,
      {
        knownSince: new Date().toISOString(),
        userAgent,
      },
      {
        prefix: 'known:device',
        ttl: 30 * 24 * 60 * 60, // 30 días
      }
    );
  }

  /**
   * Construye email de alerta para administradores
   */
  private buildAdminAlertEmail(params: {
    type: string;
    severity: string;
    details: Record<string, any>;
  }): string {
    const severityColors: Record<string, string> = {
      low: '#3b82f6',
      medium: '#f59e0b',
      high: '#f97316',
      critical: '#dc2626',
    };

    const detailsHtml = Object.entries(params.details)
      .map(([key, value]) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${key}:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${typeof value === 'object' ? JSON.stringify(value) : value}</td>
        </tr>
      `)
      .join('');

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${severityColors[params.severity]}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">🚨 Alerta de Seguridad</h1>
          <p style="margin: 10px 0 0 0; font-size: 18px;">${params.type}</p>
        </div>

        <div style="padding: 20px; background-color: #f9fafb;">
          <p><strong>Severidad:</strong>
            <span style="color: ${severityColors[params.severity]}; font-weight: bold;">
              ${params.severity.toUpperCase()}
            </span>
          </p>
          <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-MX')}</p>

          <h3>Detalles:</h3>
          <table style="width: 100%; border-collapse: collapse; background: white;">
            ${detailsHtml}
          </table>
        </div>

        <div style="padding: 15px; background-color: #fee2e2; text-align: center;">
          <p style="margin: 0; color: #991b1b;">
            Esta es una alerta automática del Sistema VIDA.
            <br>Por favor, investigue este evento lo antes posible.
          </p>
        </div>
      </div>
    `;
  }
}

export const securityAlertsService = new SecurityAlertsService();
export default securityAlertsService;
