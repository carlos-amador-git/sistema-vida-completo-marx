// src/context/AdminAuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AdminUser } from '../types/admin';
import {
  adminLogin,
  adminLogout,
  getAdminMe,
  refreshAdminTokens,
} from '../services/adminApi';

interface AdminAuthContextType {
  admin: AdminUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (...permissions: string[]) => boolean;
  hasAllPermissions: (...permissions: string[]) => boolean;
  refreshAdmin: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
};

interface AdminAuthProviderProps {
  children: ReactNode;
}

export const AdminAuthProvider: React.FC<AdminAuthProviderProps> = ({ children }) => {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Verificar si hay una sesion activa al cargar — usa cookie httpOnly, sin localStorage
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Attempt to load admin data using the httpOnly access token cookie
        const adminData = await getAdminMe();
        setAdmin(adminData);
      } catch (error) {
        // Access token missing or expired — attempt silent refresh via refresh cookie
        const refreshed = await refreshAdminTokens();
        if (refreshed) {
          try {
            const adminData = await getAdminMe();
            setAdmin(adminData);
          } catch {
            setAdmin(null);
          }
        } else {
          setAdmin(null);
        }
      }

      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const result = await adminLogin(email, password);
    setAdmin(result.admin);
  };

  const logout = async () => {
    await adminLogout();
    setAdmin(null);
  };

  const refreshAdmin = async () => {
    try {
      const adminData = await getAdminMe();
      setAdmin(adminData);
    } catch (error) {
      setAdmin(null);
    }
  };

  const hasPermission = (permission: string): boolean => {
    if (!admin) return false;
    if (admin.isSuperAdmin) return true;
    if (admin.permissions.includes('*')) return true;
    return admin.permissions.includes(permission);
  };

  const hasAnyPermission = (...permissions: string[]): boolean => {
    if (!admin) return false;
    if (admin.isSuperAdmin) return true;
    if (admin.permissions.includes('*')) return true;
    return permissions.some((p) => admin.permissions.includes(p));
  };

  const hasAllPermissions = (...permissions: string[]): boolean => {
    if (!admin) return false;
    if (admin.isSuperAdmin) return true;
    if (admin.permissions.includes('*')) return true;
    return permissions.every((p) => admin.permissions.includes(p));
  };

  const value: AdminAuthContextType = {
    admin,
    isLoading,
    isAuthenticated: !!admin,
    login,
    logout,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    refreshAdmin,
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
};

// Componente de ruta protegida para admin
interface AdminProtectedRouteProps {
  children: ReactNode;
  requiredPermission?: string;
  requiredPermissions?: string[];
  requireAll?: boolean;
}

export const AdminProtectedRoute: React.FC<AdminProtectedRouteProps> = ({
  children,
  requiredPermission,
  requiredPermissions,
  requireAll = false,
}) => {
  const { t } = useTranslation('admin');
  const { isAuthenticated, isLoading, hasPermission, hasAnyPermission, hasAllPermissions } =
    useAdminAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('access.verifying')}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = '/admin/login';
    return null;
  }

  // Verificar permiso unico
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('access.denied_title')}</h2>
          <p className="text-gray-600 mb-4">
            {t('access.denied_message')}
          </p>
          <button
            onClick={() => window.location.href = '/admin/dashboard'}
            className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition"
          >
            {t('access.back_to_dashboard')}
          </button>
        </div>
      </div>
    );
  }

  // Verificar multiples permisos
  if (requiredPermissions && requiredPermissions.length > 0) {
    const hasAccess = requireAll
      ? hasAllPermissions(...requiredPermissions)
      : hasAnyPermission(...requiredPermissions);

    if (!hasAccess) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('access.denied_title')}</h2>
            <p className="text-gray-600 mb-4">
              {t('access.denied_message')}
            </p>
            <button
              onClick={() => window.location.href = '/admin/dashboard'}
              className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition"
            >
              {t('access.back_to_dashboard')}
            </button>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};

export default AdminAuthContext;
