// src/modules/payments/services/payment.service.ts
import { logger } from '../../../common/services/logger.service';
import { PaymentStatus, PaymentMethodType } from '@prisma/client';
import { stripeService } from './stripe.service';
import type {
  PaymentDTO,
  PaymentMethodDTO,
  SavePaymentMethodInput,
} from '../types/payments.types';

import { prisma } from '../../../common/prisma';

export const paymentService = {
  /**
   * Obtener historial de pagos del usuario
   */
  async getUserPayments(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ payments: PaymentDTO[]; total: number }> {
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 20,
        skip: options?.offset || 0,
      }),
      prisma.payment.count({ where: { userId } }),
    ]);

    return {
      payments: payments.map(this.formatPayment),
      total,
    };
  },

  /**
   * Obtener pago por ID
   */
  async getPaymentById(paymentId: string, userId?: string): Promise<PaymentDTO | null> {
    const where: { id: string; userId?: string } = { id: paymentId };
    if (userId) {
      where.userId = userId;
    }

    const payment = await prisma.payment.findFirst({ where });
    return payment ? this.formatPayment(payment) : null;
  },

  /**
   * Crear registro de pago
   */
  async createPayment(data: {
    userId: string;
    subscriptionId?: string;
    stripePaymentIntentId?: string;
    stripeChargeId?: string;
    stripeInvoiceId?: string;
    amount: number;
    currency?: string;
    paymentMethod: PaymentMethodType;
    last4?: string;
    cardBrand?: string;
    oxxoVoucherUrl?: string;
    oxxoExpiresAt?: Date;
    status?: PaymentStatus;
    description?: string;
  }): Promise<PaymentDTO> {
    const payment = await prisma.payment.create({
      data: {
        userId: data.userId,
        subscriptionId: data.subscriptionId,
        stripePaymentIntentId: data.stripePaymentIntentId,
        stripeChargeId: data.stripeChargeId,
        stripeInvoiceId: data.stripeInvoiceId,
        amount: data.amount,
        currency: data.currency || 'MXN',
        paymentMethod: data.paymentMethod,
        last4: data.last4,
        cardBrand: data.cardBrand,
        oxxoVoucherUrl: data.oxxoVoucherUrl,
        oxxoExpiresAt: data.oxxoExpiresAt,
        status: data.status || PaymentStatus.PENDING,
        description: data.description,
      },
    });

    return this.formatPayment(payment);
  },

  /**
   * Actualizar estado de pago
   */
  async updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus,
    additionalData?: {
      paidAt?: Date;
      failureCode?: string;
      failureMessage?: string;
      stripeChargeId?: string;
    }
  ): Promise<PaymentDTO> {
    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status,
        ...additionalData,
      },
    });

    return this.formatPayment(payment);
  },

  /**
   * Actualizar pago por stripePaymentIntentId
   */
  async updatePaymentByStripeId(
    stripePaymentIntentId: string,
    data: {
      status?: PaymentStatus;
      paidAt?: Date;
      stripeChargeId?: string;
      failureCode?: string;
      failureMessage?: string;
      last4?: string;
      cardBrand?: string;
    }
  ): Promise<void> {
    await prisma.payment.updateMany({
      where: { stripePaymentIntentId },
      data,
    });
  },

  /**
   * Obtener métodos de pago del usuario
   */
  async getUserPaymentMethods(userId: string): Promise<PaymentMethodDTO[]> {
    const methods = await prisma.paymentMethod.findMany({
      where: { userId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return methods.map((m) => ({
      id: m.id,
      stripePaymentMethodId: m.stripePaymentMethodId,
      type: m.type,
      last4: m.last4,
      brand: m.brand,
      expMonth: m.expMonth,
      expYear: m.expYear,
      cardholderName: m.cardholderName,
      isDefault: m.isDefault,
      createdAt: m.createdAt,
    }));
  },

  /**
   * Guardar método de pago
   */
  async savePaymentMethod(
    userId: string,
    input: SavePaymentMethodInput
  ): Promise<PaymentMethodDTO> {
    // Obtener detalles del método de Stripe
    const stripeMethod = await stripeService.getPaymentMethod(input.stripePaymentMethodId);

    if (stripeMethod.type !== 'card' || !stripeMethod.card) {
      throw new Error('Solo se aceptan tarjetas como método de pago');
    }

    // Obtener suscripción para el customerId
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription?.stripeCustomerId) {
      // Crear customer en Stripe primero
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('Usuario no encontrado');

      const customer = await stripeService.getOrCreateCustomer(userId, user.email, user.name);

      await prisma.subscription.update({
        where: { id: subscription?.id },
        data: { stripeCustomerId: customer.id },
      });

      // Adjuntar método al cliente
      await stripeService.attachPaymentMethod(input.stripePaymentMethodId, customer.id);

      if (input.setAsDefault) {
        await stripeService.setDefaultPaymentMethod(customer.id, input.stripePaymentMethodId);
      }
    } else {
      // Adjuntar al cliente existente
      await stripeService.attachPaymentMethod(
        input.stripePaymentMethodId,
        subscription.stripeCustomerId
      );

      if (input.setAsDefault) {
        await stripeService.setDefaultPaymentMethod(
          subscription.stripeCustomerId,
          input.stripePaymentMethodId
        );
      }
    }

    // Si es default, quitar default de los demás
    if (input.setAsDefault) {
      await prisma.paymentMethod.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    // Guardar en BD
    const method = await prisma.paymentMethod.create({
      data: {
        userId,
        stripePaymentMethodId: input.stripePaymentMethodId,
        type: PaymentMethodType.CARD,
        last4: stripeMethod.card.last4 || '',
        brand: stripeMethod.card.brand || '',
        expMonth: stripeMethod.card.exp_month,
        expYear: stripeMethod.card.exp_year,
        cardholderName: stripeMethod.billing_details.name,
        isDefault: input.setAsDefault || false,
      },
    });

    return {
      id: method.id,
      stripePaymentMethodId: method.stripePaymentMethodId,
      type: method.type,
      last4: method.last4,
      brand: method.brand,
      expMonth: method.expMonth,
      expYear: method.expYear,
      cardholderName: method.cardholderName,
      isDefault: method.isDefault,
      createdAt: method.createdAt,
    };
  },

  /**
   * Eliminar método de pago
   */
  async deletePaymentMethod(userId: string, methodId: string): Promise<void> {
    const method = await prisma.paymentMethod.findFirst({
      where: { id: methodId, userId },
    });

    if (!method) {
      throw new Error('Método de pago no encontrado');
    }

    // Eliminar de Stripe
    try {
      await stripeService.detachPaymentMethod(method.stripePaymentMethodId);
    } catch (error) {
      logger.error('Error al eliminar método de Stripe:', error);
    }

    // Marcar como inactivo en BD
    await prisma.paymentMethod.update({
      where: { id: methodId },
      data: { isActive: false },
    });
  },

  /**
   * Establecer método de pago como default
   */
  async setDefaultPaymentMethod(userId: string, methodId: string): Promise<void> {
    const method = await prisma.paymentMethod.findFirst({
      where: { id: methodId, userId, isActive: true },
    });

    if (!method) {
      throw new Error('Método de pago no encontrado');
    }

    // Actualizar en Stripe
    const subscription = await prisma.subscription.findUnique({ where: { userId } });
    if (subscription?.stripeCustomerId) {
      await stripeService.setDefaultPaymentMethod(
        subscription.stripeCustomerId,
        method.stripePaymentMethodId
      );
    }

    // Actualizar en BD
    await prisma.$transaction([
      prisma.paymentMethod.updateMany({
        where: { userId },
        data: { isDefault: false },
      }),
      prisma.paymentMethod.update({
        where: { id: methodId },
        data: { isDefault: true },
      }),
    ]);
  },

  /**
   * Crear reembolso
   */
  async createRefund(
    paymentId: string,
    amount?: number,
    reason?: string
  ): Promise<PaymentDTO> {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });

    if (!payment) {
      throw new Error('Pago no encontrado');
    }

    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new Error('Solo se pueden reembolsar pagos exitosos');
    }

    // Crear reembolso en Stripe
    await stripeService.createRefund({
      paymentIntentId: payment.stripePaymentIntentId || undefined,
      chargeId: payment.stripeChargeId || undefined,
      amount,
      reason: reason as 'duplicate' | 'fraudulent' | 'requested_by_customer' | undefined,
    });

    // Actualizar estado
    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.REFUNDED },
    });

    return this.formatPayment(updated);
  },

  // ==================== ADMIN ====================

  /**
   * Listar todos los pagos (admin)
   */
  async getAllPayments(options?: {
    limit?: number;
    offset?: number;
    status?: PaymentStatus;
    userId?: string;
    from?: Date;
    to?: Date;
  }): Promise<{ payments: PaymentDTO[]; total: number }> {
    const where: Record<string, unknown> = {};

    if (options?.status) where.status = options.status;
    if (options?.userId) where.userId = options.userId;
    if (options?.from || options?.to) {
      where.createdAt = {};
      if (options.from) (where.createdAt as Record<string, Date>).gte = options.from;
      if (options.to) (where.createdAt as Record<string, Date>).lte = options.to;
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return {
      payments: payments.map(this.formatPayment),
      total,
    };
  },

  // ==================== HELPERS ====================

  formatPayment(payment: {
    id: string;
    userId: string;
    subscriptionId: string | null;
    amount: { toString(): string };
    currency: string;
    paymentMethod: PaymentMethodType;
    last4: string | null;
    cardBrand: string | null;
    oxxoVoucherUrl: string | null;
    oxxoExpiresAt: Date | null;
    status: PaymentStatus;
    description: string | null;
    paidAt: Date | null;
    createdAt: Date;
  }): PaymentDTO {
    return {
      id: payment.id,
      userId: payment.userId,
      subscriptionId: payment.subscriptionId,
      amount: Number(payment.amount),
      currency: payment.currency,
      paymentMethod: payment.paymentMethod,
      last4: payment.last4,
      cardBrand: payment.cardBrand,
      oxxoVoucherUrl: payment.oxxoVoucherUrl,
      oxxoExpiresAt: payment.oxxoExpiresAt,
      status: payment.status,
      description: payment.description,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
    };
  },
};
