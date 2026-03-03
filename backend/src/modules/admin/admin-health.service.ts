// src/modules/admin/admin-health.service.ts
import { adminAuthService } from './admin-auth.service';
import config from '../../config';

import { prisma } from '../../common/prisma';

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  responseTime?: number;
  lastCheck: Date;
  details?: any;
  optional?: boolean; // Servicios opcionales no afectan estado general en desarrollo
}

export class AdminHealthService {
  /**
   * Obtiene estado general del sistema
   */
  async getSystemHealth(adminId: string) {
    const startTime = Date.now();

    const [
      databaseStatus,
      servicesStatus,
      systemInfo,
    ] = await Promise.all([
      this.checkDatabase(),
      this.checkServices(),
      this.getSystemInfo(),
    ]);

    const responseTime = Date.now() - startTime;

    // Determinar estado general
    // En desarrollo, solo servicios críticos (no opcionales) afectan el estado
    const allServices = [databaseStatus, ...servicesStatus];
    const criticalServices = config.env === 'development'
      ? allServices.filter(s => !s.optional)
      : allServices;

    const hasDown = criticalServices.some(s => s.status === 'down');
    const hasDegraded = criticalServices.some(s => s.status === 'degraded');

    let overallStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
    if (hasDown) overallStatus = 'down';
    else if (hasDegraded) overallStatus = 'degraded';

    // Registrar chequeo
    await adminAuthService.logAudit({
      adminId,
      action: 'HEALTH_CHECK',
      resource: 'system',
      details: { overallStatus, responseTime },
    });

    return {
      status: overallStatus,
      timestamp: new Date(),
      responseTime,
      database: databaseStatus,
      services: servicesStatus,
      system: systemInfo,
    };
  }

  /**
   * Verifica estado de la base de datos
   */
  async checkDatabase(): Promise<ServiceStatus> {
    const startTime = Date.now();
    try {
      // Hacer una consulta simple para verificar conexion
      await prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - startTime;

      // Obtener estadisticas de la BD
      const tableStats = await this.getDatabaseStats();

      return {
        name: 'PostgreSQL Database',
        status: responseTime > 1000 ? 'degraded' : 'healthy',
        responseTime,
        lastCheck: new Date(),
        details: {
          connected: true,
          ...tableStats,
        },
      };
    } catch (error: any) {
      return {
        name: 'PostgreSQL Database',
        status: 'down',
        responseTime: Date.now() - startTime,
        lastCheck: new Date(),
        details: {
          connected: false,
          error: error.message,
        },
      };
    }
  }

  /**
   * Obtiene estadisticas de la base de datos
   */
  async getDatabaseStats() {
    const [
      usersCount,
      profilesCount,
      directivesCount,
      emergencyAccessesCount,
      panicAlertsCount,
      auditLogsCount,
      institutionsCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.patientProfile.count(),
      prisma.advanceDirective.count(),
      prisma.emergencyAccess.count(),
      prisma.panicAlert.count(),
      prisma.auditLog.count(),
      prisma.medicalInstitution.count(),
    ]);

    return {
      tables: {
        users: usersCount,
        profiles: profilesCount,
        directives: directivesCount,
        emergencyAccesses: emergencyAccessesCount,
        panicAlerts: panicAlertsCount,
        auditLogs: auditLogsCount,
        institutions: institutionsCount,
      },
    };
  }

  /**
   * Verifica estado de servicios externos
   */
  async checkServices(): Promise<ServiceStatus[]> {
    const services: ServiceStatus[] = [];

    // Verificar Twilio SMS
    services.push(await this.checkTwilioStatus());

    // Verificar Email/SMTP
    services.push(await this.checkEmailStatus());

    // Verificar AWS S3
    services.push(await this.checkS3Status());

    // Verificar PSC NOM-151
    services.push(await this.checkPSCStatus());

    return services;
  }

  /**
   * Verifica estado de Twilio
   */
  private async checkTwilioStatus(): Promise<ServiceStatus> {
    const configured = !!(config.twilio.sid && config.twilio.token);

    return {
      name: 'Twilio SMS',
      status: configured ? 'healthy' : 'degraded',
      lastCheck: new Date(),
      details: {
        configured,
        phoneNumber: config.twilio.phone ? '***' + config.twilio.phone.slice(-4) : null,
      },
    };
  }

  /**
   * Verifica estado de Email (Resend)
   */
  private async checkEmailStatus(): Promise<ServiceStatus> {
    const configured = !!config.email.resendApiKey;

    return {
      name: 'Email (Resend)',
      status: configured ? 'healthy' : 'degraded',
      lastCheck: new Date(),
      optional: true, // Email es opcional en desarrollo
      details: {
        configured,
        from: config.email.from,
      },
    };
  }

  /**
   * Verifica estado de AWS S3
   */
  private async checkS3Status(): Promise<ServiceStatus> {
    const configured = !!(config.aws.accessKeyId && config.aws.secretAccessKey);

    return {
      name: 'AWS S3',
      status: configured ? 'healthy' : 'degraded',
      lastCheck: new Date(),
      details: {
        configured,
        bucket: config.aws.bucket,
        region: config.aws.region,
      },
    };
  }

  /**
   * Verifica estado de PSC NOM-151
   */
  private async checkPSCStatus(): Promise<ServiceStatus> {
    const configured = !!(config.psc.apiKey && config.psc.endpoint);

    return {
      name: 'PSC NOM-151',
      status: configured ? 'healthy' : 'degraded',
      lastCheck: new Date(),
      details: {
        configured,
        endpoint: config.psc.endpoint,
      },
    };
  }

  /**
   * Obtiene informacion del sistema
   */
  private async getSystemInfo() {
    return {
      environment: config.env,
      nodeVersion: process.version,
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      config: {
        port: config.port,
        frontendUrl: config.frontendUrl,
        rateLimit: config.rateLimit,
      },
    };
  }

  /**
   * Obtiene metricas de rendimiento
   */
  async getPerformanceMetrics(adminId: string) {
    // Tiempo promedio de respuesta de accesos de emergencia (ultimas 24h)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentAccesses = await prisma.emergencyAccess.findMany({
      where: { accessedAt: { gte: last24h } },
      select: { accessedAt: true, expiresAt: true },
    });

    // Conteo de errores en logs (si hubiera un modelo para eso)
    const errorLogs = await prisma.auditLog.count({
      where: {
        createdAt: { gte: last24h },
        action: { contains: 'ERROR' },
      },
    });

    // Actividad por hora
    const activityByHour = await this.getActivityByHour();

    return {
      period: 'last24h',
      emergencyAccesses: recentAccesses.length,
      errorCount: errorLogs,
      activityByHour,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
    };
  }

  /**
   * Obtiene actividad por hora (ultimas 24 horas)
   */
  private async getActivityByHour() {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const logs = await prisma.auditLog.findMany({
      where: { createdAt: { gte: last24h } },
      select: { createdAt: true },
    });

    // Agrupar por hora
    const hourCounts: Record<number, number> = {};
    for (let i = 0; i < 24; i++) {
      hourCounts[i] = 0;
    }

    logs.forEach(log => {
      const hour = log.createdAt.getHours();
      hourCounts[hour]++;
    });

    return Object.entries(hourCounts).map(([hour, count]) => ({
      hour: parseInt(hour),
      count,
    }));
  }

  /**
   * Ejecuta limpieza de datos antiguos
   */
  async runCleanup(adminId: string, dryRun: boolean = true) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Contar registros a eliminar
    const expiredSessions = await prisma.session.count({
      where: { expiresAt: { lt: now } },
    });

    const expiredAdminSessions = await prisma.adminSession.count({
      where: { expiresAt: { lt: now } },
    });

    const expiredEmergencyAccesses = await prisma.emergencyAccess.count({
      where: { expiresAt: { lt: thirtyDaysAgo } },
    });

    const oldPanicAlerts = await prisma.panicAlert.count({
      where: {
        createdAt: { lt: ninetyDaysAgo },
        status: { in: ['CANCELLED', 'RESOLVED', 'EXPIRED'] },
      },
    });

    const cleanupReport = {
      dryRun,
      timestamp: now,
      toDelete: {
        expiredSessions,
        expiredAdminSessions,
        expiredEmergencyAccesses,
        oldPanicAlerts,
      },
      deleted: {
        sessions: 0,
        adminSessions: 0,
        emergencyAccesses: 0,
        panicAlerts: 0,
      },
    };

    if (!dryRun) {
      // Ejecutar limpieza real
      const [sessions, adminSessions] = await Promise.all([
        prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
        prisma.adminSession.deleteMany({ where: { expiresAt: { lt: now } } }),
      ]);

      cleanupReport.deleted.sessions = sessions.count;
      cleanupReport.deleted.adminSessions = adminSessions.count;

      // Registrar limpieza
      await adminAuthService.logAudit({
        adminId,
        action: 'SYSTEM_CLEANUP',
        resource: 'system',
        details: cleanupReport,
      });
    }

    return cleanupReport;
  }
}

export const adminHealthService = new AdminHealthService();
