// src/services/api.ts
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { 
  ApiResponse, 
  User, 
  AuthTokens, 
  PatientProfile, 
  AdvanceDirective, 
  Representative,
  EmergencyData,
  EmergencyAccess,
  LoginForm,
  RegisterForm,
  DirectiveDraft,
  CreateRepresentativeInput,
  ProfileForm,
} from '../types';

//const API_URL = import.meta.env.VITE_API_URL || '/api/v1';
const API_URL = import.meta.env.VITE_API_URL;

// Crear instancia de Axios
const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send httpOnly cookies with requests
});

// Interceptor para manejar errores y refresh token
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Si es 401 y no es un retry, intentar refresh via httpOnly cookie
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Refresh token is sent automatically via httpOnly cookie (withCredentials)
        // New access token is set as httpOnly cookie by the server
        await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });

        return api(originalRequest);
      } catch (refreshError) {
        // Refresh falló, redirigir a login
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// ==================== Admin Auth API ====================
export const adminApi = {
  async login(email: string, password: string): Promise<ApiResponse<{ admin: any; accessToken: string; refreshToken: string }>> {
    const response = await api.post('/admin/auth/login', { email, password });
    return response.data;
  },
};

// ==================== Auth API ====================
export const authApi = {
  async register(data: Omit<RegisterForm, 'confirmPassword' | 'acceptTerms'>): Promise<ApiResponse<{ user: User; tokens: AuthTokens }>> {
    const response = await api.post('/auth/register', data);
    return response.data;
  },
  
  async login(data: LoginForm): Promise<ApiResponse<{ user: User; tokens: AuthTokens }>> {
    const response = await api.post('/auth/login', data);
    return response.data;
  },
  
  async logout(): Promise<void> {
    // Refresh token is sent via httpOnly cookie automatically
    await api.post('/auth/logout', {});
  },
  
  async getMe(): Promise<ApiResponse<{ user: User }>> {
    const response = await api.get('/auth/me');
    return response.data;
  },
  
  async verifyEmail(token: string): Promise<ApiResponse<void>> {
    const response = await api.post('/auth/verify-email', { token });
    return response.data;
  },
  
  async forgotPassword(email: string): Promise<ApiResponse<void>> {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },
  
  async resetPassword(token: string, password: string): Promise<ApiResponse<void>> {
    const response = await api.post('/auth/reset-password', { token, password });
    return response.data;
  },
};

// ==================== MFA API ====================
export const mfaApi = {
  async setup(): Promise<ApiResponse<{ qrCode: string; secret: string; otpauthUri: string }>> {
    const response = await api.post('/auth/mfa/setup');
    return response.data;
  },

  async verifySetup(token: string): Promise<ApiResponse<void>> {
    const response = await api.post('/auth/mfa/verify-setup', { token });
    return response.data;
  },

  async verify(token: string, mfaToken: string): Promise<ApiResponse<{ user: User; tokens: AuthTokens }>> {
    const response = await api.post(
      '/auth/mfa/verify',
      { token },
      { headers: { Authorization: `Bearer ${mfaToken}` } }
    );
    return response.data;
  },

  async disable(token: string): Promise<ApiResponse<void>> {
    const response = await api.post('/auth/mfa/disable', { token });
    return response.data;
  },
};

// ==================== Profile API ====================
export const profileApi = {
  async getProfile(): Promise<ApiResponse<{ profile: PatientProfile }>> {
    const response = await api.get('/profile');
    return response.data;
  },
  
  async updateProfile(data: ProfileForm): Promise<ApiResponse<{ profile: PatientProfile }>> {
    const response = await api.put('/profile', data);
    return response.data;
  },
  
  async updatePhoto(photoUrl: string): Promise<ApiResponse<{ profile: PatientProfile }>> {
    const response = await api.post('/profile/photo', { photoUrl });
    return response.data;
  },
  
  async getQR(): Promise<ApiResponse<{ qrToken: string; qrDataUrl: string; generatedAt: string }>> {
    const response = await api.get('/profile/qr');
    return response.data;
  },
  
  async regenerateQR(): Promise<ApiResponse<{ qrToken: string; qrDataUrl: string }>> {
    const response = await api.post('/profile/qr/regenerate');
    return response.data;
  },
};

// ==================== Directives API ====================
export const directivesApi = {
  async list(): Promise<ApiResponse<{ directives: AdvanceDirective[] }>> {
    const response = await api.get('/directives');
    return response.data;
  },
  
  async getActive(): Promise<ApiResponse<{ hasActiveDirective: boolean; directive: AdvanceDirective | null }>> {
    const response = await api.get('/directives/active');
    return response.data;
  },
  
  async get(id: string): Promise<ApiResponse<{ directive: AdvanceDirective }>> {
    const response = await api.get(`/directives/${id}`);
    return response.data;
  },
  
  async createDraft(data: DirectiveDraft): Promise<ApiResponse<{ directive: AdvanceDirective }>> {
    const response = await api.post('/directives/draft', data);
    return response.data;
  },
  
  async uploadDocument(documentUrl: string, originalFileName: string, originState?: string): Promise<ApiResponse<{ directive: AdvanceDirective }>> {
    const response = await api.post('/directives/upload', { documentUrl, originalFileName, originState });
    return response.data;
  },
  
  async update(id: string, data: DirectiveDraft): Promise<ApiResponse<{ directive: AdvanceDirective }>> {
    const response = await api.put(`/directives/${id}`, data);
    return response.data;
  },
  
  async validate(id: string, method: 'EMAIL' | 'SMS'): Promise<ApiResponse<{ directive: AdvanceDirective }>> {
    const response = await api.post(`/directives/${id}/validate`, { method });
    return response.data;
  },
  
  async requestSeal(id: string): Promise<ApiResponse<{ directive: AdvanceDirective }>> {
    const response = await api.post(`/directives/${id}/seal`);
    return response.data;
  },
  
  async revoke(id: string): Promise<ApiResponse<{ directive: AdvanceDirective }>> {
    const response = await api.post(`/directives/${id}/revoke`);
    return response.data;
  },
  
  async delete(id: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/directives/${id}`);
    return response.data;
  },
};

// ==================== Representatives API ====================
export const representativesApi = {
  async list(): Promise<ApiResponse<{ representatives: Representative[] }>> {
    const response = await api.get('/representatives');
    return response.data;
  },
  
  async get(id: string): Promise<ApiResponse<{ representative: Representative }>> {
    const response = await api.get(`/representatives/${id}`);
    return response.data;
  },
  
  async create(data: CreateRepresentativeInput): Promise<ApiResponse<{ representative: Representative }>> {
    const response = await api.post('/representatives', data);
    return response.data;
  },
  
  async update(id: string, data: Partial<CreateRepresentativeInput>): Promise<ApiResponse<{ representative: Representative }>> {
    const response = await api.put(`/representatives/${id}`, data);
    return response.data;
  },
  
  async delete(id: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/representatives/${id}`);
    return response.data;
  },
  
  async reorder(orderedIds: string[]): Promise<ApiResponse<{ representatives: Representative[] }>> {
    const response = await api.post('/representatives/reorder', { orderedIds });
    return response.data;
  },
  
  async setDonorSpokesperson(id: string): Promise<ApiResponse<{ representative: Representative }>> {
    const response = await api.post(`/representatives/${id}/donor-spokesperson`);
    return response.data;
  },
};

// ==================== Emergency API ====================
export const emergencyApi = {
  async initiateAccess(data: {
    qrToken: string;
    accessorName: string;
    accessorRole: string;
    accessorLicense?: string;
    institutionName?: string;
    latitude?: number;
    longitude?: number;
    locationName?: string;
  }): Promise<ApiResponse<EmergencyData>> {
    const response = await api.post('/emergency/access', data);
    return response.data;
  },

  async verifyToken(accessToken: string): Promise<ApiResponse<{ valid: boolean; expiresAt: string }>> {
    const response = await api.get(`/emergency/verify/${accessToken}`);
    return response.data;
  },

  async getHistory(): Promise<ApiResponse<{ accesses: EmergencyAccess[] }>> {
    const response = await api.get('/emergency/history');
    return response.data;
  },
};

// ==================== Panic API ====================
export const panicApi = {
  async activate(data: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    message?: string;
  }): Promise<ApiResponse<{
    alertId: string;
    status: string;
    nearbyHospitals: HospitalWithDistance[];
    representativesNotified: Array<{
      name: string;
      phone: string;
      smsStatus: 'sent' | 'failed' | 'skipped';
      emailStatus: 'sent' | 'failed' | 'skipped';
    }>;
    createdAt: string;
  }>> {
    const response = await api.post('/emergency/panic', data);
    return response.data;
  },

  async cancel(alertId: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/emergency/panic/${alertId}`);
    return response.data;
  },

  async getActive(): Promise<ApiResponse<{ alerts: any[]; count: number }>> {
    const response = await api.get('/emergency/panic/active');
    return response.data;
  },

  async getHistory(limit = 10): Promise<ApiResponse<{ alerts: any[]; count: number }>> {
    const response = await api.get(`/emergency/panic/history?limit=${limit}`);
    return response.data;
  },
};

// ==================== Hospitals API ====================
export interface HospitalWithDistance {
  id: string;
  name: string;
  type: string;
  cluesCode?: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  emergencyPhone?: string;
  latitude?: number;
  longitude?: number;
  attentionLevel?: 'FIRST' | 'SECOND' | 'THIRD';
  specialties?: string[];
  hasEmergency?: boolean;
  has24Hours?: boolean;
  hasICU?: boolean;
  hasTrauma?: boolean;
  distance: number;
  matchScore?: number;
  matchedSpecialties?: string[];
}

export const hospitalsApi = {
  async getNearby(params: {
    lat: number;
    lng: number;
    radius?: number;
    limit?: number;
    type?: string;
    level?: 'FIRST' | 'SECOND' | 'THIRD';
    emergency?: boolean;
    h24?: boolean;
    icu?: boolean;
    trauma?: boolean;
  }): Promise<ApiResponse<{ hospitals: HospitalWithDistance[] }>> {
    const queryParams = new URLSearchParams({
      lat: params.lat.toString(),
      lng: params.lng.toString(),
    });
    if (params.radius) queryParams.append('radius', params.radius.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.type) queryParams.append('type', params.type);
    if (params.level) queryParams.append('level', params.level);
    if (params.emergency) queryParams.append('emergency', 'true');
    if (params.h24) queryParams.append('h24', 'true');
    if (params.icu) queryParams.append('icu', 'true');
    if (params.trauma) queryParams.append('trauma', 'true');

    const response = await api.get(`/hospitals/nearby?${queryParams}`);
    return response.data;
  },

  async getNearbySmart(params: {
    latitude: number;
    longitude: number;
    conditions: string[];
    radiusKm?: number;
    limit?: number;
    prioritizeByCondition?: boolean;
  }): Promise<ApiResponse<{
    hospitals: HospitalWithDistance[];
    analysis: {
      patientConditions: string[];
      requiredSpecialties: string[];
      totalFound: number;
    };
  }>> {
    const response = await api.post('/hospitals/nearby/smart', params);
    return response.data;
  },

  async getConditions(): Promise<ApiResponse<{ conditions: string[]; total: number }>> {
    const response = await api.get('/hospitals/conditions');
    return response.data;
  },

  async getById(id: string): Promise<ApiResponse<{ hospital: HospitalWithDistance }>> {
    const response = await api.get(`/hospitals/${id}`);
    return response.data;
  },

  async list(params?: { state?: string; city?: string; type?: string }): Promise<ApiResponse<{ hospitals: HospitalWithDistance[] }>> {
    const queryParams = new URLSearchParams();
    if (params?.state) queryParams.append('state', params.state);
    if (params?.city) queryParams.append('city', params.city);
    if (params?.type) queryParams.append('type', params.type);
    const response = await api.get(`/hospitals?${queryParams}`);
    return response.data;
  },
};

// ==================== Insurance API ====================
export interface InsuranceOption {
  id: string;
  name: string;
  shortName: string | null;
  type: 'HEALTH' | 'HEALTH_LIFE' | 'ACCIDENT' | 'LIFE' | 'GOVERNMENT' | 'OTHER';
  hasNationalCoverage: boolean;
  emergencyPhone: string | null;
}

export interface NetworkHospital {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  emergencyPhone: string | null;
  latitude: number | null;
  longitude: number | null;
  attentionLevel: 'FIRST' | 'SECOND' | 'THIRD';
  hasEmergency: boolean;
  has24Hours: boolean;
}

// ==================== WebAuthn API ====================
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/types';

export interface WebAuthnCredential {
  id: string;
  deviceName: string | null;
  deviceType: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export const webauthnApi = {
  /**
   * Verifica si un usuario tiene credenciales biométricas registradas
   */
  async checkBiometric(email: string): Promise<ApiResponse<{ hasBiometricCredentials: boolean }>> {
    const response = await api.get(`/auth/webauthn/check/${encodeURIComponent(email)}`);
    return response.data;
  },

  /**
   * Genera opciones para registrar una nueva credencial biométrica
   * Requiere autenticación
   */
  async getRegistrationOptions(): Promise<ApiResponse<PublicKeyCredentialCreationOptionsJSON>> {
    const response = await api.post('/auth/webauthn/register/options');
    return response.data;
  },

  /**
   * Verifica y guarda una nueva credencial biométrica
   */
  async verifyRegistration(credential: RegistrationResponseJSON, deviceName?: string): Promise<ApiResponse<{ success: boolean; credentialId: string }>> {
    const response = await api.post('/auth/webauthn/register/verify', { credential, deviceName });
    return response.data;
  },

  /**
   * Genera opciones para autenticación biométrica
   */
  async getAuthenticationOptions(email: string): Promise<ApiResponse<{ options: PublicKeyCredentialRequestOptionsJSON; userId: string }>> {
    const response = await api.post('/auth/webauthn/login/options', { email });
    return response.data;
  },

  /**
   * Verifica la autenticación biométrica
   */
  async verifyAuthentication(userId: string, credential: AuthenticationResponseJSON): Promise<ApiResponse<{ user: User; accessToken: string; refreshToken: string }>> {
    const response = await api.post('/auth/webauthn/login/verify', { userId, credential });
    return response.data;
  },

  /**
   * Lista las credenciales biométricas del usuario
   */
  async listCredentials(): Promise<ApiResponse<WebAuthnCredential[]>> {
    const response = await api.get('/auth/webauthn/credentials');
    return response.data;
  },

  /**
   * Elimina una credencial biométrica
   */
  async deleteCredential(id: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/auth/webauthn/credentials/${id}`);
    return response.data;
  },
};

// ==================== Insurance API ====================
export const insuranceApi = {
  /**
   * Obtiene lista de aseguradoras para selector
   */
  async getOptions(): Promise<ApiResponse<{
    insurances: InsuranceOption[];
    grouped: {
      HEALTH: InsuranceOption[];
      HEALTH_LIFE: InsuranceOption[];
      ACCIDENT: InsuranceOption[];
      OTHER: InsuranceOption[];
    };
    total: number;
  }>> {
    const response = await api.get('/insurance/options');
    return response.data;
  },

  /**
   * Obtiene hospitales en red de una aseguradora
   */
  async getNetwork(shortName: string): Promise<ApiResponse<{
    insurance: {
      id: string;
      name: string;
      shortName: string;
      emergencyPhone: string | null;
    };
    hospitals: NetworkHospital[];
    totalHospitals: number;
  }>> {
    const response = await api.get(`/insurance/${encodeURIComponent(shortName)}/network`);
    return response.data;
  },

  /**
   * Obtiene detalles de una aseguradora
   */
  async getDetail(shortName: string): Promise<ApiResponse<{
    insurance: InsuranceOption & {
      plans: Array<{
        id: string;
        name: string;
        code: string;
        sumAssured: number;
        deductible: number;
        coinsurance: number;
        features: string[];
        hospitalLevel: string;
      }>;
      networkHospitals: Array<{
        id: string;
        name: string;
        city: string;
        state: string;
      }>;
    };
  }>> {
    const response = await api.get(`/insurance/${encodeURIComponent(shortName)}`);
    return response.data;
  },
};

// ==================== Payments & Subscription API ====================

export interface PlanFeatures {
  advanceDirectives: boolean;
  donorPreferences: boolean;
  nom151Seal: boolean;
  smsNotifications: boolean;
  exportData: boolean;
  prioritySupport: boolean;
}

export interface PlanLimits {
  representativesLimit: number;
  qrDownloadsPerMonth: number;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: number | null;
  priceAnnual: number | null;
  currency: string;
  features: PlanFeatures;
  limits: PlanLimits;
  trialDays: number;
  isDefault: boolean;
  displayOrder: number;
}

export interface Subscription {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  status: 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'UNPAID' | 'INCOMPLETE' | 'PAUSED';
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  createdAt: string;
}

export interface PremiumStatus {
  isPremium: boolean;
  planName: string;
  planSlug: string;
  status: Subscription['status'] | null;
  features: PlanFeatures;
  limits: PlanLimits;
  inTrial: boolean;
  trialDaysLeft: number;
  expiresAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface Payment {
  id: string;
  userId: string;
  subscriptionId: string | null;
  amount: number;
  currency: string;
  paymentMethod: 'CARD' | 'OXXO';
  last4: string | null;
  cardBrand: string | null;
  oxxoVoucherUrl: string | null;
  oxxoExpiresAt: string | null;
  status: 'PENDING' | 'PROCESSING' | 'REQUIRES_ACTION' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'REFUNDED';
  description: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface PaymentMethod {
  id: string;
  stripePaymentMethodId: string;
  type: 'CARD' | 'OXXO';
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
  cardholderName: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface FiscalData {
  id: string;
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  usoCFDI: string;
  codigoPostal: string;
  calle: string | null;
  numExterior: string | null;
  numInterior: string | null;
  colonia: string | null;
  municipio: string | null;
  estado: string | null;
  emailFacturacion: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  paymentId: string;
  uuid: string | null;
  serie: string | null;
  folio: string | null;
  subtotal: number;
  iva: number;
  total: number;
  xmlUrl: string | null;
  pdfUrl: string | null;
  status: 'PENDING' | 'ISSUED' | 'SENT' | 'CANCELLED' | 'ERROR';
  issuedAt: string | null;
  createdAt: string;
}

export const paymentsApi = {
  // ==================== Planes ====================
  async getPlans(): Promise<ApiResponse<SubscriptionPlan[]>> {
    const response = await api.get('/payments/plans');
    return response.data;
  },

  // ==================== Suscripción ====================
  async getSubscription(): Promise<ApiResponse<Subscription | null>> {
    const response = await api.get('/payments/subscription');
    return response.data;
  },

  async getPremiumStatus(): Promise<ApiResponse<PremiumStatus>> {
    const response = await api.get('/payments/premium-status');
    return response.data;
  },

  async upgradeSubscription(planId: string, billingCycle: 'MONTHLY' | 'ANNUAL' = 'MONTHLY'): Promise<ApiResponse<{ sessionId: string; url: string }>> {
    const response = await api.post('/payments/subscription/upgrade', { planId, billingCycle });
    return response.data;
  },

  async cancelSubscription(reason?: string, immediately?: boolean): Promise<ApiResponse<Subscription>> {
    const response = await api.post('/payments/subscription/cancel', { reason, immediately });
    return response.data;
  },

  async reactivateSubscription(): Promise<ApiResponse<Subscription>> {
    const response = await api.post('/payments/subscription/reactivate');
    return response.data;
  },

  async getBillingPortalUrl(): Promise<ApiResponse<{ url: string }>> {
    const response = await api.post('/payments/billing-portal');
    return response.data;
  },

  // ==================== Métodos de pago ====================
  async getPaymentMethods(): Promise<ApiResponse<PaymentMethod[]>> {
    const response = await api.get('/payments/payment-methods');
    return response.data;
  },

  async savePaymentMethod(stripePaymentMethodId: string, setAsDefault?: boolean): Promise<ApiResponse<PaymentMethod>> {
    const response = await api.post('/payments/payment-methods', { stripePaymentMethodId, setAsDefault });
    return response.data;
  },

  async deletePaymentMethod(id: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/payments/payment-methods/${id}`);
    return response.data;
  },

  async setDefaultPaymentMethod(id: string): Promise<ApiResponse<void>> {
    const response = await api.post(`/payments/payment-methods/${id}/default`);
    return response.data;
  },

  // ==================== Historial de pagos ====================
  async getPaymentHistory(limit?: number, offset?: number): Promise<ApiResponse<{ data: Payment[]; pagination: { total: number } }>> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    const response = await api.get(`/payments/history?${params}`);
    return response.data;
  },

  // ==================== Datos fiscales ====================
  async getFiscalData(): Promise<ApiResponse<FiscalData | null>> {
    const response = await api.get('/payments/fiscal-data');
    return response.data;
  },

  async saveFiscalData(data: Omit<FiscalData, 'id' | 'createdAt'>): Promise<ApiResponse<FiscalData>> {
    const response = await api.post('/payments/fiscal-data', data);
    return response.data;
  },

  // ==================== Facturas ====================
  async getInvoices(limit?: number, offset?: number): Promise<ApiResponse<{ data: Invoice[]; pagination: { total: number } }>> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    const response = await api.get(`/payments/invoices?${params}`);
    return response.data;
  },

  async generateInvoice(paymentId: string): Promise<ApiResponse<Invoice>> {
    const response = await api.post('/payments/invoices/generate', { paymentId });
    return response.data;
  },

  async resendInvoice(id: string): Promise<ApiResponse<void>> {
    const response = await api.post(`/payments/invoices/${id}/resend`);
    return response.data;
  },

  // ==================== Verificación de features ====================
  async checkFeature(feature: keyof PlanFeatures): Promise<ApiResponse<{ feature: string; hasAccess: boolean }>> {
    const response = await api.get(`/payments/check-feature/${feature}`);
    return response.data;
  },

  async checkLimit(limit: keyof PlanLimits): Promise<ApiResponse<{ limit: string; value: number; isUnlimited: boolean }>> {
    const response = await api.get(`/payments/check-limit/${limit}`);
    return response.data;
  },
};

// ==================== Documents API ====================
export interface MedicalDocument {
  id: string;
  title: string;
  description: string | null;
  category: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  documentDate: string | null;
  doctorName: string | null;
  institution: string | null;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentCategory {
  value: string;
  label: string;
}

export const documentsApi = {
  async list(filters?: { category?: string; search?: string }): Promise<ApiResponse<{ documents: MedicalDocument[]; categories: Record<string, string> }>> {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.search) params.append('search', filters.search);
    const response = await api.get(`/documents?${params}`);
    return response.data;
  },

  async get(id: string): Promise<ApiResponse<{ document: MedicalDocument }>> {
    const response = await api.get(`/documents/${id}`);
    return response.data;
  },

  async getCategories(): Promise<ApiResponse<{ categories: DocumentCategory[] }>> {
    const response = await api.get('/documents/categories');
    return response.data;
  },

  async getStats(): Promise<ApiResponse<{ stats: { total: number; byCategory: Record<string, number>; totalSize: number } }>> {
    const response = await api.get('/documents/stats');
    return response.data;
  },

  async getDownloadUrl(id: string): Promise<ApiResponse<{ downloadUrl: string }>> {
    const response = await api.get(`/documents/${id}/download`);
    return response.data;
  },

  async upload(file: File, data: {
    title: string;
    category: string;
    description?: string;
    documentDate?: string;
    doctorName?: string;
    institution?: string;
    isVisible?: boolean;
  }): Promise<ApiResponse<{ document: MedicalDocument }>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', data.title);
    formData.append('category', data.category);
    if (data.description) formData.append('description', data.description);
    if (data.documentDate) formData.append('documentDate', data.documentDate);
    if (data.doctorName) formData.append('doctorName', data.doctorName);
    if (data.institution) formData.append('institution', data.institution);
    if (data.isVisible !== undefined) formData.append('isVisible', String(data.isVisible));

    const response = await api.post('/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async update(id: string, data: Partial<{
    title: string;
    category: string;
    description: string;
    documentDate: string;
    doctorName: string;
    institution: string;
    isVisible: boolean;
  }>): Promise<ApiResponse<{ document: MedicalDocument }>> {
    const response = await api.put(`/documents/${id}`, data);
    return response.data;
  },

  async delete(id: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/documents/${id}`);
    return response.data;
  },
};

export default api;
