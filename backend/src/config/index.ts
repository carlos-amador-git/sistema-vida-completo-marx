// src/config/index.ts
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Entorno
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),

  // Base de datos
  database: {
    url: process.env.DATABASE_URL || 'postgres://postgres:KQqiN935P8ShyTDxYIgJRvOE0udE0itRCZDWHiboOpaPmVbHAdhxJcDnvKcPMOTg@pk4wo4s0goco8wgcgwwwkw40:5432/postgres',
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://default:SfUbrDH4lrqeLpjvWSvsSM4b1I0Gb9Fcsdh4GbqTFV88WemfJITmGnE4DP5hk51X@yc8004w8gsckcg404goc8wss:6379/0',
  },

  // JWT - NOTA: Estas variables son validadas en env-validation.ts antes de cargar este archivo
  jwt: {
    secret: process.env.JWT_SECRET!, // Requerido - validado al iniciar
    adminSecret: process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET!, // Usa JWT_SECRET como fallback en desarrollo
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Admin settings
  admin: {
    maxLoginAttempts: 5,
    lockoutDurationMinutes: 30,
    sessionTimeoutMinutes: 60,
  },

  // Cifrado - NOTA: ENCRYPTION_KEY es validado en env-validation.ts antes de cargar este archivo
  encryption: {
    key: process.env.ENCRYPTION_KEY!, // Requerido - validado al iniciar (64 caracteres hex = 256 bits)
  },

  // PSC NOM-151
  psc: {
    endpoint: process.env.PSC_ENDPOINT || 'https://api.psc-demo.mx/v1',
    apiKey: process.env.PSC_API_KEY || 'demo-key',
  },

  // Email (Resend)
  email: {
    resendApiKey: process.env.RESEND_API_KEY || '',
    from: process.env.EMAIL_FROM_RESEND || process.env.EMAIL_FROM || 'notificaciones@sistemavida.mx',
  },

  // SMS y WhatsApp (Twilio)
  twilio: {
    sid: process.env.TWILIO_ACCOUNT_SID || '',
    token: process.env.TWILIO_AUTH_TOKEN || '',
    phone: process.env.TWILIO_PHONE_NUMBER || '',
    whatsappPhone: process.env.TWILIO_WHATSAPP_NUMBER || '',
    whatsappTemplateId: process.env.TWILIO_WHATSAPP_TEMPLATE_ID || 'HXdce98f9ca93895538759cd4b43c550b7',
  },

  // WhatsApp Business API (WABA - Meta Cloud API)
  waba: {
    provider: (process.env.WHATSAPP_PROVIDER || 'twilio') as 'waba' | 'twilio',
    phoneNumberId: process.env.WABA_PHONE_NUMBER_ID || '',
    accessToken: process.env.WABA_ACCESS_TOKEN || '',
    businessAccountId: process.env.WABA_BUSINESS_ACCOUNT_ID || '',
    webhookVerifyToken: process.env.WABA_WEBHOOK_VERIFY_TOKEN || '',
    apiVersion: process.env.WABA_API_VERSION || 'v22.0',
    fallbackToTwilio: process.env.WABA_FALLBACK_TO_TWILIO === 'true',
    templateEmergency: process.env.WABA_TEMPLATE_EMERGENCY || '',
    templateAccess: process.env.WABA_TEMPLATE_ACCESS || '',
  },

  // AWS S3
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    bucket: process.env.AWS_S3_BUCKET || 'vida-documents',
    region: process.env.AWS_REGION || 'us-east-1',
  },

  // Stripe - Pagos
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    currency: 'mxn',
  },

  // Facturama - CFDI
  facturama: {
    apiUrl: process.env.FACTURAMA_API_URL || 'https://apisandbox.facturama.mx',
    username: process.env.FACTURAMA_USERNAME || '',
    password: process.env.FACTURAMA_PASSWORD || '',
    expeditionZip: process.env.FACTURAMA_EXPEDITION_ZIP || '06600',
    // Datos del emisor (tu empresa)
    emisorRfc: process.env.FACTURAMA_EMISOR_RFC || '',
    emisorNombre: process.env.FACTURAMA_EMISOR_NOMBRE || 'Sistema VIDA',
    emisorRegimen: process.env.FACTURAMA_EMISOR_REGIMEN || '601', // General de Ley PM
  },

  // Odoo - ERP/Contabilidad
  odoo: {
    url: process.env.ODOO_URL || '',
    db: process.env.ODOO_DB || '',
    username: process.env.ODOO_USERNAME || '',
    password: process.env.ODOO_PASSWORD || '', // API Key o contraseña
  },

  // Frontend URL (para CORS y emails)
  frontendUrl: process.env.FRONTEND_URL || 'https://vida.mdconsultoria-ti.org',

  // URLs permitidas para CORS (desarrollo)
  corsOrigins: [
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : []),
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://192.168.68.120:5173',
    'http://192.168.68.120:3000',
    'https://vida.mdconsultoria-ti.org',
    'https://app.vida.mdconsultoria-ti.org',
    'https://api.vida.mdconsultoria-ti.org',
    'https://mdconsultoria-ti.org',
    'https://www.mdconsultoria-ti.org',
    'https://api.mdconsultoria-ti.org'
  ],

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // requests por ventana
  },
};

export default config;
