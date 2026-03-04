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

// Returned when the user has MFA enabled — a short-lived token to complete MFA
export interface MFAChallenge {
  requiresMFA: true;
  mfaToken: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  pendingMFA: MFAChallenge | null;
  login: (data: LoginForm) => Promise<void | MFAChallenge>;
  loginWithTokens: (user: User, tokens: AuthTokens) => void;
  completeMFA: (challenge: MFAChallenge, verifiedUser: User) => void;
  clearMFA: () => void;
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
  const [pendingMFA, setPendingMFA] = useState<MFAChallenge | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const response = await authApi.getMe();
      if (response.success && response.data) {
        setUser(response.data.user);
        syncLanguageFromUser(response.data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (data: LoginForm): Promise<void | MFAChallenge> => {
    const response = await authApi.login(data);
    if (response.success && response.data) {
      // Check if server requires MFA
      const responseData = response.data as any;
      if (responseData.requiresMFA && responseData.mfaToken) {
        const challenge: MFAChallenge = {
          requiresMFA: true,
          mfaToken: responseData.mfaToken,
        };
        setPendingMFA(challenge);
        return challenge;
      }
      // Normal login — tokens set as httpOnly cookies by server
      setUser(response.data.user);
      syncLanguageFromUser(response.data.user);
    } else {
      throw new Error(response.error?.message || t('toast.loginError', { ns: 'auth' }));
    }
  };

  const loginWithTokens = (user: User, _tokens: AuthTokens) => {
    // Tokens are set as httpOnly cookies by the server
    setUser(user);
    syncLanguageFromUser(user);
  };

  /** Called after successful MFA verification to finalise the auth session. */
  const completeMFA = (_challenge: MFAChallenge, verifiedUser: User) => {
    setPendingMFA(null);
    setUser(verifiedUser);
    syncLanguageFromUser(verifiedUser);
  };

  const clearMFA = () => {
    setPendingMFA(null);
  };

  const register = async (data: Omit<RegisterForm, 'confirmPassword' | 'acceptTerms'>) => {
    const response = await authApi.register(data);
    if (response.success && response.data) {
      // Tokens are set as httpOnly cookies by the server
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
      // Tokens cleared as httpOnly cookies by the server
      setUser(null);
      setPendingMFA(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        pendingMFA,
        login,
        loginWithTokens,
        completeMFA,
        clearMFA,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
