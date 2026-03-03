// src/modules/admin/admin-metrics.service.ts
import { prisma } from '../../common/prisma';

export class AdminMetricsService {
  /**
   * Obtiene metricas generales del dashboard
   */
  async getOverview() {
    const [
      totalUsers,
      activeUsers,
      verifiedUsers,
      totalDirectives,
      activeDirectives,
      totalEmergencyAccesses,
      totalPanicAlerts,
      activePanicAlerts,
      totalInstitutions,
      verifiedInstitutions,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isVerified: true } }),
      prisma.advanceDirective.count(),
      prisma.advanceDirective.count({ where: { status: 'ACTIVE' } }),
      prisma.emergencyAccess.count(),
      prisma.panicAlert.count(),
      prisma.panicAlert.count({ where: { status: 'ACTIVE' } }),
      prisma.medicalInstitution.count(),
      prisma.medicalInstitution.count({ where: { isVerified: true } }),
    ]);

    // Metricas de las ultimas 24 horas
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      newUsersToday,
      emergencyAccessesToday,
      panicAlertsToday,
    ] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: last24h } } }),
      prisma.emergencyAccess.count({ where: { accessedAt: { gte: last24h } } }),
      prisma.panicAlert.count({ where: { createdAt: { gte: last24h } } }),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        verified: verifiedUsers,
        newToday: newUsersToday,
      },
      directives: {
        total: totalDirectives,
        active: activeDirectives,
      },
      emergency: {
        totalAccesses: totalEmergencyAccesses,
        accessesToday: emergencyAccessesToday,
        totalAlerts: totalPanicAlerts,
        activeAlerts: activePanicAlerts,
        alertsToday: panicAlertsToday,
      },
      institutions: {
        total: totalInstitutions,
        verified: verifiedInstitutions,
      },
    };
  }

  /**
   * Obtiene metricas de usuarios por periodo
   */
  async getUserMetrics(period: 'day' | 'week' | 'month' | 'year' = 'month') {
    const now = new Date();
    let startDate: Date;
    let groupBy: 'day' | 'week' | 'month';

    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        groupBy = 'day';
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        groupBy = 'day';
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        groupBy = 'day';
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        groupBy = 'month';
        break;
    }

    // Registros por dia/mes
    const users = await prisma.user.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Agrupar por periodo
    const grouped = this.groupByPeriod(users.map(u => u.createdAt), groupBy);

    // Distribucion por sexo
    const sexDistribution = await prisma.user.groupBy({
      by: ['sex'],
      _count: { sex: true },
    });

    // Usuarios con perfil completo
    const usersWithProfile = await prisma.patientProfile.count();
    const usersWithDirective = await prisma.user.count({
      where: { directives: { some: {} } },
    });
    const usersWithRepresentatives = await prisma.user.count({
      where: { representatives: { some: {} } },
    });

    return {
      timeline: grouped,
      period,
      startDate,
      endDate: now,
      distribution: {
        sex: sexDistribution.reduce((acc, item) => {
          acc[item.sex || 'NO_ESPECIFICADO'] = item._count.sex;
          return acc;
        }, {} as Record<string, number>),
      },
      completeness: {
        total: await prisma.user.count(),
        withProfile: usersWithProfile,
        withDirective: usersWithDirective,
        withRepresentatives: usersWithRepresentatives,
      },
    };
  }

  /**
   * Obtiene metricas de accesos de emergencia
   */
  async getEmergencyMetrics(period: 'day' | 'week' | 'month' = 'week') {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    // Accesos en el periodo
    const accesses = await prisma.emergencyAccess.findMany({
      where: { accessedAt: { gte: startDate } },
      include: { institution: { select: { name: true, type: true } } },
      orderBy: { accessedAt: 'desc' },
    });

    // Alertas de panico en el periodo
    const alerts = await prisma.panicAlert.findMany({
      where: { createdAt: { gte: startDate } },
      orderBy: { createdAt: 'desc' },
    });

    // Agrupar accesos por dia
    const accessesByDay = this.groupByPeriod(
      accesses.map(a => a.accessedAt),
      'day'
    );

    // Accesos por institucion
    const accessesByInstitution: Record<string, number> = {};
    accesses.forEach(a => {
      const name = a.institution?.name || a.institutionName || 'Desconocido';
      accessesByInstitution[name] = (accessesByInstitution[name] || 0) + 1;
    });

    // Accesos por rol
    const accessesByRole: Record<string, number> = {};
    accesses.forEach(a => {
      accessesByRole[a.accessorRole] = (accessesByRole[a.accessorRole] || 0) + 1;
    });

    // Alertas por estado
    const alertsByStatus = await prisma.panicAlert.groupBy({
      by: ['status'],
      where: { createdAt: { gte: startDate } },
      _count: { status: true },
    });

    return {
      period,
      startDate,
      endDate: now,
      accesses: {
        total: accesses.length,
        timeline: accessesByDay,
        byInstitution: accessesByInstitution,
        byRole: accessesByRole,
        recent: accesses.slice(0, 10).map(a => ({
          id: a.id,
          accessedAt: a.accessedAt,
          accessorName: a.accessorName,
          accessorRole: a.accessorRole,
          institution: a.institution?.name || a.institutionName,
          dataAccessed: a.dataAccessed,
        })),
      },
      alerts: {
        total: alerts.length,
        byStatus: alertsByStatus.reduce((acc, item) => {
          acc[item.status] = item._count.status;
          return acc;
        }, {} as Record<string, number>),
        active: alerts.filter(a => a.status === 'ACTIVE').length,
      },
    };
  }

  /**
   * Obtiene metricas de directivas
   */
  async getDirectiveMetrics() {
    const [
      totalDirectives,
      byType,
      byStatus,
      byState,
    ] = await Promise.all([
      prisma.advanceDirective.count(),
      prisma.advanceDirective.groupBy({
        by: ['type'],
        _count: { type: true },
      }),
      prisma.advanceDirective.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      prisma.advanceDirective.groupBy({
        by: ['originState'],
        _count: { originState: true },
      }),
    ]);

    // NOM-151 selladas
    const nom151Sealed = await prisma.advanceDirective.count({
      where: { nom151Sealed: true },
    });

    return {
      total: totalDirectives,
      byType: byType.reduce((acc, item) => {
        acc[item.type] = item._count.type;
        return acc;
      }, {} as Record<string, number>),
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = item._count.status;
        return acc;
      }, {} as Record<string, number>),
      byState: byState
        .filter(s => s.originState)
        .reduce((acc, item) => {
          acc[item.originState!] = item._count.originState;
          return acc;
        }, {} as Record<string, number>),
      nom151Sealed,
    };
  }

  /**
   * Agrupa fechas por periodo
   */
  private groupByPeriod(dates: Date[], period: 'day' | 'week' | 'month'): { date: string; count: number }[] {
    const counts: Record<string, number> = {};

    dates.forEach(date => {
      let key: string;
      switch (period) {
        case 'day':
          key = date.toISOString().split('T')[0];
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
      }
      counts[key] = (counts[key] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

export const adminMetricsService = new AdminMetricsService();
