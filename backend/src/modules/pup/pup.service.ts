// src/modules/pup/pup.service.ts
import { PatientProfile, DocumentCategory } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { encrypt, decrypt, encryptJSON, decryptJSON } from '../../common/utils/encryption';
import { encryptionV2 } from '../../common/services/encryption-v2.service';
import { generateEmergencyQR } from '../../common/utils/qr-generator';
import { qrTokenService } from '../../common/services/qr-token.service';
import { pdfGeneratorService } from '../../common/services/pdf-generator.service';
import { s3Service } from '../../common/services/s3.service';
import { logger } from '../../common/services/logger.service';

import { prisma } from '../../common/prisma';

// Tipos para datos médicos (descifrados)
interface MedicalData {
  allergies: string[];
  conditions: string[];
  medications: string[];
}

interface DonorPreferences {
  organs: string[];
  tissues: string[];
  forResearch: boolean;
  restrictions?: string;
}

interface ProfileInput {
  bloodType?: string;
  allergies?: string[];
  conditions?: string[];
  medications?: string[];
  insuranceProvider?: string;
  insurancePolicy?: string;
  insurancePhone?: string;
  isDonor?: boolean;
  donorPreferences?: DonorPreferences;
}

interface ProfileResponse {
  id: string;
  bloodType: string | null;
  allergies: string[];
  conditions: string[];
  medications: string[];
  insuranceProvider: string | null;
  insurancePolicy: string | null;
  insurancePhone: string | null;
  isDonor: boolean;
  donorPreferences: DonorPreferences | null;
  photoUrl: string | null;
  qrToken: string;
}

class PupService {
  /**
   * Obtiene el perfil del paciente (descifrado)
   */
  async getProfile(userId: string): Promise<ProfileResponse | null> {
    const profile = await prisma.patientProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return null;
    }

    // MED-11: Audit profile reads
    prisma.auditLog.create({
      data: {
        userId,
        actorType: 'USER',
        action: 'READ',
        resource: 'patient_profile',
        resourceId: profile.id,
      },
    }).catch(err => logger.error('Error registering profile read audit', err));

    return this.decryptProfile(profile);
  }
  
  /**
   * Actualiza el perfil del paciente (crea si no existe)
   */
  async updateProfile(userId: string, input: ProfileInput): Promise<ProfileResponse> {
    // Cifrar datos sensibles
    const updateData: any = {};

    if (input.bloodType !== undefined) {
      updateData.bloodType = input.bloodType;
      updateData.bloodTypeEnc = input.bloodType ? encryptionV2.encryptField(input.bloodType) : null;
    }

    if (input.allergies !== undefined) {
      updateData.allergiesEnc = encryptJSON(input.allergies);
    }

    if (input.conditions !== undefined) {
      updateData.conditionsEnc = encryptJSON(input.conditions);
    }

    if (input.medications !== undefined) {
      updateData.medicationsEnc = encryptJSON(input.medications);
    }

    if (input.insuranceProvider !== undefined) {
      updateData.insuranceProvider = input.insuranceProvider;
    }

    if (input.insurancePolicy !== undefined) {
      updateData.insurancePolicy = input.insurancePolicy;
      updateData.insurancePolicyEnc = input.insurancePolicy ? encryptionV2.encryptField(input.insurancePolicy) : null;
    }

    if (input.insurancePhone !== undefined) {
      updateData.insurancePhone = input.insurancePhone;
    }

    if (input.isDonor !== undefined) {
      updateData.isDonor = input.isDonor;
    }

    if (input.donorPreferences !== undefined) {
      updateData.donorPreferencesEnc = encryptJSON(input.donorPreferences);
    }

    // Usar upsert para crear el perfil si no existe
    const profile = await prisma.patientProfile.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        ...updateData,
        // Generar QR token si es un perfil nuevo
        qrToken: uuidv4(),
      },
    });

    return this.decryptProfile(profile);
  }
  
  /**
   * Actualiza la foto de perfil
   */
  async updatePhoto(userId: string, photoUrl: string): Promise<ProfileResponse> {
    const profile = await prisma.patientProfile.update({
      where: { userId },
      data: { photoUrl },
    });
    
    return this.decryptProfile(profile);
  }
  
  /**
   * Regenera el código QR
   */
  async regenerateQR(userId: string): Promise<{ qrToken: string; qrDataUrl: string }> {
    const newQrToken = uuidv4();
    
    await prisma.patientProfile.update({
      where: { userId },
      data: {
        qrToken: newQrToken,
        qrGeneratedAt: new Date(),
      },
    });
    
    const qrResult = await generateEmergencyQR(newQrToken);
    
    return {
      qrToken: newQrToken,
      qrDataUrl: qrResult.qrDataUrl,
    };
  }
  
  /**
   * Obtiene el código QR del usuario (crea perfil si no existe)
   */
  async getQR(userId: string): Promise<{ qrToken: string; qrDataUrl: string; generatedAt: Date }> {
    // Buscar perfil existente
    let profile = await prisma.patientProfile.findUnique({
      where: { userId },
      select: { qrToken: true, qrGeneratedAt: true },
    });

    // Si no existe perfil, crear uno básico con QR
    if (!profile) {
      const qrToken = uuidv4();
      const now = new Date();

      profile = await prisma.patientProfile.create({
        data: {
          userId,
          qrToken,
          qrGeneratedAt: now,
        },
        select: { qrToken: true, qrGeneratedAt: true },
      });

      logger.info('Perfil básico creado automáticamente para QR', { userId });
    }

    // Generate signed token for the QR code (contains HMAC, no PHI)
    const signedToken = qrTokenService.generateToken(profile.qrToken, 'emergency');
    const qrResult = await generateEmergencyQR(signedToken);

    return {
      qrToken: signedToken,
      qrDataUrl: qrResult.qrDataUrl,
      generatedAt: profile.qrGeneratedAt,
    };
  }
  
  /**
   * Obtiene perfil por QR token (para acceso de emergencia)
   * Solo retorna datos críticos
   */
  async getProfileByQRToken(qrToken: string): Promise<{
    userId: string;
    name: string;
    dateOfBirth: Date | null;
    sex: string | null;
    bloodType: string | null;
    allergies: string[];
    conditions: string[];
    medications: string[];
    isDonor: boolean;
    photoUrl: string | null;
  } | null> {
    const profile = await prisma.patientProfile.findUnique({
      where: { qrToken },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            dateOfBirth: true,
            sex: true,
          },
        },
      },
    });
    
    if (!profile) {
      return null;
    }
    
    return {
      userId: profile.user.id,
      name: profile.user.name,
      dateOfBirth: profile.user.dateOfBirth,
      sex: profile.user.sex,
      bloodType: profile.bloodType,
      allergies: profile.allergiesEnc ? decryptJSON<string[]>(profile.allergiesEnc) : [],
      conditions: profile.conditionsEnc ? decryptJSON<string[]>(profile.conditionsEnc) : [],
      medications: profile.medicationsEnc ? decryptJSON<string[]>(profile.medicationsEnc) : [],
      isDonor: profile.isDonor,
      photoUrl: profile.photoUrl,
    };
  }
  
  /**
   * Descifra un perfil de la base de datos
   */
  private decryptProfile(profile: PatientProfile): ProfileResponse {
    // Función helper para desencriptar con manejo de errores
    const safeDecryptJSON = <T>(encryptedData: string | null, defaultValue: T): T => {
      if (!encryptedData) return defaultValue;
      try {
        return decryptJSON<T>(encryptedData);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Error desencriptando datos del perfil:', {
          error: errorMessage,
          profileId: profile.id,
          field: 'unknown'
        });
        // Retornar valor por defecto si hay error de desencriptación
        return defaultValue;
      }
    };

    return {
      id: profile.id,
      bloodType: profile.bloodType,
      allergies: safeDecryptJSON<string[]>(profile.allergiesEnc, []),
      conditions: safeDecryptJSON<string[]>(profile.conditionsEnc, []),
      medications: safeDecryptJSON<string[]>(profile.medicationsEnc, []),
      insuranceProvider: profile.insuranceProvider,
      insurancePolicy: profile.insurancePolicy,
      insurancePhone: profile.insurancePhone,
      isDonor: profile.isDonor,
      donorPreferences: safeDecryptJSON<DonorPreferences | null>(profile.donorPreferencesEnc, null),
      photoUrl: profile.photoUrl,
      qrToken: profile.qrToken,
    };
  }

  /**
   * Genera el documento PDF del perfil médico y lo guarda en documentos
   */
  async generateProfileDocument(userId: string): Promise<{ documentId: string; title: string } | null> {
    try {
      // Obtener datos del usuario
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          curp: true,
          dateOfBirth: true,
        },
      });

      if (!user) {
        logger.error('Usuario no encontrado para generar PDF', { userId });
        return null;
      }

      // Obtener perfil médico
      const profile = await prisma.patientProfile.findUnique({
        where: { userId },
      });

      if (!profile) {
        logger.error('Perfil no encontrado para generar PDF', { userId });
        return null;
      }

      // Obtener representantes
      const representatives = await prisma.representative.findMany({
        where: { userId },
        orderBy: { priority: 'asc' },
      });

      // Preparar datos para el PDF
      const profileData = {
        user: {
          name: user.name,
          email: user.email,
          phone: user.phone || undefined,
          curp: user.curp || undefined,
          birthDate: user.dateOfBirth || undefined,
        },
        profile: {
          bloodType: profile.bloodType || undefined,
          photoUrl: profile.photoUrl || undefined,
          qrToken: profile.qrToken,
          allergies: profile.allergiesEnc
            ? decryptJSON<Array<{ name: string; severity: string; reaction?: string }>>(profile.allergiesEnc)
            : undefined,
          conditions: profile.conditionsEnc
            ? decryptJSON<Array<{ name: string; diagnosedDate?: string; notes?: string }>>(profile.conditionsEnc)
            : undefined,
          medications: profile.medicationsEnc
            ? decryptJSON<Array<{ name: string; dose?: string; frequency?: string }>>(profile.medicationsEnc)
            : undefined,
          insuranceProvider: profile.insuranceProvider || undefined,
          insurancePolicy: profile.insurancePolicy || undefined,
          insurancePhone: profile.insurancePhone || undefined,
          isDonor: profile.isDonor,
          donorPreferences: profile.donorPreferencesEnc
            ? decryptJSON<DonorPreferences>(profile.donorPreferencesEnc)
            : undefined,
        },
        representatives: representatives.map(rep => ({
          name: rep.name,
          relationship: rep.relation,
          phone: rep.phone,
          email: rep.email || undefined,
          isPrimary: rep.priority === 1,
        })),
      };

      // Generar PDF
      const pdfBuffer = await pdfGeneratorService.generateMedicalProfilePDF(profileData);

      const documentTitle = 'Perfil Médico de Emergencia';
      const fileName = `perfil-medico-${user.name.toLowerCase().replace(/\s+/g, '-')}.pdf`;

      // Buscar si ya existe un documento de perfil médico
      const existingDoc = await prisma.medicalDocument.findFirst({
        where: {
          userId,
          title: documentTitle,
          category: 'EMERGENCY_PROFILE' as DocumentCategory,
        },
      });

      let documentId: string;

      // Subir PDF a S3
      const uploadResult = await s3Service.uploadFile({
        buffer: pdfBuffer,
        fileName: fileName,
        mimeType: 'application/pdf',
        folder: `documents/${userId}`,
      });

      const { url: fileUrl, key: s3Key } = uploadResult;

      if (existingDoc) {
        // Actualizar documento existente
        documentId = existingDoc.id;

        // Eliminar archivo anterior de S3 si es diferente
        if (existingDoc.s3Key !== s3Key) {
          await s3Service.deleteFile(existingDoc.s3Key).catch(() => {});
        }

        await prisma.medicalDocument.update({
          where: { id: existingDoc.id },
          data: {
            fileUrl,
            s3Key,
            fileSize: pdfBuffer.length,
            updatedAt: new Date(),
          },
        });

        logger.info('Documento de perfil médico actualizado', { userId, documentId });
      } else {
        // Crear nuevo documento
        documentId = uuidv4();

        await prisma.medicalDocument.create({
          data: {
            id: documentId,
            userId,
            title: documentTitle,
            description: 'Documento generado automáticamente con la información de tu perfil médico de emergencia. Se actualiza cada vez que modificas tu perfil.',
            category: 'EMERGENCY_PROFILE' as DocumentCategory,
            fileName,
            fileType: 'application/pdf',
            fileSize: pdfBuffer.length,
            fileUrl,
            s3Key,
            isVisible: true, // Visible en emergencias
            documentDate: new Date(),
          },
        });

        logger.info('Documento de perfil médico creado', { userId, documentId });
      }

      return { documentId, title: documentTitle };
    } catch (error: any) {
      logger.error('Error generando documento de perfil médico', {
        userId,
        errorMessage: error?.message,
        errorStack: error?.stack,
      });
      console.error('Error completo:', error);
      return null;
    }
  }
}

export const pupService = new PupService();
export default pupService;
