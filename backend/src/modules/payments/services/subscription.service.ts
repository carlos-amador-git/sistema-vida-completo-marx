// src/modules/payments/services/subscription.service.ts
import { BillingCycle, SubscriptionStatus } from '@prisma/client';
import { stripeService } from './stripe.service';
import config from '../../../config';
import { emailService } from '../../../common/services/email.service';
import { emailTemplates } from '../../../common/services/email-templates.service';
import { logger } from '../../../common/services/logger.service';
import type {
  SubscriptionDTO,
  SubscriptionPlanDTO,
  CreateCheckoutSessionInput,
  CheckoutSessionResult,
  BillingPortalResult,
  PlanFeatures,
  PlanLimits,
} from '../types/payments.types';

import { prisma } from '../../../common/prisma';

export const subscriptionService = {
  /**
   * Obtener todos los planes activos
   */
  async getPlans(): Promise<SubscriptionPlanDTO[]> {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    });

    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      priceMonthly: plan.priceMonthly ? Number(plan.priceMonthly) : null,
      priceAnnual: plan.priceAnnual ? Number(plan.priceAnnual) : null,
      currency: plan.currency,
      features: plan.features as unknown as PlanFeatures,
      limits: plan.limits as unknown as PlanLimits,
      trialDays: plan.trialDays,
      isDefault: plan.isDefault,
      displayOrder: plan.displayOrder,
    }));
  },

  /**
   * Obtener plan por ID
   */
  async getPlanById(planId: string): Promise<SubscriptionPlanDTO | null> {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) return null;

    return {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      priceMonthly: plan.priceMonthly ? Number(plan.priceMonthly) : null,
      priceAnnual: plan.priceAnnual ? Number(plan.priceAnnual) : null,
      currency: plan.currency,
      features: plan.features as unknown as PlanFeatures,
      limits: plan.limits as unknown as PlanLimits,
      trialDays: plan.trialDays,
      isDefault: plan.isDefault,
      displayOrder: plan.displayOrder,
    };
  },

  /**
   * Obtener plan por slug
   */
  async getPlanBySlug(slug: string): Promise<SubscriptionPlanDTO | null> {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { slug },
    });

    if (!plan) return null;

    return {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      priceMonthly: plan.priceMonthly ? Number(plan.priceMonthly) : null,
      priceAnnual: plan.priceAnnual ? Number(plan.priceAnnual) : null,
      currency: plan.currency,
      features: plan.features as unknown as PlanFeatures,
      limits: plan.limits as unknown as PlanLimits,
      trialDays: plan.trialDays,
      isDefault: plan.isDefault,
      displayOrder: plan.displayOrder,
    };
  },

  /**
   * Obtener la suscripción del usuario
   */
  async getUserSubscription(userId: string): Promise<SubscriptionDTO | null> {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (!subscription) return null;

    return {
      id: subscription.id,
      userId: subscription.userId,
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        slug: subscription.plan.slug,
        description: subscription.plan.description,
        priceMonthly: subscription.plan.priceMonthly ? Number(subscription.plan.priceMonthly) : null,
        priceAnnual: subscription.plan.priceAnnual ? Number(subscription.plan.priceAnnual) : null,
        currency: subscription.plan.currency,
        features: subscription.plan.features as unknown as PlanFeatures,
        limits: subscription.plan.limits as unknown as PlanLimits,
        trialDays: subscription.plan.trialDays,
        isDefault: subscription.plan.isDefault,
        displayOrder: subscription.plan.displayOrder,
      },
      billingCycle: subscription.billingCycle,
      status: subscription.status,
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      cancelledAt: subscription.cancelledAt,
      createdAt: subscription.createdAt,
    };
  },

  /**
   * Crear suscripción gratuita para nuevo usuario
   */
  async createFreeSubscription(userId: string): Promise<SubscriptionDTO> {
    // Buscar el plan gratuito
    const freePlan = await prisma.subscriptionPlan.findFirst({
      where: {
        OR: [
          { slug: 'free' },
          { isDefault: true },
        ],
        isActive: true,
      },
    });

    if (!freePlan) {
      throw new Error('No se encontró el plan gratuito');
    }

    const now = new Date();
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 100); // "Infinito" para plan gratuito

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        planId: freePlan.id,
        billingCycle: BillingCycle.MONTHLY,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: endDate,
      },
      include: { plan: true },
    });

    return {
      id: subscription.id,
      userId: subscription.userId,
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        slug: subscription.plan.slug,
        description: subscription.plan.description,
        priceMonthly: subscription.plan.priceMonthly ? Number(subscription.plan.priceMonthly) : null,
        priceAnnual: subscription.plan.priceAnnual ? Number(subscription.plan.priceAnnual) : null,
        currency: subscription.plan.currency,
        features: subscription.plan.features as unknown as PlanFeatures,
        limits: subscription.plan.limits as unknown as PlanLimits,
        trialDays: subscription.plan.trialDays,
        isDefault: subscription.plan.isDefault,
        displayOrder: subscription.plan.displayOrder,
      },
      billingCycle: subscription.billingCycle,
      status: subscription.status,
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      cancelledAt: subscription.cancelledAt,
      createdAt: subscription.createdAt,
    };
  },

  /**
   * Crear sesión de checkout para upgrade
   */
  async createUpgradeCheckoutSession(
    userId: string,
    input: CreateCheckoutSessionInput
  ): Promise<CheckoutSessionResult> {
    // Obtener usuario
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Obtener plan destino
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: input.planId },
    });

    if (!plan) {
      throw new Error('Plan no encontrado');
    }

    // Obtener o crear cliente en Stripe
    const stripeCustomer = await stripeService.getOrCreateCustomer(
      userId,
      user.email,
      user.name
    );

    // Actualizar stripeCustomerId si no existe
    if (user.subscription && !user.subscription.stripeCustomerId) {
      await prisma.subscription.update({
        where: { id: user.subscription.id },
        data: { stripeCustomerId: stripeCustomer.id },
      });
    }

    // Obtener priceId según ciclo
    const priceId = stripeService.getPriceIdForCycle(
      plan.stripePriceIdMonthly,
      plan.stripePriceIdAnnual,
      input.billingCycle
    );

    // Crear sesión de checkout
    const session = await stripeService.createCheckoutSession({
      customerId: stripeCustomer.id,
      priceId,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      trialDays: plan.trialDays,
      metadata: {
        userId,
        planId: input.planId,
        billingCycle: input.billingCycle,
      },
    });

    return {
      sessionId: session.id,
      url: session.url!,
    };
  },

  /**
   * Procesar checkout exitoso (llamado desde webhook)
   */
  async processCheckoutCompleted(
    stripeSubscriptionId: string,
    stripeCustomerId: string,
    metadata: { userId: string; planId: string; billingCycle: string }
  ): Promise<void> {
    const stripeSubscription = await stripeService.getSubscription(stripeSubscriptionId);

    // Actualizar o crear suscripción
    await prisma.subscription.upsert({
      where: { userId: metadata.userId },
      update: {
        planId: metadata.planId,
        stripeSubscriptionId,
        stripeCustomerId,
        billingCycle: metadata.billingCycle as BillingCycle,
        status: this.mapStripeStatus(stripeSubscription.status),
        trialEndsAt: stripeSubscription.trial_end
          ? new Date(stripeSubscription.trial_end * 1000)
          : null,
        currentPeriodStart: new Date((stripeSubscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((stripeSubscription as any).current_period_end * 1000),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      },
      create: {
        userId: metadata.userId,
        planId: metadata.planId,
        stripeSubscriptionId,
        stripeCustomerId,
        billingCycle: metadata.billingCycle as BillingCycle,
        status: this.mapStripeStatus(stripeSubscription.status),
        trialEndsAt: stripeSubscription.trial_end
          ? new Date(stripeSubscription.trial_end * 1000)
          : null,
        currentPeriodStart: new Date((stripeSubscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((stripeSubscription as any).current_period_end * 1000),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      },
    });

    // Enviar notificación de suscripción activada
    this.sendSubscriptionCreatedEmail(metadata.userId, metadata.planId).catch(err => {
      logger.error('Error enviando email de suscripción', err, { userId: metadata.userId });
    });
  },

  /**
   * Cancelar suscripción
   */
  async cancelSubscription(
    userId: string,
    reason?: string,
    cancelImmediately: boolean = false
  ): Promise<SubscriptionDTO> {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new Error('No tienes una suscripción activa');
    }

    // Si es plan gratuito, no se puede cancelar
    if (subscription.plan.slug === 'free') {
      throw new Error('No se puede cancelar el plan gratuito');
    }

    // Cancelar en Stripe si existe
    if (subscription.stripeSubscriptionId) {
      await stripeService.cancelSubscription(
        subscription.stripeSubscriptionId,
        cancelImmediately
      );
    }

    // Actualizar en BD
    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: !cancelImmediately,
        cancelledAt: cancelImmediately ? new Date() : null,
        cancelReason: reason,
        status: cancelImmediately ? SubscriptionStatus.CANCELED : subscription.status,
      },
      include: { plan: true },
    });

    // Enviar notificación de cancelación
    this.sendSubscriptionCancelledEmail(userId, updated.plan.name, updated.currentPeriodEnd).catch(err => {
      logger.error('Error enviando email de cancelación', err, { userId });
    });

    return this.formatSubscription(updated);
  },

  /**
   * Reactivar suscripción
   */
  async reactivateSubscription(userId: string): Promise<SubscriptionDTO> {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new Error('No tienes una suscripción');
    }

    if (!subscription.cancelAtPeriodEnd) {
      throw new Error('La suscripción no está programada para cancelarse');
    }

    // Reactivar en Stripe
    if (subscription.stripeSubscriptionId) {
      await stripeService.reactivateSubscription(subscription.stripeSubscriptionId);
    }

    // Actualizar en BD
    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        cancelReason: null,
      },
      include: { plan: true },
    });

    return this.formatSubscription(updated);
  },

  /**
   * Crear sesión del portal de facturación
   */
  async createBillingPortalSession(userId: string): Promise<BillingPortalResult> {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription?.stripeCustomerId) {
      throw new Error('No tienes un método de pago configurado');
    }

    const session = await stripeService.createBillingPortalSession(
      subscription.stripeCustomerId,
      `${config.frontendUrl}/subscription`
    );

    return { url: session.url };
  },

  /**
   * Sincronizar estado desde Stripe (webhook)
   */
  async syncFromStripe(stripeSubscriptionId: string): Promise<void> {
    const stripeSubscription = await stripeService.getSubscription(stripeSubscriptionId);

    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId },
      data: {
        status: this.mapStripeStatus(stripeSubscription.status),
        currentPeriodStart: new Date((stripeSubscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((stripeSubscription as any).current_period_end * 1000),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        cancelledAt: stripeSubscription.canceled_at
          ? new Date(stripeSubscription.canceled_at * 1000)
          : null,
      },
    });
  },

  /**
   * Degradar a plan gratuito (cuando expira suscripción)
   */
  async downgradeToFree(userId: string): Promise<void> {
    const freePlan = await prisma.subscriptionPlan.findFirst({
      where: {
        OR: [{ slug: 'free' }, { isDefault: true }],
        isActive: true,
      },
    });

    if (!freePlan) {
      throw new Error('No se encontró el plan gratuito');
    }

    const now = new Date();
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 100);

    await prisma.subscription.update({
      where: { userId },
      data: {
        planId: freePlan.id,
        stripeSubscriptionId: null,
        billingCycle: BillingCycle.MONTHLY,
        status: SubscriptionStatus.ACTIVE,
        trialEndsAt: null,
        currentPeriodStart: now,
        currentPeriodEnd: endDate,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        cancelReason: null,
      },
    });
  },

  // ==================== HELPERS ====================

  mapStripeStatus(stripeStatus: string): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE,
      trialing: SubscriptionStatus.TRIALING,
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELED,
      unpaid: SubscriptionStatus.UNPAID,
      incomplete: SubscriptionStatus.INCOMPLETE,
      incomplete_expired: SubscriptionStatus.CANCELED,
      paused: SubscriptionStatus.PAUSED,
    };

    return statusMap[stripeStatus] || SubscriptionStatus.ACTIVE;
  },

  formatSubscription(subscription: {
    id: string;
    userId: string;
    billingCycle: BillingCycle;
    status: SubscriptionStatus;
    trialEndsAt: Date | null;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    cancelledAt: Date | null;
    createdAt: Date;
    plan: {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      priceMonthly: { toString(): string } | null;
      priceAnnual: { toString(): string } | null;
      currency: string;
      features: unknown;
      limits: unknown;
      trialDays: number;
      isDefault: boolean;
      displayOrder: number;
    };
  }): SubscriptionDTO {
    return {
      id: subscription.id,
      userId: subscription.userId,
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        slug: subscription.plan.slug,
        description: subscription.plan.description,
        priceMonthly: subscription.plan.priceMonthly
          ? Number(subscription.plan.priceMonthly)
          : null,
        priceAnnual: subscription.plan.priceAnnual
          ? Number(subscription.plan.priceAnnual)
          : null,
        currency: subscription.plan.currency,
        features: subscription.plan.features as unknown as PlanFeatures,
        limits: subscription.plan.limits as unknown as PlanLimits,
        trialDays: subscription.plan.trialDays,
        isDefault: subscription.plan.isDefault,
        displayOrder: subscription.plan.displayOrder,
      },
      billingCycle: subscription.billingCycle,
      status: subscription.status,
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      cancelledAt: subscription.cancelledAt,
      createdAt: subscription.createdAt,
    };
  },

  // ==================== EMAIL NOTIFICATIONS ====================

  /**
   * Envía email de confirmación de suscripción
   */
  async sendSubscriptionCreatedEmail(userId: string, planId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });

    if (!user || !plan) return;

    const features = (plan.features as { items?: string[] })?.items || [];
    const price = plan.priceMonthly ? `$${Number(plan.priceMonthly).toFixed(0)}` : 'Gratis';

    const { subject, html } = emailTemplates.subscriptionCreated({
      name: user.name,
      planName: plan.name,
      price,
      features,
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Aprox 30 días
    });

    const result = await emailService.send({
      to: user.email,
      subject,
      html,
    });

    if (result.success) {
      logger.info('Email de suscripción enviado', { userId, planId });
    }
  },

  /**
   * Envía email de cancelación de suscripción
   */
  async sendSubscriptionCancelledEmail(userId: string, planName: string, endDate: Date): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) return;

    const { subject, html } = emailTemplates.subscriptionCancelled({
      name: user.name,
      planName,
      endDate,
    });

    const result = await emailService.send({
      to: user.email,
      subject,
      html,
    });

    if (result.success) {
      logger.info('Email de cancelación enviado', { userId });
    }
  },
};
