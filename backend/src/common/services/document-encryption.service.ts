// src/common/services/document-encryption.service.ts
import { logger } from './logger.service';
/**
 * Servicio de Cifrado At-Rest para Documentos Médicos
 *
 * Implementa cifrado AES-256-GCM para proteger documentos médicos
 * sensibles almacenados localmente o en S3.
 *
 * Cumple con:
 * - HIPAA (Health Insurance Portability and Accountability Act)
 * - NOM-024-SSA3-2012 (México - Expediente Clínico Electrónico)
 * - GDPR Art. 32 (Seguridad del tratamiento)
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import config from '../../config';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DE CIFRADO
// ═══════════════════════════════════════════════════════════════════════════

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits

// Prefijo para identificar archivos cifrados
const ENCRYPTED_FILE_HEADER = Buffer.from('VIDA_ENC_V1');

interface EncryptionMetadata {
  version: string;
  algorithm: string;
  iv: string; // hex
  authTag: string; // hex
  salt: string; // hex
  keyId?: string; // Para rotación de claves
  encryptedAt: string;
  originalSize: number;
}

interface EncryptedDocument {
  metadata: EncryptionMetadata;
  encryptedData: Buffer;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICIO DE CIFRADO
// ═══════════════════════════════════════════════════════════════════════════

class DocumentEncryptionService {
  private masterKey: Buffer;

  constructor() {
    // Derivar clave maestra de la clave de configuración
    const configKey = config.encryption.key;
    if (!configKey || configKey.length < 64) {
      throw new Error('ENCRYPTION_KEY no configurada o inválida');
    }
    this.masterKey = Buffer.from(configKey, 'hex');
  }

  /**
   * Deriva una clave única para cada documento
   * Usa HKDF nativo (RFC 5869) via crypto.hkdfSync
   */
  private deriveDocumentKey(salt: Buffer, context: string): Buffer {
    return Buffer.from(
      crypto.hkdfSync('sha256', this.masterKey, salt, Buffer.from(context), 32)
    );
  }

  /**
   * Cifra un documento (buffer de datos)
   *
   * @param data Buffer con los datos del documento
   * @param documentId ID único del documento para derivación de clave
   * @returns Documento cifrado con metadatos
   */
  async encryptDocument(data: Buffer, documentId: string): Promise<EncryptedDocument> {
    // Generar salt único para este documento
    const salt = crypto.randomBytes(SALT_LENGTH);

    // Derivar clave única para este documento
    const documentKey = this.deriveDocumentKey(salt, `document:${documentId}`);

    // Generar IV aleatorio
    const iv = crypto.randomBytes(IV_LENGTH);

    // Crear cifrador
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, documentKey, iv);

    // Cifrar datos
    const encryptedData = Buffer.concat([
      cipher.update(data),
      cipher.final(),
    ]);

    // Obtener tag de autenticación
    const authTag = cipher.getAuthTag();

    // Construir metadatos
    const metadata: EncryptionMetadata = {
      version: '1.0',
      algorithm: ENCRYPTION_ALGORITHM,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      salt: salt.toString('hex'),
      encryptedAt: new Date().toISOString(),
      originalSize: data.length,
    };

    return {
      metadata,
      encryptedData,
    };
  }

  /**
   * Descifra un documento
   *
   * @param encryptedDoc Documento cifrado con metadatos
   * @param documentId ID del documento
   * @returns Buffer con datos originales
   */
  async decryptDocument(encryptedDoc: EncryptedDocument, documentId: string): Promise<Buffer> {
    const { metadata, encryptedData } = encryptedDoc;

    // Verificar versión
    if (metadata.version !== '1.0') {
      throw new Error(`Versión de cifrado no soportada: ${metadata.version}`);
    }

    // Recuperar componentes
    const salt = Buffer.from(metadata.salt, 'hex');
    const iv = Buffer.from(metadata.iv, 'hex');
    const authTag = Buffer.from(metadata.authTag, 'hex');

    // Derivar la misma clave
    const documentKey = this.deriveDocumentKey(salt, `document:${documentId}`);

    // Crear descifrador
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, documentKey, iv);
    decipher.setAuthTag(authTag);

    // Descifrar
    try {
      const decryptedData = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final(),
      ]);

      return decryptedData;
    } catch (error) {
      throw new Error('Error al descifrar documento: datos corruptos o clave incorrecta');
    }
  }

  /**
   * Cifra y guarda un archivo en disco
   *
   * @param sourcePath Ruta del archivo original
   * @param destinationPath Ruta donde guardar archivo cifrado
   * @param documentId ID único del documento
   */
  async encryptFile(
    sourcePath: string,
    destinationPath: string,
    documentId: string
  ): Promise<EncryptionMetadata> {
    // Leer archivo original
    const originalData = await fs.readFile(sourcePath);

    // Cifrar
    const encrypted = await this.encryptDocument(originalData, documentId);

    // Crear archivo cifrado con header + metadata + datos
    const metadataJson = JSON.stringify(encrypted.metadata);
    const metadataBuffer = Buffer.from(metadataJson);
    const metadataLength = Buffer.alloc(4);
    metadataLength.writeUInt32BE(metadataBuffer.length, 0);

    const outputBuffer = Buffer.concat([
      ENCRYPTED_FILE_HEADER, // Header de identificación
      metadataLength, // Longitud de metadatos (4 bytes)
      metadataBuffer, // Metadatos JSON
      encrypted.encryptedData, // Datos cifrados
    ]);

    // Guardar archivo cifrado
    await fs.writeFile(destinationPath, outputBuffer);

    // Eliminar archivo original de forma segura (sobrescribir)
    await this.secureDelete(sourcePath);

    logger.info(`[ENCRYPTION] Archivo cifrado: ${path.basename(destinationPath)}`);

    return encrypted.metadata;
  }

  /**
   * Descifra un archivo desde disco
   *
   * @param encryptedPath Ruta del archivo cifrado
   * @param documentId ID del documento
   * @returns Buffer con datos originales
   */
  async decryptFile(encryptedPath: string, documentId: string): Promise<Buffer> {
    // Leer archivo cifrado
    const fileData = await fs.readFile(encryptedPath);

    // Verificar header
    const header = fileData.subarray(0, ENCRYPTED_FILE_HEADER.length);
    if (!header.equals(ENCRYPTED_FILE_HEADER)) {
      throw new Error('Archivo no es un documento cifrado válido de Sistema VIDA');
    }

    // Leer longitud de metadatos
    const metadataLengthOffset = ENCRYPTED_FILE_HEADER.length;
    const metadataLength = fileData.readUInt32BE(metadataLengthOffset);

    // Leer metadatos
    const metadataOffset = metadataLengthOffset + 4;
    const metadataBuffer = fileData.subarray(metadataOffset, metadataOffset + metadataLength);
    const metadata: EncryptionMetadata = JSON.parse(metadataBuffer.toString());

    // Leer datos cifrados
    const dataOffset = metadataOffset + metadataLength;
    const encryptedData = fileData.subarray(dataOffset);

    // Descifrar
    return this.decryptDocument({ metadata, encryptedData }, documentId);
  }

  /**
   * Verifica si un archivo está cifrado
   */
  async isFileEncrypted(filePath: string): Promise<boolean> {
    try {
      const handle = await fs.open(filePath, 'r');
      const buffer = Buffer.alloc(ENCRYPTED_FILE_HEADER.length);
      await handle.read(buffer, 0, ENCRYPTED_FILE_HEADER.length, 0);
      await handle.close();

      return buffer.equals(ENCRYPTED_FILE_HEADER);
    } catch {
      return false;
    }
  }

  /**
   * Obtiene metadatos de un archivo cifrado sin descifrar
   */
  async getEncryptedFileMetadata(filePath: string): Promise<EncryptionMetadata | null> {
    try {
      const fileData = await fs.readFile(filePath);

      // Verificar header
      const header = fileData.subarray(0, ENCRYPTED_FILE_HEADER.length);
      if (!header.equals(ENCRYPTED_FILE_HEADER)) {
        return null;
      }

      // Leer metadatos
      const metadataLengthOffset = ENCRYPTED_FILE_HEADER.length;
      const metadataLength = fileData.readUInt32BE(metadataLengthOffset);

      const metadataOffset = metadataLengthOffset + 4;
      const metadataBuffer = fileData.subarray(metadataOffset, metadataOffset + metadataLength);

      return JSON.parse(metadataBuffer.toString());
    } catch {
      return null;
    }
  }

  /**
   * Elimina un archivo de forma segura (sobrescribe antes de eliminar)
   */
  private async secureDelete(filePath: string): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;

      // Sobrescribir con datos aleatorios 3 veces
      for (let pass = 0; pass < 3; pass++) {
        const randomData = crypto.randomBytes(fileSize);
        await fs.writeFile(filePath, randomData);
      }

      // Eliminar archivo
      await fs.unlink(filePath);
    } catch (error) {
      // Si falla la eliminación segura, intentar eliminación normal
      try {
        await fs.unlink(filePath);
      } catch {
        logger.error(`[ENCRYPTION] Error eliminando archivo: ${filePath}`);
      }
    }
  }

  /**
   * Cifra todos los documentos existentes no cifrados
   * (Migración única)
   *
   * @param uploadsDir Directorio de uploads
   */
  async migrateExistingDocuments(uploadsDir: string): Promise<{
    processed: number;
    encrypted: number;
    skipped: number;
    errors: string[];
  }> {
    const results = {
      processed: 0,
      encrypted: 0,
      skipped: 0,
      errors: [] as string[],
    };

    try {
      const files = await fs.readdir(uploadsDir);

      for (const file of files) {
        results.processed++;
        const filePath = path.join(uploadsDir, file);

        try {
          // Verificar si ya está cifrado
          const isEncrypted = await this.isFileEncrypted(filePath);
          if (isEncrypted) {
            results.skipped++;
            continue;
          }

          // Generar ID único para el documento
          const documentId = crypto.randomUUID();

          // Cifrar archivo (sobrescribe el original)
          const encryptedPath = filePath; // Mismo nombre
          await this.encryptFile(filePath, encryptedPath, documentId);

          results.encrypted++;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
          results.errors.push(`${file}: ${errorMsg}`);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
      results.errors.push(`Error leyendo directorio: ${errorMsg}`);
    }

    logger.info('[ENCRYPTION] Migración completada:', results);
    return results;
  }
}

// Singleton
let instance: DocumentEncryptionService | null = null;

export function getDocumentEncryptionService(): DocumentEncryptionService {
  if (!instance) {
    instance = new DocumentEncryptionService();
  }
  return instance;
}

export const documentEncryptionService = {
  encryptDocument: (data: Buffer, documentId: string) =>
    getDocumentEncryptionService().encryptDocument(data, documentId),
  decryptDocument: (encryptedDoc: EncryptedDocument, documentId: string) =>
    getDocumentEncryptionService().decryptDocument(encryptedDoc, documentId),
  encryptFile: (sourcePath: string, destinationPath: string, documentId: string) =>
    getDocumentEncryptionService().encryptFile(sourcePath, destinationPath, documentId),
  decryptFile: (encryptedPath: string, documentId: string) =>
    getDocumentEncryptionService().decryptFile(encryptedPath, documentId),
  isFileEncrypted: (filePath: string) =>
    getDocumentEncryptionService().isFileEncrypted(filePath),
  getEncryptedFileMetadata: (filePath: string) =>
    getDocumentEncryptionService().getEncryptedFileMetadata(filePath),
  migrateExistingDocuments: (uploadsDir: string) =>
    getDocumentEncryptionService().migrateExistingDocuments(uploadsDir),
};

export default documentEncryptionService;
