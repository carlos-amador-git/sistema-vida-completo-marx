// src/modules/panic/panic.service.ts
import { logger } from '../../common/services/logger.service';
import { encryptionV2 } from '../../common/services/encryption-v2.service';
import { PanicStatus } from '@prisma/client';
import { hospitalService, HospitalWithDistance } from '../hospital/hospital.service';
import { notificationService } from '../notification/notification.service';
import { pupService } from '../pup/pup.service';
import { io } from '../../main';

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

    // 1. Obtener usuario y sus datos
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

    // 2. Obtener condiciones del paciente para filtrado inteligente
    const patientProfile = await pupService.getProfile(userId);
    const patientConditions = patientProfile?.conditions || [];

    // 3. Buscar hospitales cercanos (inteligente si hay condiciones)
    let nearbyHospitals: HospitalWithDistance[];

    if (patientConditions.length > 0) {
      // Búsqueda inteligente basada en condiciones del paciente
      nearbyHospitals = await hospitalService.findNearbyHospitalsForConditions({
        latitude,
        longitude,
        patientConditions,
        radiusKm: 20,
        limit: 5,
        prioritizeByCondition: true,
      });
    } else {
      // Búsqueda normal
      nearbyHospitals = await hospitalService.findNearbyHospitals({
        latitude,
        longitude,
        radiusKm: 20,
        limit: 5,
      });
    }

    // Si no se encuentran hospitales en 20km, intentar con radio extendido (100km)
    if (nearbyHospitals.length === 0) {
      logger.info('⚠️ No se encontraron hospitales en 20km, ampliando búsqueda a 100km...');
      if (patientConditions.length > 0) {
        nearbyHospitals = await hospitalService.findNearbyHospitalsForConditions({
          latitude,
          longitude,
          patientConditions,
          radiusKm: 100,
          limit: 3,
          prioritizeByCondition: true,
        });
      } else {
        nearbyHospitals = await hospitalService.findNearbyHospitals({
          latitude,
          longitude,
          radiusKm: 100,
          limit: 3,
        });
      }
    }

    const nearestHospital = nearbyHospitals[0]?.name || null;

    // 4. Crear alerta en BD (con coordenadas cifradas V2)
    const panicAlert = await prisma.panicAlert.create({
      data: {
        userId,
        latitude,
        longitude,
        accuracy,
        message,
        status: PanicStatus.ACTIVE,
        nearbyHospitals: nearbyHospitals as any,
        locationEnc: encryptionV2.encryptJSON({ lat: latitude, lon: longitude, accuracy }),
      },
    });

    // 5. Notificar a representantes (SMS + Email)
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

    // 6. Actualizar alerta con resultados de notificacion
    await prisma.panicAlert.update({
      where: { id: panicAlert.id },
      data: {
        notificationsSent: notificationResults as any,
      },
    });

    // 7. Emitir evento WebSocket a representantes
    const alertData = {
      type: 'PANIC_ALERT',
      alertId: panicAlert.id,
      patientName: user.name,
      patientId: userId,
      patientConditions,
      location: {
        latitude,
        longitude,
        accuracy,
      },
      nearbyHospitals,
      message,
      timestamp: panicAlert.createdAt,
    };

    // Emitir a la sala del usuario (representantes conectados)
    io.to(`representative-${userId}`).emit('panic-alert', alertData);
    io.to(`user-${userId}`).emit('panic-alert-sent', alertData);

    logger.info(`🚨 ALERTA DE PANICO activada para ${user.name} (${panicAlert.id})`);
    logger.info(`   Condiciones: ${patientConditions.join(', ') || 'Ninguna'}`);
    logger.info(`   Hospital recomendado: ${nearestHospital || 'N/A'}`);

    return {
      alertId: panicAlert.id,
      status: panicAlert.status,
      nearbyHospitals,
      representativesNotified: notificationResults.map((r) => ({
        name: r.name,
        phone: r.phone,
        smsStatus: r.smsStatus,
        whatsappStatus: r.whatsappStatus,
        emailStatus: r.emailStatus,
      })),
      createdAt: panicAlert.createdAt,
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
    io.to(`representative-${userId}`).emit('panic-cancelled', {
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
