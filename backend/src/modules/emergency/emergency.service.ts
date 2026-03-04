// src/modules/emergency/emergency.service.ts
import { EmergencyAccess } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { pupService } from '../pup/pup.service';
import { directivesService } from '../directives/directives.service';
import { notificationService } from '../notification/notification.service';
import { hospitalService } from '../hospital/hospital.service';
import { documentsService } from '../documents/documents.service';
import { s3Service } from '../../common/services/s3.service';
import { logger } from '../../common/services/logger.service';
import { getSocketServer } from '../../common/services/socket-manager';
import { getAlertMessageForTrustLevel } from '../../common/utils/credential-validation';

import { prisma } from '../../common/prisma';

// Tipos
interface EmergencyAccessInput {
  qrToken: string;
  accessorName: string;
  accessorRole: string;
  accessorLicense?: string;
  institutionId?: string;
  institutionName?: string;
  ipAddress?: string;
  userAgent?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  // Campos de verificación de credenciales
  trustLevel?: 'VERIFIED' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNVERIFIED';
  credentialsVerified?: boolean;
  credentialWarnings?: string[];
  // Campos de verificación SEP
  sepVerification?: {
    found: boolean;
    professionalName?: string;
    title?: string;
    institution?: string;
    isHealthProfessional?: boolean;
    nameMatches?: boolean;
  };
}

interface EmergencyDocument {
  id: string;
  title: string;
  category: string;
  fileType: string;
  downloadUrl: string;
  documentDate: Date | null;
  institution: string | null;
}

interface EmergencyDataResponse {
  accessToken: string;
  expiresAt: Date;
  patient: {
    name: string;
    dateOfBirth: Date | null;
    sex: string | null;
    photoUrl: string | null;
  };
  medicalInfo: {
    bloodType: string | null;
    allergies: string[];
    conditions: string[];
    medications: string[];
  };
  directive: {
    hasActiveDirective: boolean;
    acceptsCPR: boolean | null;
    acceptsIntubation: boolean | null;
    additionalNotes: string | null;
    documentUrl: string | null;
    validatedAt: Date | null;
    directiveType: string | null;
    legalStatus: 'LEGALLY_BINDING' | 'INFORMATIONAL' | null;
    palliativeCareOnly: boolean | null;
  };
  donation: {
    isDonor: boolean;
  };
  representatives: {
    name: string;
    phone: string;
    relation: string;
    priority: number;
  }[];
  documents: EmergencyDocument[];
}

class EmergencyService {
  /**
   * Inicia un acceso de emergencia escaneando el QR
   */
  async initiateEmergencyAccess(input: EmergencyAccessInput): Promise<EmergencyDataResponse | null> {
    // Buscar el perfil por QR token
    const profileData = await pupService.getProfileByQRToken(input.qrToken);
    
    if (!profileData) {
      return null;
    }
    
    // Obtener directivas activas
    const directiveData = await directivesService.getDirectivesForEmergency(profileData.userId);
    
    // Obtener representantes
    const representatives = await prisma.representative.findMany({
      where: { userId: profileData.userId },
      orderBy: { priority: 'asc' },
      select: {
        name: true,
        phone: true,
        relation: true,
        priority: true,
      },
    });

    // Obtener documentos visibles para emergencias
    const visibleDocs = await documentsService.getVisibleDocuments(profileData.userId);

    // Batch-fetch s3Keys for all visible docs in ONE query (eliminates N+1)
    const docIds = visibleDocs.map(d => d.id);
    const dbDocs = docIds.length > 0
      ? await prisma.medicalDocument.findMany({
          where: { id: { in: docIds } },
          select: { id: true, s3Key: true },
        })
      : [];
    const s3KeyMap = new Map(dbDocs.map(d => [d.id, d.s3Key]));

    // Generate signed URLs in parallel
    const documents: EmergencyDocument[] = await Promise.all(
      visibleDocs.map(async (doc) => {
        let downloadUrl = doc.fileUrl;
        try {
          const s3Key = s3KeyMap.get(doc.id);
          if (s3Key) {
            downloadUrl = await s3Service.getSignedUrl(s3Key, 3600) || doc.fileUrl;
          }
        } catch (error) {
          logger.error('Error getting signed URL for document', { docId: doc.id, error });
        }
        return {
          id: doc.id,
          title: doc.title,
          category: doc.category,
          fileType: doc.fileType,
          downloadUrl,
          documentDate: doc.documentDate,
          institution: doc.institution,
        };
      })
    );

    // Break-the-glass: temporal access capped at 4 hours (P2-03)
    // Default 1 hour for regular access, extendable up to 4h max
    const MAX_SESSION_HOURS = 4;
    const DEFAULT_SESSION_HOURS = 1;
    const accessToken = uuidv4();
    const expiresAt = new Date(Date.now() + DEFAULT_SESSION_HOURS * 60 * 60 * 1000);
    const maxExpiresAt = new Date(Date.now() + MAX_SESSION_HOURS * 60 * 60 * 1000);
    // Schedule 24-hour review requirement flag
    const reviewDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    // Registrar el acceso con datos de verificación SEP
    const emergencyAccess = await prisma.emergencyAccess.create({
      data: {
        patientId: profileData.userId,
        accessorName: input.accessorName,
        accessorRole: input.accessorRole,
        accessorLicense: input.accessorLicense,
        institutionId: input.institutionId,
        institutionName: input.institutionName,
        qrTokenUsed: input.qrToken,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        latitude: input.latitude,
        longitude: input.longitude,
        locationName: input.locationName,
        dataAccessed: ['profile', 'allergies', 'conditions', 'medications', 'directives', 'representatives', 'documents'],
        accessToken,
        expiresAt,
        // Datos de verificación de credenciales
        trustLevel: input.trustLevel,
        sepVerified: input.sepVerification?.found,
        sepProfessionalName: input.sepVerification?.professionalName,
        sepTitle: input.sepVerification?.title,
        sepInstitution: input.sepVerification?.institution,
        sepIsHealthProfessional: input.sepVerification?.isHealthProfessional,
        sepNameMatches: input.sepVerification?.nameMatches,
        credentialWarnings: input.credentialWarnings || [],
      },
    });
    
    // Registrar en auditoría
    await prisma.auditLog.create({
      data: {
        userId: profileData.userId,
        actorType: 'STAFF',
        actorName: input.accessorName,
        action: 'EMERGENCY_ACCESS',
        resource: 'patient_data',
        resourceId: profileData.userId,
        details: {
          accessorRole: input.accessorRole,
          institutionName: input.institutionName,
          location: input.locationName,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
    
    // Notificar a representantes via SMS y WebSocket
    // Incluir nivel de confianza para alertas más específicas
    this.notifyRepresentatives(
      profileData.userId,
      input.accessorName,
      {
        lat: input.latitude,
        lng: input.longitude,
        name: input.locationName,
      },
      {
        accessorRole: input.accessorRole,
        trustLevel: input.trustLevel || 'UNVERIFIED',
        credentialsVerified: input.credentialsVerified || false,
        accessorLicense: input.accessorLicense,
        institutionName: input.institutionName,
      }
    );
    
    return {
      accessToken,
      expiresAt,
      patient: {
        name: profileData.name,
        dateOfBirth: profileData.dateOfBirth,
        sex: profileData.sex,
        photoUrl: profileData.photoUrl,
      },
      medicalInfo: {
        bloodType: profileData.bloodType,
        allergies: profileData.allergies,
        conditions: profileData.conditions,
        medications: profileData.medications,
      },
      directive: directiveData || {
        hasActiveDirective: false,
        acceptsCPR: null,
        acceptsIntubation: null,
        additionalNotes: null,
        documentUrl: null,
        validatedAt: null,
        directiveType: null,
        legalStatus: null,
        palliativeCareOnly: null,
      },
      donation: {
        isDonor: profileData.isDonor,
      },
      representatives,
      documents,
    };
  }

  /**
   * Verifica si un token de acceso de emergencia es válido
   */
  async verifyAccessToken(accessToken: string): Promise<EmergencyAccess | null> {
    const access = await prisma.emergencyAccess.findUnique({
      where: { accessToken },
    });
    
    if (!access || access.expiresAt < new Date()) {
      return null;
    }
    
    return access;
  }
  
  /**
   * Obtiene el historial de accesos de emergencia del paciente
   */
  async getAccessHistory(userId: string): Promise<EmergencyAccess[]> {
    return await prisma.emergencyAccess.findMany({
      where: { patientId: userId },
      orderBy: { accessedAt: 'desc' },
      include: {
        institution: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    });
  }
  
  /**
   * Registra una institución médica
   */
  async registerInstitution(data: {
    name: string;
    type: string;
    cluesCode?: string;
    address?: string;
    city?: string;
    state?: string;
    phone?: string;
    email?: string;
  }) {
    return await prisma.medicalInstitution.create({
      data: {
        name: data.name,
        type: data.type as any,
        cluesCode: data.cluesCode,
        address: data.address,
        city: data.city,
        state: data.state,
        phone: data.phone,
        email: data.email,
      },
    });
  }
  
  /**
   * Notifica a los representantes sobre el acceso de emergencia
   * Envía SMS y Email reales, y emite eventos WebSocket
   * Usa búsqueda inteligente de hospitales basada en condiciones del paciente
   * Incluye nivel de confianza de credenciales para alertas más específicas
   */
  private async notifyRepresentatives(
    userId: string,
    accessorName: string,
    location?: { lat?: number; lng?: number; name?: string },
    credentialInfo?: {
      accessorRole: string;
      trustLevel: 'VERIFIED' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNVERIFIED';
      credentialsVerified: boolean;
      accessorLicense?: string;
      institutionName?: string;
    }
  ): Promise<void> {
    // Obtener datos del usuario con su perfil médico
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        profile: {
          select: {
            conditionsEnc: true,
          },
        },
      },
    });

    if (!user) {
      logger.error('Usuario no encontrado para notificación', { userId });
      return;
    }

    // Decrypt patient conditions from already-loaded profile (avoids redundant DB call)
    let patientConditions: string[] = [];
    if (user.profile?.conditionsEnc) {
      try {
        const { encryptionV2 } = await import('../../common/services/encryption-v2.service');
        patientConditions = JSON.parse(encryptionV2.decryptField(user.profile.conditionsEnc));
      } catch {
        patientConditions = [];
      }
    }

    // Buscar hospitales cercanos usando filtro inteligente
    let nearestHospital: string | undefined;
    let nearbyHospitals: Array<{ name: string; distance: number; phone?: string; matchScore?: number }> = [];

    if (location?.lat && location?.lng) {
      // Usar búsqueda inteligente si hay condiciones conocidas
      if (patientConditions.length > 0) {
        const hospitals = await hospitalService.findNearbyHospitalsForConditions({
          latitude: location.lat,
          longitude: location.lng,
          patientConditions,
          limit: 5,
          radiusKm: 20,
          prioritizeByCondition: true,
        });
        nearbyHospitals = hospitals.map(h => ({
          name: h.name,
          distance: h.distance,
          phone: h.emergencyPhone || h.phone || undefined,
          matchScore: h.matchScore,
        }));
        nearestHospital = hospitals[0]?.name;
      } else {
        // Búsqueda normal si no hay condiciones
        const hospitals = await hospitalService.findNearbyHospitals({
          latitude: location.lat,
          longitude: location.lng,
          limit: 5,
          radiusKm: 20,
        });
        nearbyHospitals = hospitals.map(h => ({
          name: h.name,
          distance: h.distance,
          phone: h.emergencyPhone || h.phone || undefined,
        }));
        nearestHospital = hospitals[0]?.name;
      }
    }

    // Enviar notificaciones SMS y Email a representantes
    const notificationResults = await notificationService.notifyAllRepresentatives({
      userId,
      patientName: user.name,
      type: 'QR_ACCESS',
      locale: (user as any).preferredLanguage || 'es',
      location: location?.lat && location?.lng
        ? { lat: location.lat, lng: location.lng }
        : { lat: 19.4326, lng: -99.1332 }, // Default: CDMX (not 0,0 Gulf of Guinea)
      accessorName,
      nearestHospital,
      nearbyHospitals,
    });

    // Determinar mensaje de alerta según nivel de confianza
    const trustLevel = credentialInfo?.trustLevel || 'UNVERIFIED';
    const alertMessage = getAlertMessageForTrustLevel(
      trustLevel,
      accessorName,
      credentialInfo?.accessorRole || 'Desconocido'
    );

    // Emitir evento WebSocket a representantes conectados
    const alertData = {
      type: 'QR_ACCESS_ALERT',
      patientName: user.name,
      patientId: userId,
      accessorName,
      accessorRole: credentialInfo?.accessorRole,
      accessorLicense: credentialInfo?.accessorLicense,
      institutionName: credentialInfo?.institutionName,
      trustLevel,
      credentialsVerified: credentialInfo?.credentialsVerified || false,
      alertMessage,
      location: location?.name || 'Ubicación no disponible',
      nearestHospital,
      nearbyHospitals,
      patientConditions,
      timestamp: new Date(),
    };

    getSocketServer().to(`representative-${userId}`).emit('qr-access-alert', alertData);
    getSocketServer().to(`user-${userId}`).emit('qr-access-notification', alertData);

    // Log estructurado del acceso de emergencia
    logger.info('Notificación de acceso QR enviada', {
      trustLevel,
      patientName: user.name,
      patientConditions,
      accessorName,
      accessorRole: credentialInfo?.accessorRole || 'Rol desconocido',
      accessorLicense: credentialInfo?.accessorLicense || null,
      institutionName: credentialInfo?.institutionName || null,
      nearestHospital: nearestHospital || null,
      representativesNotified: notificationResults.length,
      notificationResults: notificationResults.map(r => ({
        name: r.name,
        smsStatus: r.smsStatus,
        emailStatus: r.emailStatus,
      })),
    });
  }
}

export const emergencyService = new EmergencyService();
export default emergencyService;
