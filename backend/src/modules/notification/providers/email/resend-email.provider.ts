// src/modules/notification/providers/email/resend-email.provider.ts

import { Resend } from 'resend';
import { IEmailProvider, NotificationParams, SendResult } from '../interfaces';
import { getGoogleMapsUrl } from '../../../../common/utils/geolocation';
import { logger } from '../../../../common/services/logger.service';
import config from '../../../../config';
import i18next from '../../../../common/i18n/config';

/**
 * Proveedor de Email via Resend.
 */
export class ResendEmailProvider implements IEmailProvider {
  private client: Resend | null = null;

  constructor() {
    const { resendApiKey } = config.email;
    if (resendApiKey) {
      try {
        this.client = new Resend(resendApiKey);
        logger.info('ResendEmailProvider inicializado');
      } catch (error) {
        logger.warn('Error inicializando ResendEmailProvider', { error: String(error) });
      }
    }
  }

  getName(): string {
    return 'resend';
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async send(params: NotificationParams): Promise<SendResult> {
    const { to, patientName, location, type, accessorName, nearestHospital, nearbyHospitals, locale } = params;
    const mapsUrl = getGoogleMapsUrl(location.lat, location.lng);
    const isPanic = type === 'PANIC';
    const t = i18next.getFixedT(locale || 'es');

    const subject = isPanic
      ? t('emails:subjects.emergencyAccess') + ` - ${patientName}`
      : t('emails:subjects.emergencyAccess') + ` - ${patientName}`;

    const html = this.buildEmailHtml({
      isPanic,
      patientName,
      accessorName,
      mapsUrl,
      nearestHospital,
      nearbyHospitals,
      locale,
    });

    if (!this.isAvailable()) {
      return { success: false, error: 'Resend no disponible', provider: this.getName() };
    }

    const maxRetries = 3;
    let attempt = 0;

    const executeSend = async (): Promise<SendResult> => {
      try {
        attempt++;
        logger.info('Enviando email via Resend', { to, attempt });

        const result = await this.client!.emails.send({
          from: config.email.from,
          to: [to],
          subject,
          html,
        });

        if (result.error) {
          // If it's a rate limit error (429), throw it to trigger a retry
          if (
            result.error.name === 'rate_limit_exceeded' || 
            result.error.message.includes('Too many requests')
          ) {
            throw result.error;
          }
          throw new Error(result.error.message);
        }

        logger.info('Email Resend enviado', { id: result.data?.id });
        return { success: true, messageId: result.data?.id, provider: this.getName() };
      } catch (error: any) {
        const isRateLimit = 
          error.name === 'rate_limit_exceeded' || 
          (error.message && error.message.includes('Too many requests'));

        if (isRateLimit && attempt < maxRetries) {
          const delay = 800 * attempt; // delay between retries
          logger.warn(`Rate limit en Resend alcanzado. Reintentando en ${delay}ms...`, { to, attempt });
          await new Promise(resolve => setTimeout(resolve, delay));
          return executeSend();
        }

        logger.error('Error Email Resend', error);
        return { success: false, error: error.message, provider: this.getName() };
      }
    };

    return executeSend();
  }

  private escHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private buildEmailHtml(params: {
    isPanic: boolean;
    patientName: string;
    accessorName?: string;
    mapsUrl: string;
    nearestHospital?: string;
    nearbyHospitals?: Array<{ name: string; distance: number; phone?: string }>;
    locale?: string;
  }): string {
    const { isPanic, mapsUrl, nearbyHospitals, locale } = params;
    const t = i18next.getFixedT(locale || 'es');
    const patientName = this.escHtml(params.patientName);
    const accessorName = params.accessorName ? this.escHtml(params.accessorName) : undefined;
    const nearestHospital = params.nearestHospital ? this.escHtml(params.nearestHospital) : undefined;

    const nearbyHospitalsLabel = locale === 'en' ? 'Nearby Hospitals:' : 'Hospitales Cercanos:';
    const distanceLabel = locale === 'en' ? 'km away' : 'km';
    const callLabel = locale === 'en' ? 'Call' : 'Llamar';
    const locationLabel = locale === 'en' ? 'Location' : 'Ubicación';
    const viewMapsLabel = locale === 'en' ? 'View on Google Maps' : 'Ver en Google Maps';
    const nearestHospitalLabel = locale === 'en' ? 'Nearest hospital:' : 'Hospital más cercano:';
    const accessByLabel = locale === 'en' ? 'Access by:' : 'Acceso realizado por:';
    const autoEmailLabel = t('emails:common.autoEmail');
    const dateLocale = locale === 'en' ? 'en-US' : 'es-MX';
    const emergencyTitle = locale === 'en' ? '🚨 EMERGENCY' : '🚨 EMERGENCIA';
    const alertTitle = locale === 'en' ? '⚠️ VIDA ALERT' : '⚠️ ALERTA VIDA';
    const panicBody = locale === 'en'
      ? `<strong>${patientName}</strong> has activated the panic button and needs immediate help.`
      : `<strong>${patientName}</strong> ha activado el botón de pánico y necesita ayuda inmediata.`;
    const accessBody = locale === 'en'
      ? `Medical information of <strong>${patientName}</strong> has been accessed.`
      : `Se ha accedido a la información médica de <strong>${patientName}</strong>.`;

    let hospitalsHtml = '';
    if (nearbyHospitals && nearbyHospitals.length > 0) {
      hospitalsHtml = `
        <h3 style="color: #0284c7; margin-top: 20px;">${nearbyHospitalsLabel}</h3>
        <table style="width: 100%; border-collapse: collapse;">
          ${nearbyHospitals.map(h => `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px 0;">
                <strong>${this.escHtml(h.name)}</strong><br>
                <span style="color: #6b7280; font-size: 14px;">${h.distance.toFixed(1)} ${distanceLabel}</span>
              </td>
              <td style="text-align: right; padding: 10px 0;">
                ${h.phone ? `<a href="tel:${this.escHtml(h.phone)}" style="background: #dc2626; color: white; padding: 8px 16px; border-radius: 20px; text-decoration: none;">${callLabel}</a>` : ''}
              </td>
            </tr>
          `).join('')}
        </table>
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f3f4f6;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="background: ${isPanic ? '#dc2626' : '#f59e0b'}; color: white; padding: 24px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">${isPanic ? emergencyTitle : alertTitle}</h1>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 18px; color: #1f2937; margin-bottom: 20px;">
              ${isPanic ? panicBody : accessBody}
            </p>
            ${!isPanic && accessorName ? `
              <p style="color: #6b7280;">
                <strong>${accessByLabel}</strong> ${accessorName}
              </p>
            ` : ''}
            <div style="background: #f9fafb; border-radius: 12px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #374151; margin: 0 0 10px 0;">📍 ${locationLabel}</h3>
              <a href="${mapsUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                ${viewMapsLabel}
              </a>
              ${nearestHospital ? `<p style="color: #6b7280; margin-top: 10px;">${nearestHospitalLabel} <strong>${nearestHospital}</strong></p>` : ''}
            </div>
            ${hospitalsHtml}
            <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 14px; margin: 0;">
                ${autoEmailLabel}<br>
                ${new Date().toLocaleString(dateLocale, { dateStyle: 'full', timeStyle: 'short' })}
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
