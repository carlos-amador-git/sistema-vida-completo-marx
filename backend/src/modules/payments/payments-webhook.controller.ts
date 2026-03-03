// src/modules/payments/payments-webhook.controller.ts
import { Router, Request, Response } from 'express';
import { stripeService } from './services/stripe.service';
import { subscriptionService } from './services/subscription.service';
import { paymentService } from './services/payment.service';
import { premiumFeaturesService } from './services/premium-features.service';
import { webhookIdempotencyService } from './services/webhook-idempotency.service';
import { odooService } from '../odoo/odoo.service';
import { emailService } from '../../common/services/email.service';
import { emailTemplates } from '../../common/services/email-templates.service';
import { logger } from '../../common/services/logger.service';
import config from '../../config';
import { PaymentStatus, PaymentMethodType } from '@prisma/client';
import Stripe from 'stripe';

import { prisma } from '../../common/prisma';

const router = Router();

/**
 * Tipos de errores para determinar la respuesta HTTP apropiada
 */
class WebhookValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookValidationError';
  }
}

class WebhookProcessingError extends Error {
  constructor(message: string, public retryable: boolean = true) {
    super(message);
    this.name = 'WebhookProcessingError';
  }
}

/**
 * POST /api/v1/webhooks/stripe
 * Webhook de Stripe - Recibe eventos de pagos y suscripciones
 *
 * SEGURIDAD:
 * - Verifica firma de Stripe para autenticidad
 * - Implementa idempotencia para prevenir procesamiento duplicado
 * - Retorna códigos HTTP apropiados:
 *   - 200: Evento procesado exitosamente (o ya procesado)
 *   - 400: Error de validación (firma inválida, datos malformados) - NO reintentar
 *   - 500: Error de procesamiento - Stripe reintentará
 *
 * IMPORTANTE: Este endpoint debe configurarse con express.raw() para recibir el body sin parsear
 */
router.post(
  '/',
  async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;

    // ═══════════════════════════════════════════════════════════════════════
    // PASO 1: Validar firma de Stripe
    // ═══════════════════════════════════════════════════════════════════════
    if (!sig) {
      logger.warn('[WEBHOOK] Rechazado: Sin firma stripe-signature');
      return res.status(400).json({
        error: 'Missing stripe-signature header',
        retryable: false,
      });
    }

    let event: Stripe.Event;

    try {
      // El body debe ser Buffer (configurado en main.ts con express.raw)
      event = stripeService.constructWebhookEvent(req.body, sig);
    } catch (err) {
      logger.warn('[WEBHOOK] Rechazado: Firma inválida', { error: err instanceof Error ? err.message : String(err) });
      // 400 = Error de validación, Stripe NO debe reintentar
      return res.status(400).json({
        error: `Webhook signature verification failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        retryable: false,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PASO 2: Verificar idempotencia
    // ═══════════════════════════════════════════════════════════════════════
    const idempotencyCheck = await webhookIdempotencyService.checkAndMarkProcessing(event.id);

    if (!idempotencyCheck.shouldProcess) {
      logger.debug(`[WEBHOOK] Evento ${event.id} ya procesado: ${idempotencyCheck.reason}`);
      // 200 = Ya procesado, no reintentar
      return res.status(200).json({
        received: true,
        duplicate: true,
        message: idempotencyCheck.reason,
      });
    }

    if (idempotencyCheck.attempts && idempotencyCheck.attempts > 1) {
      logger.info(`[WEBHOOK] Reintento ${idempotencyCheck.attempts} para evento ${event.id}`);
    }

    logger.info(`Webhook recibido: ${event.type}`, { eventId: event.id });

    try {
      switch (event.type) {
        // ==================== CHECKOUT ====================

        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;

          if (session.mode === 'subscription' && session.subscription) {
            const metadata = session.metadata as {
              userId: string;
              planId: string;
              billingCycle: string;
            };

            if (metadata?.userId && metadata?.planId) {
              await subscriptionService.processCheckoutCompleted(
                session.subscription as string,
                session.customer as string,
                metadata
              );
              premiumFeaturesService.invalidateCache(metadata.userId);
              logger.info('Checkout completado', { userId: metadata.userId });
            }
          }
          break;
        }

        // ==================== SUSCRIPCIONES ====================

        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;

          if (subscription.id) {
            await subscriptionService.syncFromStripe(subscription.id);
            logger.info('Suscripción sincronizada', { subscriptionId: subscription.id });
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;

          // Buscar usuario por stripeSubscriptionId y degradar a plan gratuito
          const dbSubscription = await prisma.subscription.findFirst({
            where: { stripeSubscriptionId: subscription.id },
          });

          if (dbSubscription) {
            await subscriptionService.downgradeToFree(dbSubscription.userId);
            premiumFeaturesService.invalidateCache(dbSubscription.userId);
            logger.info('Usuario degradado a plan gratuito', { userId: dbSubscription.userId });
          }
          break;
        }

        // ==================== PAGOS ====================

        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;

          // Actualizar pago en BD
          await paymentService.updatePaymentByStripeId(paymentIntent.id, {
            status: PaymentStatus.SUCCEEDED,
            paidAt: new Date(),
            stripeChargeId: paymentIntent.latest_charge as string || undefined,
          });

          logger.info('Pago exitoso', { paymentIntentId: paymentIntent.id });
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;

          await paymentService.updatePaymentByStripeId(paymentIntent.id, {
            status: PaymentStatus.FAILED,
            failureCode: paymentIntent.last_payment_error?.code || undefined,
            failureMessage: paymentIntent.last_payment_error?.message || undefined,
          });

          logger.warn('Pago fallido', { paymentIntentId: paymentIntent.id });
          break;
        }

        case 'payment_intent.requires_action': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;

          await paymentService.updatePaymentByStripeId(paymentIntent.id, {
            status: PaymentStatus.REQUIRES_ACTION,
          });

          logger.info('Pago requiere acción', { paymentIntentId: paymentIntent.id });
          break;
        }

        // ==================== INVOICES ====================

        case 'invoice.paid': {
          const invoice = event.data.object as Stripe.Invoice;

          // Crear registro de pago
          if (invoice.customer && (invoice as any).subscription) {
            const subscription = await prisma.subscription.findFirst({
              where: { stripeCustomerId: invoice.customer as string },
              include: {
                user: true,
                plan: true,
              },
            });

            if (subscription) {
              await paymentService.createPayment({
                userId: subscription.userId,
                subscriptionId: subscription.id,
                stripeInvoiceId: invoice.id,
                stripePaymentIntentId: (invoice as any).payment_intent as string || undefined,
                amount: invoice.amount_paid / 100,
                currency: invoice.currency.toUpperCase(),
                paymentMethod: PaymentMethodType.CARD,
                status: PaymentStatus.SUCCEEDED,
                description: `Pago de suscripción - ${invoice.lines.data[0]?.description || 'Sistema VIDA'}`,
              });

              logger.info('Invoice pagada registrada', { invoiceId: invoice.id });

              // Sincronizar con Odoo si está configurado
              if (odooService.isConfigured()) {
                try {
                  await odooService.syncStripePayment({
                    customerEmail: subscription.user.email,
                    customerName: subscription.user.name,
                    customerPhone: subscription.user.phone || undefined,
                    planName: subscription.plan.name,
                    planRef: `VIDA-${subscription.plan.id}`,
                    amount: invoice.amount_paid,
                    stripePaymentId: (invoice as any).payment_intent as string || invoice.id,
                    stripeInvoiceId: invoice.id,
                  });
                  logger.info('Pago sincronizado con Odoo', { invoiceId: invoice.id });
                } catch (odooError) {
                  logger.error('Error sincronizando con Odoo', odooError);
                  // No fallar el webhook por errores de Odoo
                }
              }
            }
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;

          logger.warn('Invoice fallida', { invoiceId: invoice.id });

          // Enviar notificación al usuario
          if (invoice.customer) {
            const customerId = typeof invoice.customer === 'string'
              ? invoice.customer
              : invoice.customer.id;

            // Buscar usuario por stripeCustomerId
            const subscription = await prisma.subscription.findFirst({
              where: { stripeCustomerId: customerId },
              include: {
                user: true,
                plan: true,
              },
            });

            if (subscription?.user) {
              const failureMessage = (invoice as any).last_finalization_error?.message
                || 'El pago no pudo ser procesado';

              const amount = invoice.amount_due
                ? `$${(invoice.amount_due / 100).toFixed(2)} ${invoice.currency?.toUpperCase()}`
                : 'N/A';

              const { subject, html } = emailTemplates.paymentFailed({
                name: subscription.user.name,
                planName: subscription.plan.name,
                amount,
                failureReason: failureMessage,
                retryUrl: `${config.frontendUrl}/subscription/billing`,
              });

              emailService.send({
                to: subscription.user.email,
                subject,
                html,
              }).then(result => {
                if (result.success) {
                  logger.info('Notificación de pago fallido enviada', {
                    userId: subscription.user.id,
                    invoiceId: invoice.id,
                  });
                }
              }).catch(err => {
                logger.error('Error enviando notificación de pago fallido', err);
              });
            }
          }
          break;
        }

        // ==================== OXXO ====================

        case 'payment_intent.processing': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;

          // Verificar si es pago OXXO
          if (paymentIntent.payment_method_types?.includes('oxxo')) {
            const voucherUrl = (paymentIntent.next_action as {
              oxxo_display_details?: { hosted_voucher_url?: string };
            })?.oxxo_display_details?.hosted_voucher_url;

            const expiresAt = (paymentIntent.next_action as {
              oxxo_display_details?: { expires_after?: number };
            })?.oxxo_display_details?.expires_after;

            await paymentService.updatePaymentByStripeId(paymentIntent.id, {
              status: PaymentStatus.REQUIRES_ACTION,
            });

            // Crear pago si no existe
            const metadata = paymentIntent.metadata as { userId?: string };
            if (metadata?.userId) {
              const existingPayment = await prisma.payment.findFirst({
                where: { stripePaymentIntentId: paymentIntent.id },
              });

              if (!existingPayment) {
                await paymentService.createPayment({
                  userId: metadata.userId,
                  stripePaymentIntentId: paymentIntent.id,
                  amount: paymentIntent.amount / 100,
                  currency: paymentIntent.currency.toUpperCase(),
                  paymentMethod: PaymentMethodType.OXXO,
                  status: PaymentStatus.REQUIRES_ACTION,
                  description: paymentIntent.description || 'Pago OXXO',
                  oxxoVoucherUrl: voucherUrl || undefined,
                  oxxoExpiresAt: expiresAt ? new Date(expiresAt * 1000) : undefined,
                });
              }
            }

            logger.info('Pago OXXO en proceso', { paymentIntentId: paymentIntent.id });
          }
          break;
        }

        // ==================== OTROS EVENTOS ====================

        case 'customer.created':
        case 'customer.updated':
          // Log para debugging
          logger.debug('Cliente actualizado', { customerId: (event.data.object as Stripe.Customer).id });
          break;

        case 'charge.refunded': {
          const charge = event.data.object as Stripe.Charge;

          if (charge.payment_intent) {
            await paymentService.updatePaymentByStripeId(charge.payment_intent as string, {
              status: PaymentStatus.REFUNDED,
            });
            logger.info('Reembolso procesado', { chargeId: charge.id });
          }
          break;
        }

        default:
          logger.debug('Evento no manejado', { eventType: event.type });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // PASO 3: Marcar como completado y responder 200
      // ═══════════════════════════════════════════════════════════════════════
      await webhookIdempotencyService.markCompleted(event.id);
      logger.info('Webhook procesado exitosamente', { eventId: event.id });

      res.status(200).json({
        received: true,
        eventId: event.id,
        eventType: event.type,
      });
    } catch (error) {
      // ═══════════════════════════════════════════════════════════════════════
      // MANEJO DE ERRORES CON CÓDIGOS HTTP APROPIADOS
      // ═══════════════════════════════════════════════════════════════════════
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[WEBHOOK] Error procesando ${event.type}`, { eventId: event.id, error: errorMessage });

      // Marcar como fallido para permitir reintento
      await webhookIdempotencyService.markFailed(event.id);

      // Determinar si el error es recuperable
      const isRecoverable = !(error instanceof WebhookValidationError);

      if (isRecoverable) {
        // 500 = Error de servidor, Stripe DEBE reintentar
        logger.info(`[WEBHOOK] Respondiendo 500 - Stripe reintentará`, { eventId: event.id });
        return res.status(500).json({
          error: 'Processing error',
          message: errorMessage,
          eventId: event.id,
          retryable: true,
        });
      } else {
        // 400 = Error de validación de datos, NO reintentar
        logger.warn(`[WEBHOOK] Respondiendo 400 - Error no recuperable`, { eventId: event.id });
        return res.status(400).json({
          error: 'Validation error',
          message: errorMessage,
          eventId: event.id,
          retryable: false,
        });
      }
    }
  }
);

export default router;
