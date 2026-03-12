// src/common/services/s3.service.ts
import { logger } from './logger.service';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import config from '../../config';

// Importación diferida para evitar dependencia circular
// Ahora es async porque usa cache (Redis)
let getSecureLocalUrl: ((s3Key: string, expiresInSeconds?: number, options?: { userId?: string; emergencyAccessId?: string }) => Promise<string>) | null = null;

/**
 * Inicializa la función de URL segura (llamado desde main.ts después de cargar el controlador)
 */
export function initSecureUrlGenerator(fn: typeof getSecureLocalUrl): void {
  getSecureLocalUrl = fn;
}

class S3Service {
  private s3!: S3Client; // Initialized conditionally in constructor
  private bucket: string;
  private isConfigured: boolean = false;
  private useLocalStorage: boolean = false;
  private localStoragePath: string;

  constructor() {
    this.bucket = config.aws.bucket;
    this.localStoragePath = path.join(process.cwd(), 'uploads');

    // Verificar si las credenciales son reales (no placeholders)
    const hasRealCredentials =
      config.aws.accessKeyId &&
      config.aws.secretAccessKey &&
      !config.aws.accessKeyId.includes('your-') &&
      config.aws.accessKeyId.startsWith('AKIA');

    // Forzar almacenamiento local si está configurado o si no hay credenciales reales en desarrollo
    if (config.aws.useLocalStorage || (config.env === 'development' && !hasRealCredentials)) {
      this.useLocalStorage = true;
      this.ensureLocalStorageDir();
      logger.info(`S3 Service inicializado en MODO LOCAL (/app/uploads) - Motivo: ${config.aws.useLocalStorage ? 'Configuración' : 'Desarrollo sin credenciales'}`);
    } else if (hasRealCredentials) {
      this.s3 = new S3Client({
        credentials: {
          accessKeyId: config.aws.accessKeyId,
          secretAccessKey: config.aws.secretAccessKey,
        },
        region: config.aws.region,
      });
      this.isConfigured = true;
      logger.info('S3 Service inicializado correctamente');
    } else {
      this.s3 = new S3Client({
        region: config.aws.region || 'us-east-1',
      });
      logger.warn('S3 Service en modo simulacion (sin credenciales AWS)');
    }
  }

  /**
   * Asegura que el directorio de almacenamiento local exista
   */
  private ensureLocalStorageDir(): void {
    const dirs = ['documents', 'profiles', 'temp'];
    dirs.forEach(dir => {
      const fullPath = path.join(this.localStoragePath, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });
  }

  /**
   * Sube un archivo a S3 o almacenamiento local
   */
  async uploadFile(params: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    folder: string;
  }): Promise<{ url: string; key: string }> {
    const { buffer, fileName, mimeType, folder } = params;

    // Generar key unica
    const ext = fileName.split('.').pop() || 'bin';
    const key = `${folder}/${uuidv4()}.${ext}`;

    // Modo almacenamiento local
    if (this.useLocalStorage) {
      const filePath = path.join(this.localStoragePath, key);
      const dirPath = path.dirname(filePath);

      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      fs.writeFileSync(filePath, buffer);
      logger.info(`[LOCAL] Archivo guardado: ${key} (${buffer.length} bytes)`);

      // URL local que será servida por Express
      const url = `${config.frontendUrl.replace('5173', '3000')}/uploads/${key}`;

      return { url, key };
    }

    // Modo simulacion si no hay credenciales
    if (!this.isConfigured) {
      logger.info(`[S3 SIMULADO] Upload: ${key} (${buffer.length} bytes)`);
      return {
        url: `https://${this.bucket}.s3.${config.aws.region}.amazonaws.com/${key}`,
        key,
      };
    }

    const uploadParams = {
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    };

    try {
      const command = new PutObjectCommand(uploadParams);
      await this.s3.send(command);

      const url = `https://${this.bucket}.s3.${config.aws.region}.amazonaws.com/${key}`;

      return { url, key };
    } catch (error) {
      logger.error('Error subiendo archivo a S3:', error);
      throw new Error('Error al subir archivo');
    }
  }

  /**
   * Genera una URL firmada para acceso temporal
   * @param key - S3 key del archivo
   * @param expiresInSeconds - Tiempo de expiración (default: 15 minutos para local, 1 hora para S3)
   * @param options - Opciones adicionales para auditoría
   */
  async getSignedUrl(
    key: string,
    expiresInSeconds: number = 900,
    options?: { userId?: string; emergencyAccessId?: string }
  ): Promise<string> {
    if (this.useLocalStorage) {
      // Usar URL segura con token temporal si está disponible
      if (getSecureLocalUrl) {
        return getSecureLocalUrl(key, expiresInSeconds, options);
      }
      // Fallback a URL directa (solo para desarrollo inicial)
      logger.warn('[S3Service] getSecureLocalUrl no inicializado, usando URL directa');
      return `${config.frontendUrl.replace('5173', '3000')}/uploads/${key}`;
    }

    if (!this.isConfigured) {
      return `https://${this.bucket}.s3.${config.aws.region}.amazonaws.com/${key}?simulated=true`;
    }

    const params = {
      Bucket: this.bucket,
      Key: key,
    };

    const command = new GetObjectCommand(params);
    return await getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Elimina un archivo de S3 o almacenamiento local
   */
  async deleteFile(key: string): Promise<void> {
    if (this.useLocalStorage) {
      const filePath = path.join(this.localStoragePath, key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info(`[LOCAL] Archivo eliminado: ${key}`);
      }
      return;
    }

    if (!this.isConfigured) {
      logger.info(`[S3 SIMULADO] Delete: ${key}`);
      return;
    }

    const params = {
      Bucket: this.bucket,
      Key: key,
    };

    try {
      const command = new DeleteObjectCommand(params);
      await this.s3.send(command);
    } catch (error) {
      logger.error('Error eliminando archivo de S3:', error);
      throw new Error('Error al eliminar archivo');
    }
  }

  /**
   * Obtiene un archivo del almacenamiento local
   */
  getLocalFile(key: string): Buffer | null {
    if (!this.useLocalStorage) return null;

    const filePath = path.join(this.localStoragePath, key);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
    return null;
  }

  /**
   * Verifica si el servicio esta configurado
   */
  isServiceConfigured(): boolean {
    return this.isConfigured;
  }

  /**
   * Verifica si usa almacenamiento local
   */
  isUsingLocalStorage(): boolean {
    return this.useLocalStorage;
  }

  /**
   * Obtiene la ruta del almacenamiento local
   */
  getLocalStoragePath(): string {
    return this.localStoragePath;
  }
}

export const s3Service = new S3Service();
export default s3Service;
