// src/modules/payments/services/webhook-idempotency.service.ts
/**
 * Servicio de idempotencia para webhooks de Stripe
 *
 * Previene el procesamiento duplicado de eventos usando:
 * - Redis (preferido en producción)
 * - Cache en memoria (fallback)
 * - Base de datos (para persistencia a largo plazo)
 */

import config from '../../../config';
import { cacheService, CACHE_PREFIXES } from '../../../common/services/cache.service';
import { logger } from '../../../common/services/logger.service';

import { prisma } from '../../../common/prisma';

// TTL para eventos procesados (24 horas)
const EVENT_TTL = 24 * 60 * 60;

interface ProcessedEventData {
  processedAt: string;
  status: 'processing' | 'completed' | 'failed';
  attempts: number;
}

export interface WebhookProcessingResult {
  shouldProcess: boolean;
  reason?: string;
  previousStatus?: 'processing' | 'completed' | 'failed';
  attempts?: number;
}

class WebhookIdempotencyService {
  /**
   * Verifica si un evento ya fue procesado o está siendo procesado
   */
  async checkAndMarkProcessing(eventId: string): Promise<WebhookProcessingResult> {
    const cacheKey = eventId;

    // Verificar en cache (Redis o memoria)
    const existing = await cacheService.get<ProcessedEventData>(cacheKey, {
      prefix: CACHE_PREFIXES.WEBHOOK_IDEMPOTENCY,
    });

    if (!existing) {
      // Primera vez que vemos este evento
      const newEvent: ProcessedEventData = {
        processedAt: new Date().toISOString(),
        status: 'processing',
        attempts: 1,
      };

      await cacheService.set(cacheKey, newEvent, {
        prefix: CACHE_PREFIXES.WEBHOOK_IDEMPOTENCY,
        ttl: EVENT_TTL,
      });

      logger.debug('Webhook event registrado para procesamiento', { eventId });

      return { shouldProcess: true };
    }

    // Si ya se completó exitosamente, no procesar
    if (existing.status === 'completed') {
      logger.info('Webhook event ya procesado, ignorando', { eventId });
      return {
        shouldProcess: false,
        reason: 'Event already processed successfully',
        previousStatus: 'completed',
        attempts: existing.attempts,
      };
    }

    // Si está en proceso y fue hace menos de 5 minutos, asumir que aún se está procesando
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const processedAt = new Date(existing.processedAt);

    if (existing.status === 'processing' && processedAt > fiveMinutesAgo) {
      logger.warn('Webhook event en proceso, ignorando duplicado', { eventId });
      return {
        shouldProcess: false,
        reason: 'Event is currently being processed',
        previousStatus: 'processing',
        attempts: existing.attempts,
      };
    }

    // Si falló o el procesamiento expiró, permitir reintento (hasta 3 intentos)
    if (existing.attempts >= 3) {
      logger.warn('Webhook event alcanzó máximo de reintentos', { eventId, attempts: existing.attempts });
      return {
        shouldProcess: false,
        reason: 'Maximum retry attempts reached',
        previousStatus: existing.status,
        attempts: existing.attempts,
      };
    }

    // Permitir reintento
    const updatedEvent: ProcessedEventData = {
      processedAt: new Date().toISOString(),
      status: 'processing',
      attempts: existing.attempts + 1,
    };

    await cacheService.set(cacheKey, updatedEvent, {
      prefix: CACHE_PREFIXES.WEBHOOK_IDEMPOTENCY,
      ttl: EVENT_TTL,
    });

    logger.info('Webhook event reintentando', { eventId, attempt: updatedEvent.attempts });

    return {
      shouldProcess: true,
      previousStatus: 'failed',
      attempts: updatedEvent.attempts,
    };
  }

  /**
   * Marca un evento como completado exitosamente
   */
  async markCompleted(eventId: string): Promise<void> {
    const cacheKey = eventId;

    const existing = await cacheService.get<ProcessedEventData>(cacheKey, {
      prefix: CACHE_PREFIXES.WEBHOOK_IDEMPOTENCY,
    });

    if (existing) {
      existing.status = 'completed';

      await cacheService.set(cacheKey, existing, {
        prefix: CACHE_PREFIXES.WEBHOOK_IDEMPOTENCY,
        ttl: EVENT_TTL,
      });

      logger.info('Webhook event completado', { eventId });
    }
  }

  /**
   * Marca un evento como fallido (permite reintento)
   */
  async markFailed(eventId: string): Promise<void> {
    const cacheKey = eventId;

    const existing = await cacheService.get<ProcessedEventData>(cacheKey, {
      prefix: CACHE_PREFIXES.WEBHOOK_IDEMPOTENCY,
    });

    if (existing) {
      existing.status = 'failed';

      await cacheService.set(cacheKey, existing, {
        prefix: CACHE_PREFIXES.WEBHOOK_IDEMPOTENCY,
        ttl: EVENT_TTL,
      });

      logger.warn('Webhook event marcado como fallido', { eventId });
    }
  }

  /**
   * Obtiene estadísticas de eventos procesados
   * Nota: En Redis, esto requeriría SCAN que es costoso,
   * así que solo funciona bien con cache en memoria
   */
  async getStats(): Promise<{
    cacheHealth: any;
  }> {
    const health = await cacheService.healthCheck();

    return {
      cacheHealth: health,
    };
  }
}

export const webhookIdempotencyService = new WebhookIdempotencyService();
export default webhookIdempotencyService;
