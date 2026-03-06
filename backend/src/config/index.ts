// src/config/index.ts
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Entorno
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),

  // Base de datos
  database: {
    url: process.env.DATABASE_URL!,
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL!,
  },

  // JWT - NOTA: Estas variables son validadas en env-validation.ts antes de cargar este archivo
  jwt: {
    secret: process.env.JWT_SECRET!, // Requerido - para access tokens
    refreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!, // Separado para refresh tokens — debe ser diferente en producción
    adminSecret: process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET!, // Validado en env-validation.ts — debe ser diferente en producción
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

  // KMS — Key Management Service
  // Provider selection:
  //   'local'   -> LocalKeyProvider  (development, uses ENCRYPTION_KEY as KEK)
  //   'aws-kms' -> AWSKMSKeyProvider (production, delegates to AWS KMS)
  //
  // Env vars:
  //   KMS_PROVIDER        'local' | 'aws-kms'  (default: 'local')
  //   AWS_KMS_KEY_ID      KMS key ID or full ARN (takes precedence over alias)
  //   AWS_KMS_KEY_ALIAS   KMS key alias (without the 'alias/' prefix)
  //   AWS_REGION          AWS region for KMS (default: inherits from aws.region)
  //   DEK_CACHE_TTL_MS    In-memory DEK cache TTL in milliseconds (default: 300000 = 5 min)
  kms: {
    provider: (process.env.KMS_PROVIDER || 'local') as 'local' | 'aws-kms',
    awsRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
    awsKmsKeyId: process.env.AWS_KMS_KEY_ID || '',
    awsKmsKeyAlias: process.env.AWS_KMS_KEY_ALIAS || '',
    dekCacheTtlMs: process.env.DEK_CACHE_TTL_MS
      ? parseInt(process.env.DEK_CACHE_TTL_MS, 10)
      : 5 * 60 * 1000, // 5 minutes
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

  // SMS y WhatsApp (Twilio) - Desactivado por solicitud del usuario
  twilio: {
    sid: '',
    token: '',
    phone: '',
    whatsappPhone: '',
    whatsappTemplateId: '',
  },

  // WhatsApp Business API (WABA - Meta Cloud API)
  waba: {
    provider: (process.env.WHATSAPP_PROVIDER || 'waba') as 'waba' | 'twilio',
    phoneNumberId: process.env.WABA_PHONE_NUMBER_ID || '',
    accessToken: process.env.WABA_ACCESS_TOKEN || '',
    businessAccountId: process.env.WABA_BUSINESS_ACCOUNT_ID || '',
    webhookVerifyToken: process.env.WABA_WEBHOOK_VERIFY_TOKEN || '',
    apiVersion: process.env.WABA_API_VERSION || 'v22.0',
    fallbackToTwilio: false,
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

  // Cookie domain for production (useful for cross-subdomain auth)
  cookieDomain: process.env.COOKIE_DOMAIN || '',

  // URLs permitidas para CORS (desarrollo)
  corsOrigins: [
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : []),
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:5180',
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
    max: 1000, // requests por ventana
  },
};

export default config;
