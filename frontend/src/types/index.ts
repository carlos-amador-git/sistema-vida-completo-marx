// src/types/index.ts

// ==================== Usuario ====================
export interface User {
  id: string;
  email: string;
  name: string;
  curp: string;
  phone?: string;
  dateOfBirth?: string;
  sex?: 'H' | 'M';
  isVerified: boolean;
  hasProfile: boolean;
  preferredLanguage?: 'es' | 'en';
  mfaEnabled?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ==================== Perfil del Paciente ====================
export interface PatientProfile {
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

export interface DonorPreferences {
  organs: string[];
  tissues: string[];
  forResearch: boolean;
  restrictions?: string;
}

// ==================== Directivas ====================
export type DirectiveType = 'NOTARIZED_DOCUMENT' | 'DIGITAL_DRAFT' | 'DIGITAL_WITNESSED';
export type DirectiveStatus = 'DRAFT' | 'PENDING_VALIDATION' | 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface AdvanceDirective {
  id: string;
  type: DirectiveType;
  status: DirectiveStatus;
  documentUrl: string | null;
  originalFileName: string | null;
  nom151Sealed: boolean;
  nom151Timestamp: string | null;
  acceptsCPR: boolean | null;
  acceptsIntubation: boolean | null;
  acceptsDialysis: boolean | null;
  acceptsTransfusion: boolean | null;
  acceptsArtificialNutrition: boolean | null;
  palliativeCareOnly: boolean | null;
  additionalNotes: string | null;
  originState: string | null;
  validatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DirectiveDraft {
  acceptsCPR?: boolean | null;
  acceptsIntubation?: boolean | null;
  acceptsDialysis?: boolean | null;
  acceptsTransfusion?: boolean | null;
  acceptsArtificialNutrition?: boolean | null;
  palliativeCareOnly?: boolean;
  additionalNotes?: string;
  originState?: string;
}

// ==================== Representantes ====================
export interface Representative {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  relation: string;
  priority: number;
  isDonorSpokesperson: boolean;
  canMakeMedicalDecisions: boolean;
  notifyOnEmergency: boolean;
  notifyOnAccess: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRepresentativeInput {
  name: string;
  phone: string;
  email?: string;
  relation: string;
  priority?: number;
  isDonorSpokesperson?: boolean;
  canMakeMedicalDecisions?: boolean;
  notifyOnEmergency?: boolean;
  notifyOnAccess?: boolean;
}

// ==================== Emergencia ====================
export interface EmergencyAccess {
  id: string;
  accessorName: string;
  accessorRole: string;
  institutionName: string | null;
  locationName: string | null;
  accessedAt: string;
  dataAccessed: string[];
}

export interface EmergencyDocument {
  id: string;
  title: string;
  category: string;
  fileType: string;
  downloadUrl: string;
  documentDate: string | null;
  institution: string | null;
}

export interface EmergencyData {
  accessToken: string;
  expiresAt: string;
  patient: {
    name: string;
    dateOfBirth: string | null;
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
    palliativeCareOnly: boolean | null;
    additionalNotes: string | null;
    documentUrl: string | null;
    validatedAt: string | null;
    directiveType: string | null;
    legalStatus: 'LEGALLY_BINDING' | 'INFORMATIONAL' | null;
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
  documents?: EmergencyDocument[];
}

// ==================== API Responses ====================
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
  errors?: Array<{
    field: string;
    message: string;
  }>;
  pagination?: {
    total: number;
    limit?: number;
    offset?: number;
  };
}

// ==================== Formularios ====================
export interface LoginForm {
  email: string;
  password: string;
}

export interface RegisterForm {
  email: string;
  password: string;
  confirmPassword: string;
  curp: string;
  name: string;
  phone?: string;
  dateOfBirth?: string;
  sex?: 'H' | 'M';
  acceptTerms: boolean;
}

export interface ProfileForm {
  bloodType?: string;
  allergies?: string[];
  conditions?: string[];
  medications?: string[];
  insuranceProvider?: string;
  insurancePolicy?: string;
  insurancePhone?: string;
  isDonor?: boolean;
  donorPreferences?: DonorPreferences;
  preferredLanguage?: 'es' | 'en';
}
