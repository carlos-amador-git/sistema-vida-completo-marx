// src/common/services/logger.service.ts
/**
 * Servicio de Logging Estructurado
 *
 * Proporciona logging consistente en formato JSON para producción
 * y formato legible para desarrollo.
 *
 * Características:
 * - Formato JSON en producción (compatible con ELK, CloudWatch, Datadog, etc.)
 * - Campos dd.trace_id / dd.span_id cuando DD_TRACE_ENABLED está activo
 * - Campos service, env, version, hostname en cada línea
 * - Timestamp ISO 8601 garantizado
 * - Formato colorido en desarrollo
 * - Niveles de log configurables
 * - Contexto de request (requestId, userId)
 * - Sanitización automática de datos sensibles
 */

import * as os from 'os';
import config from '../../config';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS Y CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'security';

interface LogContext {
  requestId?: string;
  userId?: string;
  adminId?: string;
  ip?: string;
  userAgent?: string;
  path?: string;
  method?: string;
  [key: string]: any;
}

interface DatadogTraceContext {
  'dd.trace_id': string;
  'dd.span_id': string;
}

interface LogEntry {
  timestamp: string;      // ISO 8601
  level: LogLevel;
  message: string;
  service: string;
  env: string;
  version: string;
  hostname: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  duration?: number;
  // Datadog APM trace correlation (present when DD_TRACE_ENABLED=true)
  'dd.trace_id'?: string;
  'dd.span_id'?: string;
  [key: string]: any;
}

// Campos sensibles que deben ser sanitizados
const SENSITIVE_FIELDS = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'authorization',
  'cookie',
  'creditCard',
  'cvv',
  'ssn',
  'curp',
];

// Niveles de log y sus prioridades
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  security: 4, // Siempre se registra
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICIO DE LOGGING
// ═══════════════════════════════════════════════════════════════════════════

// ── Datadog trace correlation ─────────────────────────────────────────────
// dd-trace injects these globals when the tracer is active.
// We read them via the tracer API if available; otherwise we generate
// deterministic placeholder strings so the field is always present.
function getDatadogTraceContext(): DatadogTraceContext | null {
  if (process.env.DD_TRACE_ENABLED !== 'true') return null;

  try {
    // dd-trace is an optional peer dependency — require lazily to avoid hard crash
    // when running without Datadog APM (dev / CI environments).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tracer = require('dd-trace');
    const span = tracer.scope().active();
    if (span) {
      const ctx = span.context();
      return {
        'dd.trace_id': ctx.toTraceId(),
        'dd.span_id': ctx.toSpanId(),
      };
    }
  } catch {
    // dd-trace not installed — silently omit fields
  }
  return null;
}

// ── Service version ───────────────────────────────────────────────────────
// Read from DD_VERSION or package.json version if available.
const SERVICE_VERSION = process.env.DD_VERSION || process.env.npm_package_version || '0.0.0';
const SERVICE_HOSTNAME = os.hostname();

class LoggerService {
  private serviceName: string;
  private minLevel: LogLevel;
  private isProduction: boolean;

  constructor(serviceName: string = 'sistema-vida') {
    this.serviceName = process.env.DD_SERVICE || serviceName;
    this.isProduction = config.env === 'production';
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || (this.isProduction ? 'info' : 'debug');
  }

  /**
   * Log de nivel debug (solo desarrollo)
   */
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  /**
   * Log de nivel info
   */
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  /**
   * Log de nivel warning
   */
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  /**
   * Log de nivel error
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorInfo = this.formatError(error);
    this.log('error', message, context, errorInfo);
  }

  /**
   * Log de eventos de seguridad (siempre se registra)
   */
  security(message: string, context?: LogContext): void {
    this.log('security', message, context);
  }

  /**
   * Log de autenticación fallida
   */
  authFailure(reason: string, context: LogContext): void {
    this.security(`Auth failure: ${reason}`, {
      ...context,
      event: 'AUTH_FAILURE',
      reason,
    });
  }

  /**
   * Log de autenticación exitosa
   */
  authSuccess(context: LogContext): void {
    this.security('Auth success', {
      ...context,
      event: 'AUTH_SUCCESS',
    });
  }

  /**
   * Log de acceso a recurso sensible
   */
  sensitiveAccess(resource: string, action: string, context: LogContext): void {
    this.security(`Sensitive access: ${resource}`, {
      ...context,
      event: 'SENSITIVE_ACCESS',
      resource,
      action,
    });
  }

  /**
   * Log de request HTTP
   */
  httpRequest(context: LogContext & { statusCode: number; duration: number }): void {
    const level = context.statusCode >= 500 ? 'error' : context.statusCode >= 400 ? 'warn' : 'info';
    this.log(level, `${context.method} ${context.path} ${context.statusCode}`, context, undefined, context.duration);
  }

  /**
   * Método principal de logging
   */
  private log(
    level: LogLevel,
    message: string,
    context?: LogContext,
    errorInfo?: LogEntry['error'],
    duration?: number
  ): void {
    // Verificar nivel mínimo (security siempre pasa)
    if (level !== 'security' && LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),  // ISO 8601
      level,
      message,
      service: this.serviceName,
      env: process.env.DD_ENV || config.env,
      version: SERVICE_VERSION,
      hostname: SERVICE_HOSTNAME,
    };

    // Inject Datadog APM trace correlation when DD_TRACE_ENABLED=true
    const ddCtx = getDatadogTraceContext();
    if (ddCtx) {
      entry['dd.trace_id'] = ddCtx['dd.trace_id'];
      entry['dd.span_id'] = ddCtx['dd.span_id'];
    }

    if (context) {
      entry.context = this.sanitizeContext(context);
    }

    if (errorInfo) {
      entry.error = errorInfo;
    }

    if (duration !== undefined) {
      entry.duration = duration;
    }

    this.output(entry);
  }

  /**
   * Formatea un error para logging
   */
  private formatError(error: Error | unknown): LogEntry['error'] | undefined {
    if (!error) return undefined;

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: this.isProduction ? undefined : error.stack,
      };
    }

    return {
      name: 'UnknownError',
      message: String(error),
    };
  }

  /**
   * Sanitiza el contexto removiendo datos sensibles
   */
  private sanitizeContext(context: LogContext): LogContext {
    const sanitized: LogContext = {};

    for (const [key, value] of Object.entries(context)) {
      if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitiza un objeto recursivamente
   */
  private sanitizeObject(obj: Record<string, any>, depth: number = 0): any {
    if (depth > 3) return '[MAX_DEPTH]';

    if (Array.isArray(obj)) {
      return obj.map(item =>
        typeof item === 'object' && item !== null ? this.sanitizeObject(item, depth + 1) : item
      );
    }

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value, depth + 1);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Output del log (JSON en producción, formateado en desarrollo)
   */
  private output(entry: LogEntry): void {
    if (this.isProduction) {
      // JSON estructurado para producción
      const output = JSON.stringify(entry);

      if (entry.level === 'error' || entry.level === 'security') {
        console.error(output);
      } else if (entry.level === 'warn') {
        console.warn(output);
      } else {
        console.log(output);
      }
    } else {
      // Formato legible para desarrollo
      const colors = {
        debug: '\x1b[36m', // Cyan
        info: '\x1b[32m', // Green
        warn: '\x1b[33m', // Yellow
        error: '\x1b[31m', // Red
        security: '\x1b[35m', // Magenta
      };
      const reset = '\x1b[0m';
      const color = colors[entry.level];

      let output = `${color}[${entry.level.toUpperCase()}]${reset} ${entry.message}`;

      if (entry.context) {
        const contextStr = Object.entries(entry.context)
          .filter(([_, v]) => v !== undefined)
          .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join(' ');
        if (contextStr) {
          output += ` ${'\x1b[90m'}${contextStr}${reset}`;
        }
      }

      if (entry.duration !== undefined) {
        output += ` ${'\x1b[90m'}(${entry.duration}ms)${reset}`;
      }

      if (entry.level === 'error' || entry.level === 'security') {
        console.error(output);
        if (entry.error?.stack) {
          console.error(entry.error.stack);
        }
      } else if (entry.level === 'warn') {
        console.warn(output);
      } else {
        console.log(output);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE DE LOGGING PARA EXPRESS
// ═══════════════════════════════════════════════════════════════════════════

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware que agrega requestId y loggea requests HTTP
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Generar requestId único
  const requestId = uuidv4();
  (req as any).requestId = requestId;

  // Timestamp de inicio
  const startTime = Date.now();

  // Interceptar el final de la respuesta
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const userId = (req as any).userId;
    const adminId = (req as any).adminId;

    logger.httpRequest({
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      userId,
      adminId,
    });
  });

  next();
}

// Singleton
export const logger = new LoggerService();
export default logger;
