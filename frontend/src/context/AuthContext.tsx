// src/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/api';
import type { User, LoginForm, RegisterForm } from '../types';
import i18n from '../i18n/config';
import { t } from 'i18next';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginForm) => Promise<void>;
  loginWithTokens: (user: User, tokens: AuthTokens) => void;
  register: (data: Omit<RegisterForm, 'confirmPassword' | 'acceptTerms'>) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
};

// Sync i18n language from user's stored preference
const syncLanguageFromUser = (user: User) => {
  if (user.preferredLanguage) {
    i18n.changeLanguage(user.preferredLanguage);
    localStorage.setItem('vida-lang', user.preferredLanguage);
    document.documentElement.lang = user.preferredLanguage;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const response = await authApi.getMe();
      if (response.success && response.data) {
        setUser(response.data.user);
        syncLanguageFromUser(response.data.user);
      } else {
        setUser(null);
        localStorage.removeItem('accessToken');
        // refreshToken now managed via httpOnly cookie
      }
    } catch (error) {
      setUser(null);
      localStorage.removeItem('accessToken');
      // refreshToken now managed via httpOnly cookie
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (data: LoginForm) => {
    const response = await authApi.login(data);
    if (response.success && response.data) {
      localStorage.setItem('accessToken', response.data.tokens.accessToken);
      // refreshToken set as httpOnly cookie by server
      setUser(response.data.user);
      syncLanguageFromUser(response.data.user);
    } else {
      throw new Error(response.error?.message || t('toast.loginError', { ns: 'auth' }));
    }
  };

  const loginWithTokens = (user: User, tokens: AuthTokens) => {
    localStorage.setItem('accessToken', tokens.accessToken);
    // refreshToken set as httpOnly cookie by server
    setUser(user);
    syncLanguageFromUser(user);
  };

  const register = async (data: Omit<RegisterForm, 'confirmPassword' | 'acceptTerms'>) => {
    const response = await authApi.register(data);
    if (response.success && response.data) {
      localStorage.setItem('accessToken', response.data.tokens.accessToken);
      // refreshToken set as httpOnly cookie by server
      setUser(response.data.user);
    } else {
      throw new Error(response.error?.message || t('toast.registerError', { ns: 'auth' }));
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      // Ignorar errores de logout
    } finally {
      localStorage.removeItem('accessToken');
      // refreshToken now managed via httpOnly cookie
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        loginWithTokens,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
