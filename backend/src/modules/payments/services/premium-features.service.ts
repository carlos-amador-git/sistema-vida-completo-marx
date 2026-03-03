// src/modules/payments/services/premium-features.service.ts
import { SubscriptionStatus } from '@prisma/client';
import type { PlanFeatures, PlanLimits } from '../types/payments.types';
import { prisma } from '../../../common/prisma';

// Modo Demo - simula Premium para todos los usuarios
const DEMO_PREMIUM_MODE = process.env.DEMO_PREMIUM_MODE === 'true';

// Features y límites Premium para modo demo
const DEMO_PREMIUM_FEATURES: PlanFeatures = {
  advanceDirectives: true,
  donorPreferences: true,
  nom151Seal: true,
  smsNotifications: true,
  exportData: true,
  prioritySupport: true,
};

const DEMO_PREMIUM_LIMITS: PlanLimits = {
  representativesLimit: 0, // ilimitado
  qrDownloadsPerMonth: 0, // ilimitado
};

// Features disponibles en el sistema
export type FeatureKey = keyof PlanFeatures;
export type LimitKey = keyof PlanLimits;

// Cache en memoria para evitar queries repetidas
const userFeaturesCache = new Map<string, { features: PlanFeatures; limits: PlanLimits; expiresAt: number }>();
const CACHE_TTL = 60 * 1000; // 1 minuto

export const premiumFeaturesService = {
  /**
   * Obtener features y límites del usuario
   */
  async getUserFeaturesAndLimits(
    userId: string
  ): Promise<{ features: PlanFeatures; limits: PlanLimits; planSlug: string }> {
    // Verificar cache
    const cached = userFeaturesCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached, planSlug: 'cached' };
    }

    // Obtener suscripción con plan
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    // Si no tiene suscripción o está cancelada, usar plan gratuito
    if (
      !subscription ||
      subscription.status === SubscriptionStatus.CANCELED ||
      subscription.status === SubscriptionStatus.UNPAID
    ) {
      const freePlan = await this.getFreePlanDefaults();
      userFeaturesCache.set(userId, {
        features: freePlan.features,
        limits: freePlan.limits,
        expiresAt: Date.now() + CACHE_TTL,
      });
      return { ...freePlan, planSlug: 'free' };
    }

    const features = subscription.plan.features as unknown as PlanFeatures;
    const limits = subscription.plan.limits as unknown as PlanLimits;

    // Guardar en cache
    userFeaturesCache.set(userId, {
      features,
      limits,
      expiresAt: Date.now() + CACHE_TTL,
    });

    return {
      features,
      limits,
      planSlug: subscription.plan.slug,
    };
  },

  /**
   * Verificar si el usuario tiene acceso a una feature
   */
  async hasFeature(userId: string, featureKey: FeatureKey): Promise<boolean> {
    const { features } = await this.getUserFeaturesAndLimits(userId);
    return features[featureKey] === true;
  },

  /**
   * Verificar si el usuario tiene acceso a múltiples features
   */
  async hasAllFeatures(userId: string, featureKeys: FeatureKey[]): Promise<boolean> {
    const { features } = await this.getUserFeaturesAndLimits(userId);
    return featureKeys.every((key) => features[key] === true);
  },

  /**
   * Verificar si el usuario tiene acceso a al menos una feature
   */
  async hasAnyFeature(userId: string, featureKeys: FeatureKey[]): Promise<boolean> {
    const { features } = await this.getUserFeaturesAndLimits(userId);
    return featureKeys.some((key) => features[key] === true);
  },

  /**
   * Obtener límite de un recurso
   */
  async getLimit(userId: string, limitKey: LimitKey): Promise<number> {
    const { limits } = await this.getUserFeaturesAndLimits(userId);
    return limits[limitKey] ?? 0;
  },

  /**
   * Verificar si el usuario puede crear más de un recurso
   */
  async canCreateResource(
    userId: string,
    limitKey: LimitKey,
    currentCount: number
  ): Promise<{ allowed: boolean; limit: number; current: number }> {
    const limit = await this.getLimit(userId, limitKey);

    // 0 significa ilimitado
    if (limit === 0) {
      return { allowed: true, limit: 0, current: currentCount };
    }

    return {
      allowed: currentCount < limit,
      limit,
      current: currentCount,
    };
  },

  /**
   * Verificar límite de representantes
   */
  async canAddRepresentative(userId: string): Promise<{ allowed: boolean; limit: number; current: number }> {
    const currentCount = await prisma.representative.count({ where: { userId } });
    return this.canCreateResource(userId, 'representativesLimit', currentCount);
  },

  /**
   * Verificar límite de descargas QR por mes
   */
  async canDownloadQR(userId: string): Promise<{ allowed: boolean; limit: number; current: number }> {
    // Contar descargas del mes actual
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Contar descargas QR del mes actual
    const currentCount = await prisma.qRDownload.count({
      where: {
        userId,
        createdAt: { gte: startOfMonth },
      },
    });

    return this.canCreateResource(userId, 'qrDownloadsPerMonth', currentCount);
  },

  /**
   * Registrar una descarga de QR
   */
  async trackQRDownload(
    userId: string,
    downloadType: 'png' | 'svg' | 'pdf' | 'wallet',
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ success: boolean; downloadsRemaining: number | null }> {
    // Verificar si puede descargar
    const canDownload = await this.canDownloadQR(userId);

    if (!canDownload.allowed) {
      return {
        success: false,
        downloadsRemaining: 0,
      };
    }

    // Registrar la descarga
    await prisma.qRDownload.create({
      data: {
        userId,
        downloadType,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
      },
    });

    // Calcular descargas restantes
    const downloadsRemaining = canDownload.limit === 0
      ? null // Ilimitado
      : canDownload.limit - canDownload.current - 1;

    return {
      success: true,
      downloadsRemaining,
    };
  },

  /**
   * Obtener estadísticas de descargas QR del usuario
   */
  async getQRDownloadStats(userId: string): Promise<{
    thisMonth: number;
    total: number;
    limit: number;
    remaining: number | null;
    lastDownload: Date | null;
  }> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [thisMonth, total, lastDownload, limit] = await Promise.all([
      prisma.qRDownload.count({
        where: { userId, createdAt: { gte: startOfMonth } },
      }),
      prisma.qRDownload.count({
        where: { userId },
      }),
      prisma.qRDownload.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.getLimit(userId, 'qrDownloadsPerMonth'),
    ]);

    return {
      thisMonth,
      total,
      limit,
      remaining: limit === 0 ? null : Math.max(0, limit - thisMonth),
      lastDownload: lastDownload?.createdAt || null,
    };
  },

  /**
   * Verificar si el usuario tiene suscripción Premium activa
   */
  async isPremium(userId: string): Promise<boolean> {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (!subscription) return false;

    const isActiveStatus =
      subscription.status === SubscriptionStatus.ACTIVE ||
      subscription.status === SubscriptionStatus.TRIALING;

    const isPremiumPlan = subscription.plan.slug !== 'free';

    return isActiveStatus && isPremiumPlan;
  },

  /**
   * Verificar si el usuario está en trial
   */
  async isInTrial(userId: string): Promise<{ inTrial: boolean; daysLeft: number }> {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription || subscription.status !== SubscriptionStatus.TRIALING) {
      return { inTrial: false, daysLeft: 0 };
    }

    if (!subscription.trialEndsAt) {
      return { inTrial: false, daysLeft: 0 };
    }

    const now = new Date();
    const trialEnd = new Date(subscription.trialEndsAt);
    const daysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    return { inTrial: true, daysLeft };
  },

  /**
   * Obtener resumen del estado premium del usuario
   */
  async getPremiumStatus(userId: string): Promise<{
    isPremium: boolean;
    planName: string;
    planSlug: string;
    status: SubscriptionStatus | null;
    features: PlanFeatures;
    limits: PlanLimits;
    inTrial: boolean;
    trialDaysLeft: number;
    expiresAt: Date | null;
    cancelAtPeriodEnd: boolean;
  }> {
    // Modo Demo - simular Premium para todos
    if (DEMO_PREMIUM_MODE) {
      return {
        isPremium: true,
        planName: 'Plan Premium (Demo)',
        planSlug: 'premium',
        status: SubscriptionStatus.ACTIVE,
        features: DEMO_PREMIUM_FEATURES,
        limits: DEMO_PREMIUM_LIMITS,
        inTrial: false,
        trialDaysLeft: 0,
        expiresAt: null,
        cancelAtPeriodEnd: false,
      };
    }

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (!subscription) {
      const freePlan = await this.getFreePlanDefaults();
      return {
        isPremium: false,
        planName: 'Plan Gratuito',
        planSlug: 'free',
        status: null,
        features: freePlan.features,
        limits: freePlan.limits,
        inTrial: false,
        trialDaysLeft: 0,
        expiresAt: null,
        cancelAtPeriodEnd: false,
      };
    }

    const isPremium =
      (subscription.status === SubscriptionStatus.ACTIVE ||
        subscription.status === SubscriptionStatus.TRIALING) &&
      subscription.plan.slug !== 'free';

    const { inTrial, daysLeft } = await this.isInTrial(userId);

    return {
      isPremium,
      planName: subscription.plan.name,
      planSlug: subscription.plan.slug,
      status: subscription.status,
      features: subscription.plan.features as unknown as PlanFeatures,
      limits: subscription.plan.limits as unknown as PlanLimits,
      inTrial,
      trialDaysLeft: daysLeft,
      expiresAt: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    };
  },

  /**
   * Invalidar cache de un usuario
   */
  invalidateCache(userId: string): void {
    userFeaturesCache.delete(userId);
  },

  /**
   * Invalidar todo el cache
   */
  clearCache(): void {
    userFeaturesCache.clear();
  },

  // ==================== HELPERS ====================

  /**
   * Obtener valores por defecto del plan gratuito
   */
  async getFreePlanDefaults(): Promise<{ features: PlanFeatures; limits: PlanLimits }> {
    const freePlan = await prisma.subscriptionPlan.findFirst({
      where: {
        OR: [{ slug: 'free' }, { isDefault: true }],
        isActive: true,
      },
    });

    if (freePlan) {
      return {
        features: freePlan.features as unknown as PlanFeatures,
        limits: freePlan.limits as unknown as PlanLimits,
      };
    }

    // Valores por defecto si no existe plan gratuito
    return {
      features: {
        advanceDirectives: false,
        donorPreferences: false,
        nom151Seal: false,
        smsNotifications: false,
        exportData: true, // Free per LFPDPPP data portability right
        prioritySupport: false,
      },
      limits: {
        representativesLimit: 2,
        qrDownloadsPerMonth: 3,
      },
    };
  },
};
