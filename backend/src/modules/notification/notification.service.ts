// src/modules/notification/notification.service.ts

import { NotificationType, NotificationChannel, NotificationStatus } from '@prisma/client';
import { logger } from '../../common/services/logger.service';
import {
  WhatsAppProviderFactory,
  TwilioSMSProvider,
  ResendEmailProvider,
  type IWhatsAppProvider,
  type ISMSProvider,
  type IEmailProvider,
  type NotificationParams,
  type SendResult,
} from './providers';

import { prisma } from '../../common/prisma';

interface NotificationResult {
  representativeId: string;
  name: string;
  phone: string;
  email?: string;
  smsStatus: 'sent' | 'failed' | 'skipped';
  whatsappStatus: 'sent' | 'failed' | 'skipped';
  emailStatus: 'sent' | 'failed' | 'skipped';
  messageId?: string;
  error?: string;
}

class NotificationService {
  private whatsappProvider: IWhatsAppProvider;
  private smsProvider: ISMSProvider;
  private emailProvider: IEmailProvider;
  private simulationMode: boolean;

  constructor() {
    this.smsProvider = new TwilioSMSProvider();
    this.emailProvider = new ResendEmailProvider();
    this.whatsappProvider = WhatsAppProviderFactory.create();

    this.simulationMode = !this.smsProvider.isAvailable() && !this.whatsappProvider.isAvailable();

    logger.info('NotificationService inicializado', {
      whatsapp: this.whatsappProvider.getName(),
      whatsappAvailable: String(this.whatsappProvider.isAvailable()),
      smsAvailable: String(this.smsProvider.isAvailable()),
      emailAvailable: String(this.emailProvider.isAvailable()),
      simulationMode: String(this.simulationMode),
    });
  }

  /**
   * Envía SMS de emergencia
   */
  async sendEmergencySMS(params: NotificationParams): Promise<SendResult> {
    if (!this.smsProvider.isAvailable()) {
      logger.info('=== SMS SIMULADO ===', { to: params.to });
      await this.saveNotification({
        phone: params.to,
        type: params.type === 'PANIC' ? NotificationType.EMERGENCY_ALERT : NotificationType.ACCESS_NOTIFICATION,
        channel: NotificationChannel.SMS,
        body: `[SIMULADO] SMS emergencia para ${params.patientName}`,
        status: NotificationStatus.SENT,
        metadata: { simulated: true, location: params.location },
      });
      return { success: true, messageId: `SIM-${Date.now()}`, provider: 'simulation' };
    }

    const result = await this.smsProvider.send(params);

    await this.saveNotification({
      phone: params.to,
      type: params.type === 'PANIC' ? NotificationType.EMERGENCY_ALERT : NotificationType.ACCESS_NOTIFICATION,
      channel: NotificationChannel.SMS,
      body: `SMS emergencia para ${params.patientName}`,
      status: result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
      errorMessage: result.error,
      metadata: { messageId: result.messageId, provider: result.provider, location: params.location },
    });

    return result;
  }

  /**
   * Envía WhatsApp de emergencia (via WABA o Twilio según feature flag)
   */
  async sendEmergencyWhatsApp(params: NotificationParams): Promise<SendResult> {
    if (!this.whatsappProvider.isAvailable()) {
      logger.info('=== WHATSAPP SIMULADO ===', { to: params.to });
      await this.saveNotification({
        phone: params.to,
        type: params.type === 'PANIC' ? NotificationType.EMERGENCY_ALERT : NotificationType.ACCESS_NOTIFICATION,
        channel: NotificationChannel.WHATSAPP,
        body: `[SIMULADO] WhatsApp emergencia para ${params.patientName}`,
        status: NotificationStatus.SENT,
        metadata: { simulated: true, location: params.location },
      });
      return { success: true, messageId: `SIM-WA-${Date.now()}`, provider: 'simulation' };
    }

    const result = await this.whatsappProvider.send(params);

    await this.saveNotification({
      phone: params.to,
      type: params.type === 'PANIC' ? NotificationType.EMERGENCY_ALERT : NotificationType.ACCESS_NOTIFICATION,
      channel: NotificationChannel.WHATSAPP,
      body: `WhatsApp emergencia para ${params.patientName}`,
      status: result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
      errorMessage: result.error,
      metadata: { messageId: result.messageId, provider: result.provider, location: params.location },
    });

    return result;
  }

  /**
   * Envía email de emergencia
   */
  async sendEmergencyEmail(params: NotificationParams): Promise<SendResult> {
    if (!this.emailProvider.isAvailable()) {
      logger.info('=== EMAIL SIMULADO ===', { to: params.to });
      await this.saveNotification({
        email: params.to,
        type: params.type === 'PANIC' ? NotificationType.EMERGENCY_ALERT : NotificationType.ACCESS_NOTIFICATION,
        channel: NotificationChannel.EMAIL,
        subject: `Emergencia VIDA - ${params.patientName}`,
        body: `[SIMULADO] Email emergencia para ${params.patientName}`,
        status: NotificationStatus.SENT,
        metadata: { simulated: true, location: params.location },
      });
      return { success: true, messageId: `SIM-EMAIL-${Date.now()}`, provider: 'simulation' };
    }

    const result = await this.emailProvider.send(params);

    await this.saveNotification({
      email: params.to,
      type: params.type === 'PANIC' ? NotificationType.EMERGENCY_ALERT : NotificationType.ACCESS_NOTIFICATION,
      channel: NotificationChannel.EMAIL,
      subject: `Emergencia VIDA - ${params.patientName}`,
      body: `Email emergencia para ${params.patientName}`,
      status: result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
      errorMessage: result.error,
      metadata: { messageId: result.messageId, provider: result.provider, location: params.location },
    });

    return result;
  }

  /**
   * Notifica a todos los representantes de un usuario (SMS + WhatsApp + Email)
   */
  async notifyAllRepresentatives(params: {
    userId: string;
    patientName: string;
    type: 'PANIC' | 'QR_ACCESS';
    location: { lat: number; lng: number };
    accessorName?: string;
    nearestHospital?: string;
    nearbyHospitals?: Array<{ name: string; distance: number; phone?: string }>;
    locale?: string;
  }): Promise<NotificationResult[]> {
    const { userId, patientName, type, location, accessorName, nearestHospital, nearbyHospitals, locale } = params;

    const representatives = await prisma.representative.findMany({
      where: {
        userId,
        notifyOnEmergency: true,
      },
      orderBy: { priority: 'asc' },
    });

    if (representatives.length === 0) {
      logger.info('No hay representantes configurados para notificar');
      return [];
    }

    const results: NotificationResult[] = [];

    for (const rep of representatives) {
      const notifParams: NotificationParams = {
        to: rep.phone,
        patientName,
        location,
        type,
        accessorName,
        nearestHospital,
        nearbyHospitals,
        locale,
      };

      // Enviar SMS + WhatsApp en paralelo
      const [smsResult, whatsappResult] = await Promise.all([
        this.sendEmergencySMS(notifParams),
        this.sendEmergencyWhatsApp(notifParams),
      ]);

      // Enviar Email si tiene email configurado
      let emailResult: SendResult = { success: false, error: 'no email', provider: 'none' };
      if (rep.email) {
        emailResult = await this.sendEmergencyEmail({ ...notifParams, to: rep.email });
      }

      results.push({
        representativeId: rep.id,
        name: rep.name,
        phone: rep.phone,
        email: rep.email || undefined,
        smsStatus: smsResult.success ? 'sent' : 'failed',
        whatsappStatus: whatsappResult.success ? 'sent' : 'failed',
        emailStatus: rep.email ? (emailResult.success ? 'sent' : 'failed') : 'skipped',
        messageId: smsResult.messageId || whatsappResult.messageId,
        error: smsResult.error || whatsappResult.error || emailResult.error,
      });
    }

    return results;
  }

  /**
   * Guarda una notificación en la base de datos
   */
  private async saveNotification(data: {
    userId?: string;
    email?: string;
    phone?: string;
    type: NotificationType;
    channel: NotificationChannel;
    subject?: string;
    body: string;
    status: NotificationStatus;
    errorMessage?: string;
    metadata?: any;
  }): Promise<void> {
    try {
      await prisma.notification.create({
        data: {
          userId: data.userId,
          email: data.email,
          phone: data.phone,
          type: data.type,
          channel: data.channel,
          subject: data.subject,
          body: data.body,
          status: data.status,
          errorMessage: data.errorMessage,
          metadata: data.metadata,
          sentAt: data.status === NotificationStatus.SENT ? new Date() : null,
          failedAt: data.status === NotificationStatus.FAILED ? new Date() : null,
        },
      });
    } catch (error) {
      logger.error('Error guardando notificacion en BD', error);
    }
  }

  /**
   * Verifica si el servicio está en modo simulación
   */
  isInSimulationMode(): boolean {
    return this.simulationMode;
  }

  /**
   * Info del provider de WhatsApp activo
   */
  getWhatsAppProviderInfo(): { name: string; available: boolean } {
    return {
      name: this.whatsappProvider.getName(),
      available: this.whatsappProvider.isAvailable(),
    };
  }
}

export const notificationService = new NotificationService();
export default notificationService;
