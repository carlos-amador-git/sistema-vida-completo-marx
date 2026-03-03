// src/modules/payments/payments-admin.controller.ts
import { logger } from '../../common/services/logger.service';
import { Router, Request, Response } from 'express';
import { PaymentStatus, InvoiceStatus, SubscriptionStatus } from '@prisma/client';
import { adminAuthMiddleware } from '../../common/guards/admin-auth.middleware';
import { subscriptionService } from './services/subscription.service';
import { paymentService } from './services/payment.service';
import { invoiceService } from './services/invoice.service';
import { premiumFeaturesService } from './services/premium-features.service';
import type { RevenueStats, PlanFeatures, PlanLimits } from './types/payments.types';

import { prisma } from '../../common/prisma';

const router = Router();

// Todos los endpoints requieren autenticación de admin
router.use(adminAuthMiddleware);

// ==================== PLANES ====================

/**
 * GET /api/v1/admin/payments/plans
 * Lista todos los planes (incluyendo inactivos)
 */
router.get('/plans', async (_req: Request, res: Response) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { displayOrder: 'asc' },
    });

    res.json({
      success: true,
      data: plans.map((plan) => ({
        ...plan,
        priceMonthly: plan.priceMonthly ? Number(plan.priceMonthly) : null,
        priceAnnual: plan.priceAnnual ? Number(plan.priceAnnual) : null,
      })),
    });
  } catch (error) {
    logger.error('Error obteniendo planes:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error obteniendo planes',
    });
  }
});

/**
 * POST /api/v1/admin/payments/plans
 * Crea un nuevo plan
 */
router.post('/plans', async (req: Request, res: Response) => {
  try {
    const {
      name,
      slug,
      description,
      priceMonthly,
      priceAnnual,
      currency,
      stripePriceIdMonthly,
      stripePriceIdAnnual,
      stripeProductId,
      features,
      limits,
      trialDays,
      isActive,
      isDefault,
      displayOrder,
    } = req.body;

    if (!name || !slug || !features || !limits) {
      return res.status(400).json({
        success: false,
        error: req.t('api:payments.planFieldsRequired'),
      });
    }

    const plan = await prisma.subscriptionPlan.create({
      data: {
        name,
        slug,
        description,
        priceMonthly,
        priceAnnual,
        currency: currency || 'MXN',
        stripePriceIdMonthly,
        stripePriceIdAnnual,
        stripeProductId,
        features,
        limits,
        trialDays: trialDays || 0,
        isActive: isActive ?? true,
        isDefault: isDefault ?? false,
        displayOrder: displayOrder ?? 0,
      },
    });

    res.json({
      success: true,
      data: {
        ...plan,
        priceMonthly: plan.priceMonthly ? Number(plan.priceMonthly) : null,
        priceAnnual: plan.priceAnnual ? Number(plan.priceAnnual) : null,
      },
      message: req.t('api:payments.planCreated'),
    });
  } catch (error) {
    logger.error('Error creando plan:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error creando plan',
    });
  }
});

/**
 * PUT /api/v1/admin/payments/plans/:id
 * Actualiza un plan
 */
router.put('/plans/:id', async (req: Request, res: Response) => {
  try {
    const planId = req.params.id;
    const updateData = req.body;

    const plan = await prisma.subscriptionPlan.update({
      where: { id: planId },
      data: updateData,
    });

    // Invalidar cache de todos los usuarios con este plan
    premiumFeaturesService.clearCache();

    res.json({
      success: true,
      data: {
        ...plan,
        priceMonthly: plan.priceMonthly ? Number(plan.priceMonthly) : null,
        priceAnnual: plan.priceAnnual ? Number(plan.priceAnnual) : null,
      },
      message: req.t('api:payments.planUpdated'),
    });
  } catch (error) {
    logger.error('Error actualizando plan:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error actualizando plan',
    });
  }
});

// ==================== SUSCRIPCIONES ====================

/**
 * GET /api/v1/admin/payments/subscriptions
 * Lista todas las suscripciones
 */
router.get('/subscriptions', async (req: Request, res: Response) => {
  try {
    const { limit, offset, status, planId } = req.query;

    const where: Record<string, unknown> = {};
    if (status) where.status = status as SubscriptionStatus;
    if (planId) where.planId = planId as string;

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
          plan: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit ? parseInt(limit as string) : 50,
        skip: offset ? parseInt(offset as string) : 0,
      }),
      prisma.subscription.count({ where }),
    ]);

    res.json({
      success: true,
      data: subscriptions,
      pagination: {
        total,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      },
    });
  } catch (error) {
    logger.error('Error obteniendo suscripciones:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error obteniendo suscripciones',
    });
  }
});

/**
 * GET /api/v1/admin/payments/subscriptions/:id
 * Obtiene detalle de una suscripción
 */
router.get('/subscriptions/:id', async (req: Request, res: Response) => {
  try {
    const subscriptionId = req.params.id;

    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        user: { select: { id: true, email: true, name: true, curp: true } },
        plan: true,
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: req.t('api:payments.subscriptionNotFound'),
      });
    }

    res.json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    logger.error('Error obteniendo suscripción:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error obteniendo suscripción',
    });
  }
});

/**
 * PUT /api/v1/admin/payments/subscriptions/:id
 * Modifica una suscripción
 */
router.put('/subscriptions/:id', async (req: Request, res: Response) => {
  try {
    const subscriptionId = req.params.id;
    const { status, planId, currentPeriodEnd } = req.body;

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (planId) updateData.planId = planId;
    if (currentPeriodEnd) updateData.currentPeriodEnd = new Date(currentPeriodEnd);

    const subscription = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: updateData,
      include: { user: true },
    });

    // Invalidar cache del usuario
    premiumFeaturesService.invalidateCache(subscription.userId);

    res.json({
      success: true,
      data: subscription,
      message: req.t('api:payments.subscriptionUpdated'),
    });
  } catch (error) {
    logger.error('Error actualizando suscripción:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error actualizando suscripción',
    });
  }
});

// ==================== PAGOS ====================

/**
 * GET /api/v1/admin/payments/payments
 * Lista todos los pagos
 */
router.get('/payments', async (req: Request, res: Response) => {
  try {
    const { limit, offset, status, from, to } = req.query;

    const result = await paymentService.getAllPayments({
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      status: status as PaymentStatus | undefined,
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined,
    });

    res.json({
      success: true,
      data: result.payments,
      pagination: {
        total: result.total,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      },
    });
  } catch (error) {
    logger.error('Error obteniendo pagos:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error obteniendo pagos',
    });
  }
});

/**
 * POST /api/v1/admin/payments/payments/:id/refund
 * Procesa un reembolso
 */
router.post('/payments/:id/refund', async (req: Request, res: Response) => {
  try {
    const paymentId = req.params.id;
    const { amount, reason } = req.body;

    const payment = await paymentService.createRefund(paymentId, amount, reason);

    res.json({
      success: true,
      data: payment,
      message: req.t('api:payments.refundProcessed'),
    });
  } catch (error) {
    logger.error('Error procesando reembolso:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error procesando reembolso',
    });
  }
});

// ==================== FACTURAS ====================

/**
 * GET /api/v1/admin/payments/invoices
 * Lista todas las facturas
 */
router.get('/invoices', async (req: Request, res: Response) => {
  try {
    const { limit, offset, status, from, to } = req.query;

    const result = await invoiceService.getAllInvoices({
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      status: status as InvoiceStatus | undefined,
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined,
    });

    res.json({
      success: true,
      data: result.invoices,
      pagination: {
        total: result.total,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      },
    });
  } catch (error) {
    logger.error('Error obteniendo facturas:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error obteniendo facturas',
    });
  }
});

/**
 * POST /api/v1/admin/payments/invoices/:id/cancel
 * Cancela una factura
 */
router.post('/invoices/:id/cancel', async (req: Request, res: Response) => {
  try {
    const invoiceId = req.params.id;

    const invoice = await invoiceService.cancelInvoice(invoiceId);

    res.json({
      success: true,
      data: invoice,
      message: req.t('api:payments.invoiceCancelled'),
    });
  } catch (error) {
    logger.error('Error cancelando factura:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error cancelando factura',
    });
  }
});

// ==================== ESTADÍSTICAS ====================

/**
 * GET /api/v1/admin/payments/stats
 * Obtiene estadísticas de ingresos y suscripciones
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Ejecutar todas las queries en paralelo
    const [
      totalRevenue,
      monthlyRevenue,
      activeSubscriptions,
      trialSubscriptions,
      cancelledSubscriptions,
      totalUsers,
      revenueByMonth,
      subscriptionsByPlan,
    ] = await Promise.all([
      // Total de ingresos
      prisma.payment.aggregate({
        where: { status: PaymentStatus.SUCCEEDED },
        _sum: { amount: true },
      }),
      // Ingresos del mes
      prisma.payment.aggregate({
        where: {
          status: PaymentStatus.SUCCEEDED,
          paidAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
      }),
      // Suscripciones activas (todas, ya no hay plan free)
      prisma.subscription.count({
        where: {
          status: SubscriptionStatus.ACTIVE,
        },
      }),
      // Suscripciones en trial
      prisma.subscription.count({
        where: { status: SubscriptionStatus.TRIALING },
      }),
      // Suscripciones canceladas (este mes)
      prisma.subscription.count({
        where: {
          status: SubscriptionStatus.CANCELED,
          cancelledAt: { gte: startOfMonth },
        },
      }),
      // Total usuarios
      prisma.user.count(),
      // Ingresos por mes (últimos 12 meses)
      prisma.$queryRaw<{ month: string; amount: number }[]>`
        SELECT
          TO_CHAR(DATE_TRUNC('month', "paidAt"), 'YYYY-MM') as month,
          COALESCE(SUM(amount), 0)::float as amount
        FROM "Payment"
        WHERE status = 'SUCCEEDED'
          AND "paidAt" >= ${new Date(now.getFullYear() - 1, now.getMonth(), 1)}
        GROUP BY DATE_TRUNC('month', "paidAt")
        ORDER BY month DESC
        LIMIT 12
      `,
      // Suscripciones por plan
      prisma.subscription.groupBy({
        by: ['planId'],
        where: {
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
        },
        _count: true,
      }),
    ]);

    // Obtener nombres de planes
    const planIds = subscriptionsByPlan.map((s) => s.planId);
    const plans = await prisma.subscriptionPlan.findMany({
      where: { id: { in: planIds } },
      select: { id: true, name: true },
    });
    const planMap = new Map(plans.map((p) => [p.id, p.name]));

    const stats: RevenueStats = {
      totalRevenue: Number(totalRevenue._sum.amount || 0),
      monthlyRevenue: Number(monthlyRevenue._sum.amount || 0),
      activeSubscriptions,
      trialSubscriptions,
      cancelledSubscriptions,
      conversionRate: totalUsers > 0 ? (activeSubscriptions / totalUsers) * 100 : 0,
      averageRevenuePerUser:
        activeSubscriptions > 0
          ? Number(totalRevenue._sum.amount || 0) / activeSubscriptions
          : 0,
      revenueByMonth: revenueByMonth.map((r) => ({
        month: r.month,
        amount: Number(r.amount),
      })),
      subscriptionsByPlan: subscriptionsByPlan.map((s) => ({
        plan: planMap.get(s.planId) || 'Desconocido',
        count: s._count,
      })),
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error obteniendo estadísticas',
    });
  }
});

/**
 * GET /api/v1/admin/payments/revenue-chart
 * Obtiene datos para gráfico de ingresos
 */
router.get('/revenue-chart', async (req: Request, res: Response) => {
  try {
    const { period } = req.query; // daily, weekly, monthly
    const now = new Date();

    let dateFormat: string;
    let startDate: Date;

    switch (period) {
      case 'daily':
        dateFormat = 'YYYY-MM-DD';
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
        break;
      case 'weekly':
        dateFormat = 'IYYY-IW'; // ISO year and week
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        break;
      case 'monthly':
      default:
        dateFormat = 'YYYY-MM';
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    }

    const data = await prisma.$queryRaw<{ period: string; amount: number; count: number }[]>`
      SELECT
        TO_CHAR(DATE_TRUNC(${period === 'daily' ? 'day' : period === 'weekly' ? 'week' : 'month'}, "paidAt"), ${dateFormat}) as period,
        COALESCE(SUM(amount), 0)::float as amount,
        COUNT(*)::int as count
      FROM "Payment"
      WHERE status = 'SUCCEEDED'
        AND "paidAt" >= ${startDate}
      GROUP BY DATE_TRUNC(${period === 'daily' ? 'day' : period === 'weekly' ? 'week' : 'month'}, "paidAt")
      ORDER BY period ASC
    `;

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error('Error obteniendo datos de gráfico:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error obteniendo datos de gráfico',
    });
  }
});

export default router;
