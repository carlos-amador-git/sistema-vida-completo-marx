// src/services/adminApi.ts
import {
  AdminUser,
  AdminLoginResponse,
  DashboardMetrics,
  UserMetrics,
  EmergencyMetrics,
  SystemUser,
  SystemUserDetail,
  Pagination,
  AuditLog,
  AdminAuditLog,
  EmergencyAccess,
  PanicAlert,
  MedicalInstitution,
  SystemHealth,
  AuditStats,
  InstitutionStats,
} from '../types/admin';

//const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
const API_BASE = import.meta.env.VITE_API_URL;

// Tokens are managed exclusively via httpOnly cookies set by the server.
// No localStorage usage for admin tokens.

// Fetch con autenticacion admin
async function adminFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Send httpOnly cookies (access + refresh)
  });

  const data = await response.json();

  if (!response.ok) {
    // Si el token expiro, intentar refresh
    if (response.status === 401 && data.error?.code === 'TOKEN_EXPIRED') {
      const refreshed = await refreshAdminTokens();
      if (refreshed) {
        // Reintentar la solicitud con el nuevo token
        return adminFetch(endpoint, options);
      }
    }
    throw { ...data.error, status: response.status };
  }

  return data.data;
}

// ==================== AUTH ====================

export const adminLogin = async (
  email: string,
  password: string
): Promise<AdminLoginResponse> => {
  const response = await fetch(`${API_BASE}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Allow server to set httpOnly cookies
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw { ...data.error, status: response.status };
  }

  // Server sets access + refresh tokens as httpOnly cookies — no client storage needed
  return data.data as AdminLoginResponse;
};

export const adminLogout = async (): Promise<void> => {
  try {
    // Access + refresh tokens sent via httpOnly cookies automatically; server clears them
    await adminFetch('/admin/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  } catch (error) {
    // Ignorar errores de logout
  }
};

export const refreshAdminTokens = async (): Promise<boolean> => {
  try {
    // Refresh token sent via httpOnly cookie automatically; server sets new access token cookie
    const response = await fetch(`${API_BASE}/admin/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });

    if (response.ok) {
      return true;
    }
  } catch (error) {
    // Ignorar errores
  }

  return false;
};

export const getAdminMe = async (): Promise<AdminUser> => {
  return adminFetch('/admin/auth/me');
};

export const changeAdminPassword = async (
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  await adminFetch('/admin/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
};

// ==================== METRICAS ====================

export const getMetricsOverview = async (): Promise<DashboardMetrics> => {
  return adminFetch('/admin/metrics/overview');
};

export const getUserMetrics = async (
  period: 'day' | 'week' | 'month' | 'year' = 'month'
): Promise<UserMetrics> => {
  return adminFetch(`/admin/metrics/users?period=${period}`);
};

export const getEmergencyMetrics = async (
  period: 'day' | 'week' | 'month' = 'week'
): Promise<EmergencyMetrics> => {
  return adminFetch(`/admin/metrics/emergency?period=${period}`);
};

// ==================== USUARIOS ====================

interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  isVerified?: boolean;
  sortBy?: 'createdAt' | 'name' | 'email' | 'lastLoginAt';
  sortOrder?: 'asc' | 'desc';
}

export const listUsers = async (
  params: ListUsersParams = {}
): Promise<{ users: SystemUser[]; pagination: Pagination }> => {
  const searchParams = new URLSearchParams();

  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.search) searchParams.set('search', params.search);
  if (params.isActive !== undefined) searchParams.set('isActive', params.isActive.toString());
  if (params.isVerified !== undefined) searchParams.set('isVerified', params.isVerified.toString());
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);

  return adminFetch(`/admin/users?${searchParams.toString()}`);
};

export const getUserDetail = async (userId: string): Promise<SystemUserDetail> => {
  return adminFetch(`/admin/users/${userId}`);
};

export const updateUserStatus = async (
  userId: string,
  isActive: boolean,
  reason?: string
): Promise<SystemUser> => {
  return adminFetch(`/admin/users/${userId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ isActive, reason }),
  });
};

export const getUserActivity = async (
  userId: string,
  limit?: number
): Promise<{ userId: string; activity: any[] }> => {
  const params = limit ? `?limit=${limit}` : '';
  return adminFetch(`/admin/users/${userId}/activity${params}`);
};

export const forceUserLogout = async (
  userId: string,
  reason?: string
): Promise<{ userId: string; sessionsDeleted: number }> => {
  return adminFetch(`/admin/users/${userId}/force-logout`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
};

// ==================== AUDITORIA ====================

interface ListAuditLogsParams {
  page?: number;
  limit?: number;
  userId?: string;
  action?: string;
  resource?: string;
  startDate?: string;
  endDate?: string;
  sortOrder?: 'asc' | 'desc';
}

export const listAuditLogs = async (
  params: ListAuditLogsParams = {}
): Promise<{ logs: AuditLog[]; pagination: Pagination }> => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) searchParams.set(key, value.toString());
  });

  return adminFetch(`/admin/audit?${searchParams.toString()}`);
};

export const listAdminAuditLogs = async (
  params: ListAuditLogsParams = {}
): Promise<{ logs: AdminAuditLog[]; pagination: Pagination }> => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) searchParams.set(key, value.toString());
  });

  return adminFetch(`/admin/audit/admin?${searchParams.toString()}`);
};

export const listEmergencyAccesses = async (
  params: {
    page?: number;
    limit?: number;
    patientId?: string;
    institutionId?: string;
    startDate?: string;
    endDate?: string;
  } = {}
): Promise<{ accesses: EmergencyAccess[]; pagination: Pagination }> => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) searchParams.set(key, value.toString());
  });

  return adminFetch(`/admin/audit/emergency?${searchParams.toString()}`);
};

export const listPanicAlerts = async (
  params: {
    page?: number;
    limit?: number;
    userId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  } = {}
): Promise<{ alerts: PanicAlert[]; pagination: Pagination }> => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) searchParams.set(key, value.toString());
  });

  return adminFetch(`/admin/audit/panic-alerts?${searchParams.toString()}`);
};

export const exportAuditLogs = async (
  type: 'user' | 'admin' | 'emergency',
  format: 'csv' | 'json' = 'csv',
  startDate?: string,
  endDate?: string
): Promise<string | any[]> => {
  const searchParams = new URLSearchParams({ type, format });
  if (startDate) searchParams.set('startDate', startDate);
  if (endDate) searchParams.set('endDate', endDate);

  const response = await fetch(`${API_BASE}/admin/audit/export?${searchParams.toString()}`, {
    credentials: 'include', // Access token sent via httpOnly cookie
  });

  if (!response.ok) {
    const data = await response.json();
    throw { ...data.error, status: response.status };
  }

  if (format === 'csv') {
    return response.text();
  }

  const data = await response.json();
  return data.data;
};

export const getAuditStats = async (): Promise<AuditStats> => {
  return adminFetch('/admin/audit/stats');
};

// ==================== INSTITUCIONES ====================

interface ListInstitutionsParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  state?: string;
  isVerified?: boolean;
  hasEmergency?: boolean;
  sortBy?: 'name' | 'createdAt' | 'type';
  sortOrder?: 'asc' | 'desc';
}

export const listInstitutions = async (
  params: ListInstitutionsParams = {}
): Promise<{ institutions: MedicalInstitution[]; pagination: Pagination }> => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) searchParams.set(key, value.toString());
  });

  return adminFetch(`/admin/institutions?${searchParams.toString()}`);
};

export const getInstitutionDetail = async (institutionId: string): Promise<MedicalInstitution> => {
  return adminFetch(`/admin/institutions/${institutionId}`);
};

export const createInstitution = async (
  data: Partial<MedicalInstitution>
): Promise<MedicalInstitution> => {
  return adminFetch('/admin/institutions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const updateInstitution = async (
  institutionId: string,
  data: Partial<MedicalInstitution>
): Promise<MedicalInstitution> => {
  return adminFetch(`/admin/institutions/${institutionId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

export const verifyInstitution = async (
  institutionId: string,
  verified: boolean
): Promise<MedicalInstitution> => {
  return adminFetch(`/admin/institutions/${institutionId}/verify`, {
    method: 'PUT',
    body: JSON.stringify({ verified }),
  });
};

export const getInstitutionStats = async (): Promise<InstitutionStats> => {
  return adminFetch('/admin/institutions/stats');
};

// ==================== ASEGURADORAS ====================

interface ListInsuranceParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  state?: string;
  isVerified?: boolean;
  hasNationalCoverage?: boolean;
  sortBy?: 'name' | 'createdAt' | 'type' | 'networkSize';
  sortOrder?: 'asc' | 'desc';
}

export const listInsurance = async (
  params: ListInsuranceParams = {}
): Promise<{ insurances: any[]; pagination: Pagination }> => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) searchParams.set(key, value.toString());
  });

  return adminFetch(`/admin/insurance?${searchParams.toString()}`);
};

export const getInsuranceDetail = async (insuranceId: string): Promise<any> => {
  return adminFetch(`/admin/insurance/${insuranceId}`);
};

export const createInsurance = async (data: any): Promise<any> => {
  return adminFetch('/admin/insurance', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const updateInsurance = async (
  insuranceId: string,
  data: any
): Promise<any> => {
  return adminFetch(`/admin/insurance/${insuranceId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

export const verifyInsurance = async (
  insuranceId: string,
  verified: boolean
): Promise<any> => {
  return adminFetch(`/admin/insurance/${insuranceId}/verify`, {
    method: 'PUT',
    body: JSON.stringify({ verified }),
  });
};

export const toggleInsuranceStatus = async (
  insuranceId: string,
  isActive: boolean
): Promise<any> => {
  return adminFetch(`/admin/insurance/${insuranceId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ isActive }),
  });
};

export const addInsurancePlan = async (
  insuranceId: string,
  planData: any
): Promise<any> => {
  return adminFetch(`/admin/insurance/${insuranceId}/plans`, {
    method: 'POST',
    body: JSON.stringify(planData),
  });
};

export const updateInsurancePlan = async (
  planId: string,
  data: any
): Promise<any> => {
  return adminFetch(`/admin/insurance/plans/${planId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

export const deleteInsurancePlan = async (planId: string): Promise<any> => {
  return adminFetch(`/admin/insurance/plans/${planId}`, {
    method: 'DELETE',
  });
};

export const addHospitalToNetwork = async (
  insuranceId: string,
  hospitalId: string
): Promise<any> => {
  return adminFetch(`/admin/insurance/${insuranceId}/network/${hospitalId}`, {
    method: 'POST',
  });
};

export const removeHospitalFromNetwork = async (
  insuranceId: string,
  hospitalId: string
): Promise<any> => {
  return adminFetch(`/admin/insurance/${insuranceId}/network/${hospitalId}`, {
    method: 'DELETE',
  });
};

export const getInsuranceStats = async (): Promise<any> => {
  return adminFetch('/admin/insurance/stats');
};

// ==================== SALUD DEL SISTEMA ====================

export const getSystemHealth = async (): Promise<SystemHealth> => {
  return adminFetch('/admin/health');
};

export const getDatabaseHealth = async (): Promise<any> => {
  return adminFetch('/admin/health/database');
};

export const getPerformanceMetrics = async (): Promise<any> => {
  return adminFetch('/admin/health/performance');
};

export const runSystemCleanup = async (dryRun: boolean = true): Promise<any> => {
  return adminFetch('/admin/health/cleanup', {
    method: 'POST',
    body: JSON.stringify({ dryRun }),
  });
};

// ==================== GESTION DE ADMINS ====================

export const listAdmins = async (): Promise<AdminUser[]> => {
  return adminFetch('/admin/auth/admins');
};

export const createAdmin = async (data: {
  email: string;
  password: string;
  name: string;
  role: string;
  permissions?: string[];
  isSuperAdmin?: boolean;
}): Promise<AdminUser> => {
  return adminFetch('/admin/auth/admins', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const updateAdmin = async (
  adminId: string,
  data: {
    name?: string;
    role?: string;
    permissions?: string[];
    isActive?: boolean;
  }
): Promise<AdminUser> => {
  return adminFetch(`/admin/auth/admins/${adminId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

// ==================== SUSCRIPCIONES E INGRESOS ====================

interface SubscriptionStats {
  totalRevenue: number;
  monthlyRevenue: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  cancelledSubscriptions: number;
  conversionRate: number;
  avgRevenuePerUser: number;
  revenueGrowth: number;
}

interface ListSubscriptionsParams {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}

interface ListPaymentsParams {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}

export const getSubscriptionStats = async (): Promise<{ success: boolean; data: SubscriptionStats }> => {
  try {
    const data = await adminFetch<any>('/admin/payments/stats');

    return {
      success: true,
      data: {
        totalRevenue: data?.totalRevenue || 0,
        monthlyRevenue: data?.monthlyRevenue || 0,
        totalSubscriptions: (data?.activeSubscriptions || 0) + (data?.trialSubscriptions || 0) + (data?.cancelledSubscriptions || 0),
        activeSubscriptions: data?.activeSubscriptions || 0,
        trialSubscriptions: data?.trialSubscriptions || 0,
        cancelledSubscriptions: data?.cancelledSubscriptions || 0,
        conversionRate: data?.conversionRate || 0,
        avgRevenuePerUser: data?.averageRevenuePerUser || 0,
        revenueGrowth: 0,
      }
    };
  } catch (error) {
    console.error('Error fetching subscription stats:', error);
    return {
      success: false,
      data: {
        totalRevenue: 0,
        monthlyRevenue: 0,
        totalSubscriptions: 0,
        activeSubscriptions: 0,
        trialSubscriptions: 0,
        cancelledSubscriptions: 0,
        conversionRate: 0,
        avgRevenuePerUser: 0,
        revenueGrowth: 0,
      }
    };
  }
};

export const getSubscriptions = async (
  params: ListSubscriptionsParams = {}
): Promise<{ success: boolean; data: { subscriptions: any[]; totalPages: number } }> => {
  try {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.set(key, value.toString());
    });

    const data = await adminFetch<any>(`/admin/payments/subscriptions?${searchParams.toString()}`);
    // adminFetch returns the data directly (already extracted from response.data)
    const limit = params.limit || 15;
    const subscriptions = Array.isArray(data) ? data : [];

    return {
      success: true,
      data: {
        subscriptions,
        totalPages: Math.ceil(subscriptions.length / limit) || 1,
      }
    };
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return { success: false, data: { subscriptions: [], totalPages: 0 } };
  }
};

export const getPayments = async (
  params: ListPaymentsParams = {}
): Promise<{ success: boolean; data: { payments: any[]; totalPages: number } }> => {
  try {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.set(key, value.toString());
    });

    const data = await adminFetch<any>(`/admin/payments/payments?${searchParams.toString()}`);
    // adminFetch returns the data directly (already extracted from response.data)
    const limit = params.limit || 15;
    const payments = Array.isArray(data) ? data : [];

    return {
      success: true,
      data: {
        payments,
        totalPages: Math.ceil(payments.length / limit) || 1,
      }
    };
  } catch (error) {
    console.error('Error fetching payments:', error);
    return { success: false, data: { payments: [], totalPages: 0 } };
  }
};

export const exportPayments = async (
  format: 'csv' | 'json' = 'csv',
  startDate?: string,
  endDate?: string
): Promise<string | any[]> => {
  const searchParams = new URLSearchParams({ format });
  if (startDate) searchParams.set('startDate', startDate);
  if (endDate) searchParams.set('endDate', endDate);

  const response = await fetch(`${API_BASE}/admin/payments/export?${searchParams.toString()}`, {
    credentials: 'include', // Access token sent via httpOnly cookie
  });

  if (!response.ok) {
    const data = await response.json();
    throw { ...data.error, status: response.status };
  }

  if (format === 'csv') {
    return response.text();
  }

  const data = await response.json();
  return data.data;
};
