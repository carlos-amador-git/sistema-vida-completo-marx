// src/modules/panic/panic.service.ts
import { logger } from '../../common/services/logger.service';
import { encryptionV2 } from '../../common/services/encryption-v2.service';
import { PanicStatus } from '@prisma/client';
import { hospitalService, HospitalWithDistance } from '../hospital/hospital.service';
import { notificationService } from '../notification/notification.service';
import { pupService } from '../pup/pup.service';
import { getSocketServer } from '../../common/services/socket-manager';

import { prisma } from '../../common/prisma';

interface CreatePanicParams {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  message?: string;
}

interface PanicAlertResponse {
  alertId: string;
  status: PanicStatus;
  nearbyHospitals: HospitalWithDistance[];
  representativesNotified: Array<{
    name: string;
    phone: string;
    smsStatus: 'sent' | 'failed' | 'skipped';
    whatsappStatus: 'sent' | 'failed' | 'skipped';
    emailStatus: 'sent' | 'failed' | 'skipped';
  }>;
  createdAt: Date;
}

class PanicService {
  /**
   * Activa una alerta de panico
   * 1. Crea registro en BD
   * 2. Busca hospitales cercanos (filtrado inteligente por condiciones)
   * 3. Notifica a representantes via SMS y Email
   * 4. Emite evento WebSocket
   */
  async activatePanic(params: CreatePanicParams): Promise<PanicAlertResponse> {
    const { userId, latitude, longitude, accuracy, message } = params;

    // 1. Fetch user with profile and representatives in a single query
    //    (removed redundant pupService.getProfile call — profile included via relation)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        representatives: {
          where: { notifyOnEmergency: true },
          orderBy: { priority: 'asc' },
        },
      },
    });

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // 2. Get patient conditions from the already-loaded profile
    //    For encrypted conditions, decrypt inline (avoids second DB round-trip)
    let patientConditions: string[] = [];
    if (user.profile) {
      try {
        if (user.profile.conditionsEnc) {
          patientConditions = JSON.parse(
            encryptionV2.decryptField(user.profile.conditionsEnc)
          );
        }
      } catch {
        patientConditions = [];
      }
    }

    // 3. Search hospitals — single call with 50km radius (avoids sequential 20km + 100km fallback)
    const hospitalSearchPromise = (latitude != null && longitude != null)
      ? (patientConditions.length > 0
        ? hospitalService.findNearbyHospitalsForConditions({
          latitude,
          longitude,
          patientConditions,
          radiusKm: 50,
          limit: 5,
          prioritizeByCondition: true,
        })
        : hospitalService.findNearbyHospitals({
          latitude,
          longitude,
          radiusKm: 50,
          limit: 5,
        }))
      : Promise.resolve([] as HospitalWithDistance[]);

    // 4. Run hospital search + DB create in parallel (both are independent)
    const [nearbyHospitals, panicAlert] = await Promise.all([
      hospitalSearchPromise,
      prisma.panicAlert.create({
        data: {
          userId,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          accuracy: accuracy ?? null,
          message,
          status: PanicStatus.ACTIVE,
          nearbyHospitals: [] as any, // Updated async below
          locationEnc: (latitude != null && longitude != null)
            ? encryptionV2.encryptJSON({ lat: latitude, lon: longitude, accuracy })
            : null,
        },
      }),
    ]);

    const nearestHospital = nearbyHospitals[0]?.name || null;

    // 5. Fire-and-forget: update hospitals on alert + notify + WebSocket
    const alertId = panicAlert.id;
    const createdAt = panicAlert.createdAt;

    Promise.resolve().then(async () => {
      try {
        // Update alert with hospital data (non-blocking)
        prisma.panicAlert.update({
          where: { id: alertId },
          data: { nearbyHospitals: nearbyHospitals as any },
        }).catch(err => logger.error('Error updating hospitals on alert', { alertId, err }));

        // Notificar a representantes (SMS + Email + WhatsApp)
        const notificationResults = await notificationService.notifyAllRepresentatives({
          userId,
          patientName: user.name,
          type: 'PANIC',
          locale: (user as any).preferredLanguage || 'es',
          location: { lat: latitude, lng: longitude },
          nearestHospital: nearestHospital || undefined,
          nearbyHospitals: nearbyHospitals.map(h => ({
            name: h.name,
            distance: h.distance,
            phone: h.emergencyPhone || h.phone || undefined,
          })),
        });

        // Actualizar alerta con resultados de notificacion
        await prisma.panicAlert.update({
          where: { id: alertId },
          data: { notificationsSent: notificationResults as any },
        });

        // Emitir evento WebSocket a representantes
        const alertData = {
          type: 'PANIC_ALERT',
          alertId,
          patientName: user.name,
          patientId: userId,
          patientConditions,
          location: { latitude, longitude, accuracy },
          nearbyHospitals,
          message,
          timestamp: createdAt,
        };

        getSocketServer().to(`representative-${userId}`).emit('panic-alert', alertData);
        getSocketServer().to(`user-${userId}`).emit('panic-alert-sent', {
          ...alertData,
          representativesNotified: notificationResults,
        });
      } catch (err: any) {
        logger.error(`Error procesando notificaciones para alerta ${alertId}:`, err);
      }
    });

    logger.info(`🚨 ALERTA DE PANICO activada para ${user.name} (user: ${userId}, alert: ${alertId})`);
    logger.info(`   Representantes encontrados para retorno: ${user.representatives.length}`);
    logger.info(`   Condiciones: ${patientConditions.join(', ') || 'Ninguna'}`);
    logger.info(`   Hospital recomendado: ${nearestHospital || 'N/A'}`);

    return {
      alertId,
      status: panicAlert.status,
      nearbyHospitals,
      representativesNotified: user.representatives.map(rep => {
        logger.info(`   Mapeando representante: ${rep.name} (${rep.id})`);
        return {
          name: rep.name,
          phone: rep.phone,
          smsStatus: 'pending' as any,
          whatsappStatus: 'pending' as any,
          emailStatus: 'pending' as any,
        };
      }),
      createdAt,
    };
  }

  /**
   * Cancela una alerta de panico activa
   */
  async cancelPanic(alertId: string, userId: string): Promise<boolean> {
    const alert = await prisma.panicAlert.findFirst({
      where: {
        id: alertId,
        userId,
        status: PanicStatus.ACTIVE,
      },
    });

    if (!alert) {
      throw new Error('Alerta no encontrada o ya no esta activa');
    }

    await prisma.panicAlert.update({
      where: { id: alertId },
      data: {
        status: PanicStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    // Notificar via WebSocket
    getSocketServer().to(`representative-${userId}`).emit('panic-cancelled', {
      alertId,
      timestamp: new Date(),
    });

    logger.info(`✅ Alerta de panico ${alertId} cancelada`);
    return true;
  }

  /**
   * Obtiene alertas activas del usuario
   */
  async getActiveAlerts(userId: string) {
    return prisma.panicAlert.findMany({
      where: {
        userId,
        status: PanicStatus.ACTIVE,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtiene historial de alertas del usuario
   */
  async getAlertHistory(userId: string, limit = 10) {
    return prisma.panicAlert.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Obtiene una alerta por ID
   */
  async getAlertById(alertId: string, userId: string) {
    return prisma.panicAlert.findFirst({
      where: {
        id: alertId,
        userId,
      },
    });
  }
}

export const panicService = new PanicService();
export default panicService;
