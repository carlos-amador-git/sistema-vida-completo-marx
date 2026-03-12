// src/modules/documents/documents.service.ts
import { DocumentCategory, MedicalDocument } from '@prisma/client';
import { s3Service } from '../../common/services/s3.service';
import { documentEncryptionService } from '../../common/services/document-encryption.service';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../common/services/logger.service';

import { prisma } from '../../common/prisma';

interface CreateDocumentInput {
  title: string;
  description?: string;
  category: DocumentCategory;
  documentDate?: Date;
  doctorName?: string;
  institution?: string;
  isVisible?: boolean;
}

interface DocumentResponse {
  id: string;
  title: string;
  description: string | null;
  category: DocumentCategory;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  documentDate: Date | null;
  doctorName: string | null;
  institution: string | null;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Categorias con sus etiquetas en español
export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  EMERGENCY_PROFILE: 'Perfil de Emergencia',
  CLINICAL_HISTORY: 'Historia Clínica / Resumen',
  LAB_RESULTS: 'Resultados de Laboratorio',
  IMAGING: 'Estudios de Imagen',
  PRESCRIPTIONS: 'Recetas Médicas',
  DISCHARGE_SUMMARY: 'Resumen de Alta',
  SURGICAL_REPORT: 'Reporte Quirúrgico',
  VACCINATION: 'Cartilla de Vacunación',
  INSURANCE: 'Póliza de Seguro',
  IDENTIFICATION: 'Identificación',
  OTHER: 'Otro',
};

class DocumentsService {
  /**
   * Lista todos los documentos del usuario
   */
  async listDocuments(
    userId: string,
    filters?: {
      category?: DocumentCategory;
      search?: string;
    }
  ): Promise<DocumentResponse[]> {
    const where: any = { userId };

    if (filters?.category) {
      where.category = filters.category;
    }

    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { doctorName: { contains: filters.search, mode: 'insensitive' } },
        { institution: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const documents = await prisma.medicalDocument.findMany({
      where,
      orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
    });

    return documents.map(this.formatDocument);
  }

  /**
   * Obtiene un documento por ID
   */
  async getDocument(userId: string, documentId: string): Promise<DocumentResponse | null> {
    const document = await prisma.medicalDocument.findFirst({
      where: { id: documentId, userId },
    });

    return document ? this.formatDocument(document) : null;
  }

  /**
   * Obtiene URL firmada para descargar documento
   */
  async getDownloadUrl(userId: string, documentId: string): Promise<string | null> {
    const document = await prisma.medicalDocument.findFirst({
      where: { id: documentId, userId },
    });

    if (!document) return null;

    // Generar URL firmada valida por 1 hora
    return s3Service.getSignedUrl(document.s3Key, 3600);
  }

  /**
   * Crea un nuevo documento con archivo
   * Los documentos médicos se cifran antes de almacenar (at-rest encryption)
   */
  async createDocument(
    userId: string,
    input: CreateDocumentInput,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    }
  ): Promise<DocumentResponse> {
    // Generar ID único para el documento (usado para derivar clave de cifrado)
    const documentId = uuidv4();

    // Cifrar el documento antes de almacenar
    let fileToUpload = file.buffer;
    let isEncrypted = false;

    try {
      const encrypted = await documentEncryptionService.encryptDocument(file.buffer, documentId);
      // Combinar metadata y datos cifrados en un solo buffer
      const metadataJson = JSON.stringify(encrypted.metadata);
      const metadataBuffer = Buffer.from(metadataJson);
      const metadataLength = Buffer.alloc(4);
      metadataLength.writeUInt32BE(metadataBuffer.length, 0);

      fileToUpload = Buffer.concat([
        Buffer.from('VIDA_ENC_V1'), // Header
        metadataLength,
        metadataBuffer,
        encrypted.encryptedData,
      ]);
      isEncrypted = true;

      logger.info('Documento cifrado exitosamente', {
        documentId,
        originalSize: file.size,
        encryptedSize: fileToUpload.length,
      });
    } catch (error) {
      // Si falla el cifrado, almacenar sin cifrar pero loggear el error
      logger.error('Error cifrando documento, almacenando sin cifrar', error, {
        documentId,
        userId,
      });
    }

    // Subir archivo a S3
    const { url, key } = await s3Service.uploadFile({
      buffer: fileToUpload,
      fileName: isEncrypted ? `${file.originalname}.enc` : file.originalname,
      mimeType: isEncrypted ? 'application/octet-stream' : file.mimetype,
      folder: `documents/${userId}`,
    });

    // Crear registro en BD
    const document = await prisma.medicalDocument.create({
      data: {
        id: documentId, // Usar el mismo ID para referencia de cifrado
        userId,
        title: input.title,
        description: input.description,
        category: input.category,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
        fileUrl: url,
        s3Key: key,
        documentDate: input.documentDate,
        doctorName: input.doctorName,
        institution: input.institution,
        isVisible: input.isVisible ?? true,
      },
    });

    return this.formatDocument(document);
  }

  /**
   * Actualiza metadatos de un documento
   */
  async updateDocument(
    userId: string,
    documentId: string,
    input: Partial<CreateDocumentInput>
  ): Promise<DocumentResponse | null> {
    const existing = await prisma.medicalDocument.findFirst({
      where: { id: documentId, userId },
    });

    if (!existing) return null;

    const document = await prisma.medicalDocument.update({
      where: { id: documentId },
      data: {
        title: input.title ?? existing.title,
        description: input.description !== undefined ? input.description : existing.description,
        category: input.category ?? existing.category,
        documentDate: input.documentDate !== undefined ? input.documentDate : existing.documentDate,
        doctorName: input.doctorName !== undefined ? input.doctorName : existing.doctorName,
        institution: input.institution !== undefined ? input.institution : existing.institution,
        isVisible: input.isVisible ?? existing.isVisible,
      },
    });

    return this.formatDocument(document);
  }

  /**
   * Elimina un documento
   */
  async deleteDocument(userId: string, documentId: string): Promise<boolean> {
    const document = await prisma.medicalDocument.findFirst({
      where: { id: documentId, userId },
    });

    if (!document) return false;

    // Eliminar archivo de S3
    await s3Service.deleteFile(document.s3Key);

    // Eliminar registro de BD
    await prisma.medicalDocument.delete({
      where: { id: documentId },
    });

    return true;
  }

  /**
   * Obtiene documentos visibles para emergencias
   */
  async getVisibleDocuments(userId: string): Promise<DocumentResponse[]> {
    const documents = await prisma.medicalDocument.findMany({
      where: { userId, isVisible: true },
      orderBy: [{ category: 'asc' }, { documentDate: 'desc' }],
    });

    return documents.map(this.formatDocument);
  }

  /**
   * Obtiene estadisticas de documentos
   */
  async getDocumentStats(userId: string): Promise<{
    total: number;
    byCategory: Record<string, number>;
    totalSize: number;
  }> {
    const documents = await prisma.medicalDocument.findMany({
      where: { userId },
      select: { category: true, fileSize: true },
    });

    const byCategory: Record<string, number> = {};
    let totalSize = 0;

    documents.forEach((doc) => {
      byCategory[doc.category] = (byCategory[doc.category] || 0) + 1;
      totalSize += doc.fileSize;
    });

    return {
      total: documents.length,
      byCategory,
      totalSize,
    };
  }

  /**
   * Formatea un documento para la respuesta
   */
  private formatDocument(doc: MedicalDocument): DocumentResponse {
    return {
      id: doc.id,
      title: doc.title,
      description: doc.description,
      category: doc.category,
      fileName: doc.fileName,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      fileUrl: doc.fileUrl,
      documentDate: doc.documentDate,
      doctorName: doc.doctorName,
      institution: doc.institution,
      isVisible: doc.isVisible,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

export const documentsService = new DocumentsService();
export default documentsService;
