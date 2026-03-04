// src/common/services/email-templates.service.ts
/**
 * Plantillas de Email para Sistema VIDA
 *
 * Plantillas HTML responsive para:
 * - Verificación de email
 * - Recuperación de contraseña
 * - Notificaciones de suscripción
 * - Alertas de seguridad
 */

import config from '../../config';

// ═══════════════════════════════════════════════════════════════════════════
// HTML ESCAPING
// ═══════════════════════════════════════════════════════════════════════════

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════════════════════════════════════
// ESTILOS BASE
// ═══════════════════════════════════════════════════════════════════════════

const BASE_STYLES = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.6;
    color: #333;
    margin: 0;
    padding: 0;
    background-color: #f5f5f5;
  }
  .container {
    max-width: 600px;
    margin: 0 auto;
    background-color: #ffffff;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  .header {
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    color: white;
    padding: 30px 20px;
    text-align: center;
  }
  .header h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
  }
  .header .subtitle {
    margin-top: 5px;
    opacity: 0.9;
    font-size: 14px;
  }
  .content {
    padding: 30px 25px;
  }
  .content h2 {
    color: #1a1a1a;
    margin-top: 0;
    font-size: 22px;
  }
  .content p {
    margin: 15px 0;
    color: #4a4a4a;
  }
  .button {
    display: inline-block;
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    color: white !important;
    text-decoration: none;
    padding: 14px 30px;
    border-radius: 6px;
    font-weight: 600;
    margin: 20px 0;
    text-align: center;
  }
  .button:hover {
    background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%);
  }
  .button-container {
    text-align: center;
    margin: 25px 0;
  }
  .code-box {
    background-color: #f8f9fa;
    border: 2px dashed #dc2626;
    border-radius: 8px;
    padding: 20px;
    text-align: center;
    margin: 20px 0;
  }
  .code {
    font-family: 'Courier New', monospace;
    font-size: 32px;
    font-weight: bold;
    color: #dc2626;
    letter-spacing: 4px;
  }
  .info-box {
    background-color: #fef3c7;
    border-left: 4px solid #f59e0b;
    padding: 15px;
    margin: 20px 0;
    border-radius: 0 4px 4px 0;
  }
  .warning-box {
    background-color: #fee2e2;
    border-left: 4px solid #dc2626;
    padding: 15px;
    margin: 20px 0;
    border-radius: 0 4px 4px 0;
  }
  .success-box {
    background-color: #d1fae5;
    border-left: 4px solid #10b981;
    padding: 15px;
    margin: 20px 0;
    border-radius: 0 4px 4px 0;
  }
  .footer {
    background-color: #f8f9fa;
    padding: 20px;
    text-align: center;
    font-size: 12px;
    color: #6b7280;
    border-top: 1px solid #e5e7eb;
  }
  .footer a {
    color: #dc2626;
    text-decoration: none;
  }
  .divider {
    border: 0;
    height: 1px;
    background-color: #e5e7eb;
    margin: 25px 0;
  }
  .small-text {
    font-size: 13px;
    color: #6b7280;
  }
`;

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE BASE
// ═══════════════════════════════════════════════════════════════════════════

function wrapTemplate(content: string, preheader: string = '', locale: string = 'es'): string {
  const isEn = locale === 'en';
  const subtitle = isEn
    ? 'Information Will for Advance Decisions'
    : 'Voluntad de Información para Decisiones Anticipadas';
  const autoEmail = isEn
    ? 'This is an automated email, please do not reply directly.'
    : 'Este es un correo automático, por favor no responda directamente.';
  const rights = isEn
    ? `&copy; ${new Date().getFullYear()} VIDA System. All rights reserved.`
    : `&copy; ${new Date().getFullYear()} Sistema VIDA. Todos los derechos reservados.`;
  const privacyLabel = isEn ? 'Privacy' : 'Privacidad';
  const termsLabel = isEn ? 'Terms' : 'Términos';

  return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sistema VIDA</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
  <!-- Preheader text (shown in email preview) -->
  <div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader}
  </div>

  <div style="padding: 20px; background-color: #f5f5f5;">
    <div class="container">
      <div class="header">
        <h1>Sistema VIDA</h1>
        <div class="subtitle">${subtitle}</div>
      </div>

      ${content}

      <div class="footer">
        <p>${autoEmail}</p>
        <p>${rights}</p>
        <p>
          <a href="${config.frontendUrl}/privacy">${privacyLabel}</a> |
          <a href="${config.frontendUrl}/terms">${termsLabel}</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// PLANTILLAS DE EMAIL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Email de verificación de cuenta
 */
export function emailVerificationTemplate(params: {
  name: string;
  verificationUrl: string;
  expiresIn: string;
  locale?: string;
}): { subject: string; html: string } {
  const { name: rawName, verificationUrl, expiresIn, locale = 'es' } = params;
  const name = escapeHtml(rawName);
  const isEn = locale === 'en';

  const heading = isEn ? `Welcome to VIDA System, ${name}!` : `¡Bienvenido a Sistema VIDA, ${name}!`;
  const intro = isEn
    ? 'Thank you for signing up. To complete your registration and activate your account, please verify your email address.'
    : 'Gracias por registrarte. Para completar tu registro y activar tu cuenta, por favor verifica tu dirección de correo electrónico.';
  const btnLabel = isEn ? 'Verify my email' : 'Verificar mi correo';
  const expiryLabel = isEn ? `⏱️ This link expires in ${expiresIn}` : `⏱️ Este enlace expira en ${expiresIn}`;
  const ignoreNote = isEn
    ? 'If you did not request this verification, you can ignore this email.'
    : 'Si no solicitaste esta verificación, puedes ignorar este correo.';
  const fallbackNote = isEn
    ? 'If the button does not work, copy and paste the following link into your browser:'
    : 'Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:';
  const preheader = isEn
    ? `${name}, verify your email to activate your VIDA System account`
    : `${name}, verifica tu correo para activar tu cuenta de Sistema VIDA`;
  const subject = isEn ? 'Verify your account - VIDA System' : 'Verifica tu cuenta - Sistema VIDA';

  const content = `
    <div class="content">
      <h2>${heading}</h2>

      <p>${intro}</p>

      <div class="button-container">
        <a href="${verificationUrl}" class="button">${btnLabel}</a>
      </div>

      <div class="info-box">
        <strong>${expiryLabel}</strong>
        <p style="margin: 5px 0 0 0; font-size: 13px;">
          ${ignoreNote}
        </p>
      </div>

      <hr class="divider">

      <p class="small-text">
        ${fallbackNote}
      </p>
      <p class="small-text" style="word-break: break-all;">
        <a href="${verificationUrl}">${verificationUrl}</a>
      </p>
    </div>
  `;

  return {
    subject,
    html: wrapTemplate(content, preheader, locale),
  };
}

/**
 * Email de recuperación de contraseña
 */
export function passwordResetTemplate(params: {
  name: string;
  resetUrl: string;
  expiresIn: string;
  ipAddress?: string;
  locale?: string;
}): { subject: string; html: string } {
  const { name: rawName, resetUrl, expiresIn, ipAddress: rawIp, locale = 'es' } = params;
  const name = escapeHtml(rawName);
  const ipAddress = rawIp ? escapeHtml(rawIp) : undefined;
  const isEn = locale === 'en';

  const heading = isEn ? 'Password Recovery' : 'Recuperación de contraseña';
  const greeting = isEn ? `Hello ${name},` : `Hola ${name},`;
  const intro = isEn
    ? 'We received a request to reset the password for your VIDA System account.'
    : 'Recibimos una solicitud para restablecer la contraseña de tu cuenta en Sistema VIDA.';
  const btnLabel = isEn ? 'Reset Password' : 'Restablecer contraseña';
  const importantLabel = isEn ? '⚠️ Important:' : '⚠️ Importante:';
  const expiryItem = isEn ? `This link expires in ${expiresIn}` : `Este enlace expira en ${expiresIn}`;
  const onceItem = isEn ? 'Can only be used once' : 'Solo puede usarse una vez';
  const ignoreItem = isEn ? 'If you did not request this, ignore this email' : 'Si no solicitaste esto, ignora este correo';
  const ipNote = isEn ? `This request was made from IP: ${ipAddress}` : `Esta solicitud fue realizada desde la IP: ${ipAddress}`;
  const fallbackNote = isEn
    ? 'If the button does not work, copy and paste the following link into your browser:'
    : 'Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:';
  const preheader = isEn
    ? 'Request to reset your VIDA System password'
    : 'Solicitud para restablecer tu contraseña de Sistema VIDA';
  const subject = isEn ? 'Reset your password - VIDA System' : 'Recupera tu contraseña - Sistema VIDA';

  const content = `
    <div class="content">
      <h2>${heading}</h2>

      <p>${greeting}</p>

      <p>${intro}</p>

      <div class="button-container">
        <a href="${resetUrl}" class="button">${btnLabel}</a>
      </div>

      <div class="warning-box">
        <strong>${importantLabel}</strong>
        <ul style="margin: 10px 0 0 0; padding-left: 20px;">
          <li>${expiryItem}</li>
          <li>${onceItem}</li>
          <li>${ignoreItem}</li>
        </ul>
      </div>

      ${ipAddress ? `
      <p class="small-text">
        ${ipNote}
      </p>
      ` : ''}

      <hr class="divider">

      <p class="small-text">
        ${fallbackNote}
      </p>
      <p class="small-text" style="word-break: break-all;">
        <a href="${resetUrl}">${resetUrl}</a>
      </p>
    </div>
  `;

  return {
    subject,
    html: wrapTemplate(content, preheader, locale),
  };
}

/**
 * Email de confirmación de cambio de contraseña
 */
export function passwordChangedTemplate(params: {
  name: string;
  changedAt: Date;
  ipAddress?: string;
  locale?: string;
}): { subject: string; html: string } {
  const { name: rawName, changedAt, ipAddress: rawIp, locale = 'es' } = params;
  const name = escapeHtml(rawName);
  const ipAddress = rawIp ? escapeHtml(rawIp) : undefined;
  const isEn = locale === 'en';

  const dateLocale = isEn ? 'en-US' : 'es-MX';
  const formattedDate = changedAt.toLocaleDateString(dateLocale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const heading = isEn ? 'Your password has been changed' : 'Tu contraseña ha sido cambiada';
  const greeting = isEn ? `Hello ${name},` : `Hola ${name},`;
  const successLabel = isEn ? '✅ Password updated successfully' : '✅ Contraseña actualizada exitosamente';
  const dateLabel = isEn ? 'Date' : 'Fecha';
  const ifYouLabel = isEn
    ? 'If you made this change, you do not need to do anything else.'
    : 'Si tú realizaste este cambio, no necesitas hacer nada más.';
  const unrecognizedTitle = isEn ? 'Do you not recognize this activity?' : '¿No reconoces esta actividad?';
  const unrecognizedBody = isEn
    ? 'If you did not make this change, your account may be compromised. Please contact support immediately.'
    : 'Si no realizaste este cambio, tu cuenta puede estar comprometida. Por favor contacta a soporte inmediatamente.';
  const preheader = isEn
    ? 'Your VIDA System password has been changed'
    : 'Tu contraseña de Sistema VIDA ha sido cambiada';
  const subject = isEn
    ? '⚠️ Your password was changed - VIDA System'
    : '⚠️ Tu contraseña fue cambiada - Sistema VIDA';

  const content = `
    <div class="content">
      <h2>${heading}</h2>

      <p>${greeting}</p>

      <div class="success-box">
        <strong>${successLabel}</strong>
        <p style="margin: 10px 0 0 0;">
          ${dateLabel}: ${formattedDate}
          ${ipAddress ? `<br>IP: ${ipAddress}` : ''}
        </p>
      </div>

      <p>${ifYouLabel}</p>

      <div class="warning-box">
        <strong>${unrecognizedTitle}</strong>
        <p style="margin: 10px 0 0 0;">
          ${unrecognizedBody}
        </p>
      </div>
    </div>
  `;

  return {
    subject,
    html: wrapTemplate(content, preheader, locale),
  };
}

/**
 * Email de bienvenida después de verificación
 */
export function welcomeTemplate(params: {
  name: string;
  locale?: string;
}): { subject: string; html: string } {
  const { name: rawName, locale = 'es' } = params;
  const name = escapeHtml(rawName);
  const isEn = locale === 'en';

  const heading = isEn ? 'Your account is verified!' : '¡Tu cuenta está verificada!';
  const greeting = isEn ? `Hello ${name},` : `Hola ${name},`;
  const accountReady = isEn ? '✅ Your VIDA System account is ready' : '✅ Tu cuenta de Sistema VIDA está lista';
  const featuresIntro = isEn ? 'You can now access all the features:' : 'Ahora puedes acceder a todas las funcionalidades:';
  const features = isEn
    ? [
        '📋 Create and manage your advance directives',
        '📱 Generate your emergency QR code',
        '👥 Designate trusted representatives',
        '📄 Upload important medical documents',
      ]
    : [
        '📋 Crear y gestionar tus directivas anticipadas',
        '📱 Generar tu código QR de emergencia',
        '👥 Designar representantes de confianza',
        '📄 Subir documentos médicos importantes',
      ];
  const btnLabel = isEn ? 'Go to my profile' : 'Ir a mi perfil';
  const tipTitle = isEn ? '💡 Security tip' : '💡 Tip de seguridad';
  const tipBody = isEn
    ? 'Remember to keep your medical information up to date and periodically review your advance directives.'
    : 'Recuerda mantener actualizada tu información médica y revisar periódicamente tus directivas anticipadas.';
  const preheader = isEn
    ? `${name}, your VIDA System account is verified and ready to use`
    : `${name}, tu cuenta de Sistema VIDA está verificada y lista para usar`;
  const subject = isEn
    ? 'Welcome to VIDA System! Your account is ready'
    : '¡Bienvenido a Sistema VIDA! Tu cuenta está lista';

  const featuresHtml = features.map(f => `<li>${f}</li>`).join('');

  const content = `
    <div class="content">
      <h2>${heading}</h2>

      <p>${greeting}</p>

      <div class="success-box">
        <strong>${accountReady}</strong>
      </div>

      <p>${featuresIntro}</p>

      <ul style="color: #4a4a4a;">
        ${featuresHtml}
      </ul>

      <div class="button-container">
        <a href="${config.frontendUrl}/dashboard" class="button">${btnLabel}</a>
      </div>

      <hr class="divider">

      <div class="info-box">
        <strong>${tipTitle}</strong>
        <p style="margin: 10px 0 0 0;">
          ${tipBody}
        </p>
      </div>
    </div>
  `;

  return {
    subject,
    html: wrapTemplate(content, preheader, locale),
  };
}

/**
 * Email de notificación de nueva suscripción
 */
export function subscriptionCreatedTemplate(params: {
  name: string;
  planName: string;
  price: string;
  features: string[];
  nextBillingDate?: Date;
  locale?: string;
}): { subject: string; html: string } {
  const { name: rawName, planName: rawPlan, price, features, nextBillingDate, locale = 'es' } = params;
  const name = escapeHtml(rawName);
  const planName = escapeHtml(rawPlan);
  const isEn = locale === 'en';

  const heading = isEn ? 'Subscription activated!' : '¡Suscripción activada!';
  const greeting = isEn ? `Hello ${name},` : `Hola ${name},`;
  const planActive = isEn ? `🎉 Your ${planName} plan is active` : `🎉 Tu plan ${planName} está activo`;
  const priceLabel = isEn ? `${price}/month` : `${price}/mes`;
  const accessLabel = isEn ? 'You now have access to:' : 'Ahora tienes acceso a:';
  const nextBillingLabel = isEn ? '📅 Next billing date:' : '📅 Próxima facturación:';
  const btnLabel = isEn ? 'View my subscription' : 'Ver mi suscripción';
  const preheader = isEn
    ? `${name}, your ${planName} subscription has been activated`
    : `${name}, tu suscripción ${planName} ha sido activada`;
  const subject = isEn
    ? `Your ${planName} plan is active! - VIDA System`
    : `¡Tu plan ${planName} está activo! - Sistema VIDA`;

  const dateLocale = isEn ? 'en-US' : 'es-MX';
  const featuresHtml = features
    .map(f => `<li style="margin: 5px 0;">✓ ${f}</li>`)
    .join('');

  const content = `
    <div class="content">
      <h2>${heading}</h2>

      <p>${greeting}</p>

      <div class="success-box">
        <strong>${planActive}</strong>
        <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold;">
          ${priceLabel}
        </p>
      </div>

      <p>${accessLabel}</p>
      <ul style="color: #4a4a4a; padding-left: 20px;">
        ${featuresHtml}
      </ul>

      ${nextBillingDate ? `
      <div class="info-box">
        <strong>${nextBillingLabel}</strong>
        <p style="margin: 5px 0 0 0;">
          ${nextBillingDate.toLocaleDateString(dateLocale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </p>
      </div>
      ` : ''}

      <div class="button-container">
        <a href="${config.frontendUrl}/subscription" class="button">${btnLabel}</a>
      </div>
    </div>
  `;

  return {
    subject,
    html: wrapTemplate(content, preheader, locale),
  };
}

/**
 * Email de cancelación de suscripción
 */
export function subscriptionCancelledTemplate(params: {
  name: string;
  planName: string;
  endDate: Date;
  locale?: string;
}): { subject: string; html: string } {
  const { name: rawName, planName: rawPlan, endDate, locale = 'es' } = params;
  const name = escapeHtml(rawName);
  const planName = escapeHtml(rawPlan);
  const isEn = locale === 'en';

  const dateLocale = isEn ? 'en-US' : 'es-MX';
  const formattedEndDate = endDate.toLocaleDateString(dateLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const heading = isEn ? 'Subscription cancelled' : 'Suscripción cancelada';
  const greeting = isEn ? `Hello ${name},` : `Hola ${name},`;
  const cancelledMsg = isEn
    ? `Your subscription to the <strong>${planName}</strong> plan has been cancelled.`
    : `Tu suscripción al plan <strong>${planName}</strong> ha sido cancelada.`;
  const accessUntilLabel = isEn ? '📅 Your Premium access continues until:' : '📅 Tu acceso Premium continúa hasta:';
  const afterDateMsg = isEn
    ? 'After this date, your account will revert to the free plan and some features may not be available.'
    : 'Después de esta fecha, tu cuenta volverá al plan gratuito y algunas funcionalidades pueden no estar disponibles.';
  const changeOfMindMsg = isEn
    ? 'Changed your mind? You can always reactivate your subscription.'
    : '¿Cambiaste de opinión? Siempre puedes reactivar tu suscripción.';
  const btnLabel = isEn ? 'View available plans' : 'Ver planes disponibles';
  const preheader = isEn
    ? `${name}, your ${planName} subscription has been cancelled`
    : `${name}, tu suscripción ${planName} ha sido cancelada`;
  const subject = isEn
    ? 'Your subscription has been cancelled - VIDA System'
    : 'Tu suscripción ha sido cancelada - Sistema VIDA';

  const content = `
    <div class="content">
      <h2>${heading}</h2>

      <p>${greeting}</p>

      <p>${cancelledMsg}</p>

      <div class="info-box">
        <strong>${accessUntilLabel}</strong>
        <p style="margin: 10px 0 0 0; font-size: 18px; font-weight: bold;">
          ${formattedEndDate}
        </p>
      </div>

      <p>${afterDateMsg}</p>

      <hr class="divider">

      <p>${changeOfMindMsg}</p>

      <div class="button-container">
        <a href="${config.frontendUrl}/subscription/plans" class="button">${btnLabel}</a>
      </div>
    </div>
  `;

  return {
    subject,
    html: wrapTemplate(content, preheader, locale),
  };
}

/**
 * Email de alerta de seguridad (login desde nuevo dispositivo)
 */
export function securityAlertTemplate(params: {
  name: string;
  alertType: 'new_device' | 'password_attempt' | 'suspicious_activity';
  details: {
    ipAddress?: string;
    userAgent?: string;
    location?: string;
    time: Date;
  };
  locale?: string;
}): { subject: string; html: string } {
  const { name: rawName, alertType, details: rawDetails, locale = 'es' } = params;
  const name = escapeHtml(rawName);
  const details = {
    ...rawDetails,
    ipAddress: rawDetails.ipAddress ? escapeHtml(rawDetails.ipAddress) : undefined,
    userAgent: rawDetails.userAgent ? escapeHtml(rawDetails.userAgent) : undefined,
    location: rawDetails.location ? escapeHtml(rawDetails.location) : undefined,
  };
  const isEn = locale === 'en';

  const alertMessages = {
    new_device: {
      title: isEn ? 'New login detected' : 'Nuevo inicio de sesión detectado',
      icon: '🔐',
      description: isEn
        ? 'A login from a new device or location was detected.'
        : 'Se detectó un inicio de sesión desde un dispositivo o ubicación nueva.',
    },
    password_attempt: {
      title: isEn ? 'Failed access attempts' : 'Intentos de acceso fallidos',
      icon: '⚠️',
      description: isEn
        ? 'Multiple failed access attempts to your account were detected.'
        : 'Se detectaron múltiples intentos fallidos de acceso a tu cuenta.',
    },
    suspicious_activity: {
      title: isEn ? 'Suspicious activity detected' : 'Actividad sospechosa detectada',
      icon: '🚨',
      description: isEn
        ? 'Unusual activity was detected on your account.'
        : 'Se detectó actividad inusual en tu cuenta.',
    },
  };

  const alert = alertMessages[alertType];
  const dateLocale = isEn ? 'en-US' : 'es-MX';
  const formattedTime = details.time.toLocaleDateString(dateLocale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const greeting = isEn ? `Hello ${name},` : `Hola ${name},`;
  const eventDetailsLabel = isEn ? 'Event details:' : 'Detalles del evento:';
  const dateLabel = isEn ? 'Date' : 'Fecha';
  const locationLabel = isEn ? 'Location' : 'Ubicación';
  const deviceLabel = isEn ? 'Device' : 'Dispositivo';
  const ifYouLabel = isEn ? 'If it was you:' : 'Si fuiste tú:';
  const ifYouNote = isEn ? 'You do not need to do anything.' : 'No necesitas hacer nada.';
  const ifNotLabel = isEn ? 'If you do not recognize this activity:' : 'Si no reconoces esta actividad:';
  const actions = isEn
    ? ['Change your password immediately', 'Review your active sessions', 'Enable two-factor authentication']
    : ['Cambia tu contraseña inmediatamente', 'Revisa tus sesiones activas', 'Habilita la autenticación de dos factores'];
  const btnLabel = isEn ? 'Review my account security' : 'Revisar seguridad de mi cuenta';
  const subject = isEn ? `${alert.icon} Security alert - VIDA System` : `${alert.icon} Alerta de seguridad - Sistema VIDA`;

  const actionsHtml = actions.map(a => `<li>${a}</li>`).join('');

  const content = `
    <div class="content">
      <h2>${alert.icon} ${alert.title}</h2>

      <p>${greeting}</p>

      <p>${alert.description}</p>

      <div class="warning-box">
        <strong>${eventDetailsLabel}</strong>
        <ul style="margin: 10px 0 0 0; padding-left: 20px; list-style: none;">
          <li>📅 ${dateLabel}: ${formattedTime}</li>
          ${details.ipAddress ? `<li>🌐 IP: ${details.ipAddress}</li>` : ''}
          ${details.location ? `<li>📍 ${locationLabel}: ${details.location}</li>` : ''}
          ${details.userAgent ? `<li>💻 ${deviceLabel}: ${details.userAgent}</li>` : ''}
        </ul>
      </div>

      <p><strong>${ifYouLabel}</strong> ${ifYouNote}</p>

      <p><strong>${ifNotLabel}</strong></p>
      <ul style="color: #4a4a4a;">
        ${actionsHtml}
      </ul>

      <div class="button-container">
        <a href="${config.frontendUrl}/settings/security" class="button">${btnLabel}</a>
      </div>
    </div>
  `;

  return {
    subject,
    html: wrapTemplate(content, `${name}, ${alert.description.toLowerCase()}`, locale),
  };
}

// Export all templates
/**
 * Email de notificación de pago fallido
 */
export function paymentFailedTemplate(params: {
  name: string;
  planName: string;
  amount: string;
  failureReason?: string;
  retryUrl: string;
  locale?: string;
}): { subject: string; html: string } {
  const { name: rawName, planName: rawPlan, amount, failureReason: rawReason, retryUrl, locale = 'es' } = params;
  const name = escapeHtml(rawName);
  const planName = escapeHtml(rawPlan);
  const failureReason = rawReason ? escapeHtml(rawReason) : undefined;
  const isEn = locale === 'en';

  const heading = isEn ? '⚠️ Problem with your payment' : '⚠️ Problema con tu pago';
  const greeting = isEn ? `Hello ${name},` : `Hola ${name},`;
  const intro = isEn
    ? `We couldn't process your <strong>${planName}</strong> subscription payment.`
    : `No pudimos procesar el pago de tu suscripción <strong>${planName}</strong>.`;
  const paymentDetailsLabel = isEn ? 'Payment details:' : 'Detalles del pago:';
  const planLabel = isEn ? 'Plan' : 'Plan';
  const amountLabel = isEn ? 'Amount' : 'Monto';
  const reasonLabel = isEn ? 'Reason' : 'Motivo';
  const updateMsg = isEn
    ? 'To maintain your access to Premium features, please update your payment method:'
    : 'Para mantener tu acceso a las funciones Premium, por favor actualiza tu método de pago:';
  const btnLabel = isEn ? 'Update payment method' : 'Actualizar método de pago';
  const whatHappenedLabel = isEn ? '💡 What may have happened?' : '💡 ¿Qué puede haber pasado?';
  const reasons = isEn
    ? ['Your card may have expired', 'Insufficient funds', 'The bank rejected the transaction']
    : ['Tu tarjeta puede haber expirado', 'Fondos insuficientes', 'El banco rechazó la transacción'];
  const warningNote = isEn
    ? 'If you do not update your payment method, your subscription will be automatically cancelled and you will lose access to Premium features.'
    : 'Si no actualizas tu método de pago, tu suscripción se cancelará automáticamente y perderás acceso a las funciones Premium.';
  const preheader = isEn
    ? `${name}, there was a problem processing your VIDA System payment`
    : `${name}, hubo un problema procesando tu pago de Sistema VIDA`;
  const subject = isEn ? '⚠️ Problem with your payment - VIDA System' : '⚠️ Problema con tu pago - Sistema VIDA';

  const reasonsHtml = reasons.map(r => `<li>${r}</li>`).join('');

  const content = `
    <div class="content">
      <h2>${heading}</h2>

      <p>${greeting}</p>

      <p>${intro}</p>

      <div class="warning-box">
        <strong>${paymentDetailsLabel}</strong>
        <ul style="margin: 10px 0 0 0; padding-left: 20px;">
          <li>${planLabel}: ${planName}</li>
          <li>${amountLabel}: ${amount}</li>
          ${failureReason ? `<li>${reasonLabel}: ${failureReason}</li>` : ''}
        </ul>
      </div>

      <p>${updateMsg}</p>

      <div class="button-container">
        <a href="${retryUrl}" class="button">${btnLabel}</a>
      </div>

      <div class="info-box">
        <strong>${whatHappenedLabel}</strong>
        <ul style="margin: 10px 0 0 0; padding-left: 20px;">
          ${reasonsHtml}
        </ul>
      </div>

      <p class="small-text">
        ${warningNote}
      </p>
    </div>
  `;

  return {
    subject,
    html: wrapTemplate(content, preheader, locale),
  };
}

/**
 * Email de notificación de acceso de emergencia
 */
export function emergencyAccessNotificationTemplate(params: {
  name: string;
  accessTime: Date;
  accessorInfo: {
    ip?: string;
    location?: string;
    userAgent?: string;
  };
  documentsAccessed: number;
  viewHistoryUrl: string;
  locale?: string;
}): { subject: string; html: string } {
  const { name: rawName, accessTime, accessorInfo: rawAccessor, documentsAccessed, viewHistoryUrl, locale = 'es' } = params;
  const name = escapeHtml(rawName);
  const accessorInfo = {
    ...rawAccessor,
    ip: rawAccessor.ip ? escapeHtml(rawAccessor.ip) : undefined,
    location: rawAccessor.location ? escapeHtml(rawAccessor.location) : undefined,
    userAgent: rawAccessor.userAgent ? escapeHtml(rawAccessor.userAgent) : undefined,
  };
  const isEn = locale === 'en';

  const dateLocale = isEn ? 'en-US' : 'es-MX';
  const formattedTime = accessTime.toLocaleDateString(dateLocale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const heading = isEn ? '🚨 Emergency Access to your Information' : '🚨 Acceso de Emergencia a tu Información';
  const greeting = isEn ? `Hello ${name},` : `Hola ${name},`;
  const intro = isEn
    ? 'An <strong>emergency access</strong> to your medical information in VIDA System has been made.'
    : 'Se ha realizado un <strong>acceso de emergencia</strong> a tu información médica en Sistema VIDA.';
  const accessDetailsLabel = isEn ? 'Access details:' : 'Detalles del acceso:';
  const dateTimeLabel = isEn ? 'Date and time' : 'Fecha y hora';
  const docsViewedLabel = isEn ? 'Documents viewed' : 'Documentos vistos';
  const docsCount = isEn
    ? `${documentsAccessed} document(s)`
    : `${documentsAccessed} documento(s)`;
  const ipLabel = isEn ? 'Access IP' : 'IP del acceso';
  const locationLabel = isEn ? 'Location' : 'Ubicación';
  const whatIsLabel = isEn ? 'ℹ️ What is emergency access?' : 'ℹ️ ¿Qué es un acceso de emergencia?';
  const whatIsBody = isEn
    ? 'Emergency access allows medical or emergency personnel to view your vital information when they scan your emergency QR code. This can save your life in critical situations.'
    : 'El acceso de emergencia permite que personal médico o de emergencias pueda ver tu información vital cuando escanean tu código QR de emergencia. Esto puede salvar tu vida en situaciones críticas.';
  const historyMsg = isEn
    ? 'You can review the complete access history to your information:'
    : 'Puedes revisar el historial completo de accesos a tu información:';
  const btnLabel = isEn ? 'View access history' : 'Ver historial de accesos';
  const footerNote = isEn
    ? 'If you believe this access was not legitimate, please contact support immediately. We keep a detailed record of all accesses for your security.'
    : 'Si crees que este acceso no fue legítimo, por favor contacta a soporte inmediatamente. Guardamos un registro detallado de todos los accesos para tu seguridad.';
  const preheader = isEn
    ? `${name}, someone accessed your emergency medical information`
    : `${name}, alguien accedió a tu información médica de emergencia`;
  const subject = isEn
    ? '🚨 Emergency access to your information - VIDA System'
    : '🚨 Acceso de emergencia a tu información - Sistema VIDA';

  const content = `
    <div class="content">
      <h2>${heading}</h2>

      <p>${greeting}</p>

      <p>${intro}</p>

      <div class="warning-box">
        <strong>${accessDetailsLabel}</strong>
        <table style="width: 100%; margin-top: 10px;">
          <tr>
            <td style="padding: 5px 0;"><strong>${dateTimeLabel}:</strong></td>
            <td>${formattedTime}</td>
          </tr>
          <tr>
            <td style="padding: 5px 0;"><strong>${docsViewedLabel}:</strong></td>
            <td>${docsCount}</td>
          </tr>
          ${accessorInfo.ip ? `
          <tr>
            <td style="padding: 5px 0;"><strong>${ipLabel}:</strong></td>
            <td>${accessorInfo.ip}</td>
          </tr>
          ` : ''}
          ${accessorInfo.location ? `
          <tr>
            <td style="padding: 5px 0;"><strong>${locationLabel}:</strong></td>
            <td>${accessorInfo.location}</td>
          </tr>
          ` : ''}
        </table>
      </div>

      <div class="info-box">
        <strong>${whatIsLabel}</strong>
        <p style="margin: 10px 0 0 0;">
          ${whatIsBody}
        </p>
      </div>

      <p>${historyMsg}</p>

      <div class="button-container">
        <a href="${viewHistoryUrl}" class="button">${btnLabel}</a>
      </div>

      <hr class="divider">

      <p class="small-text">
        ${footerNote}
      </p>
    </div>
  `;

  return {
    subject,
    html: wrapTemplate(content, preheader, locale),
  };
}

export const emailTemplates = {
  emailVerification: emailVerificationTemplate,
  passwordReset: passwordResetTemplate,
  passwordChanged: passwordChangedTemplate,
  welcome: welcomeTemplate,
  subscriptionCreated: subscriptionCreatedTemplate,
  subscriptionCancelled: subscriptionCancelledTemplate,
  securityAlert: securityAlertTemplate,
  paymentFailed: paymentFailedTemplate,
  emergencyAccessNotification: emergencyAccessNotificationTemplate,
};

export default emailTemplates;
