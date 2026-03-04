// src/hooks/usePremium.ts
import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import i18next from 'i18next';
import { paymentsApi, PremiumStatus, PlanFeatures, PlanLimits } from '../services/api';

interface PremiumContextType {
  status: PremiumStatus | null;
  loading: boolean;
  error: string | null;
  isPremium: boolean;
  isInTrial: boolean;
  hasFeature: (feature: keyof PlanFeatures) => boolean;
  getLimit: (limit: keyof PlanLimits) => number;
  canCreateMore: (limit: keyof PlanLimits, currentCount: number) => boolean;
  refresh: () => Promise<void>;
}

const defaultStatus: PremiumStatus = {
  isPremium: false,
  planName: i18next.t('subscription:plan.defaultName'),
  planSlug: 'basico',
  status: null,
  features: {
    advanceDirectives: false,
    donorPreferences: false,
    nom151Seal: false,
    smsNotifications: false,
    exportData: false,
    prioritySupport: false,
  },
  limits: {
    representativesLimit: 2,
    qrDownloadsPerMonth: 3,
  },
  inTrial: false,
  trialDaysLeft: 0,
  expiresAt: null,
  cancelAtPeriodEnd: false,
};

const PremiumContext = createContext<PremiumContextType | null>(null);

export function PremiumProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PremiumStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await paymentsApi.getPremiumStatus();
      if (response.success && response.data) {
        setStatus(response.data);
      } else {
        setStatus(defaultStatus);
      }
    } catch (err) {
      console.error('Error fetching premium status:', err);
      setStatus(defaultStatus);
      setError(i18next.t('subscription:errors.loadPremiumStatus'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const isPremium = status?.isPremium ?? false;
  const isInTrial = status?.inTrial ?? false;

  const hasFeature = useCallback(
    (feature: keyof PlanFeatures): boolean => {
      return status?.features[feature] ?? false;
    },
    [status]
  );

  const getLimit = useCallback(
    (limit: keyof PlanLimits): number => {
      return status?.limits[limit] ?? 0;
    },
    [status]
  );

  const canCreateMore = useCallback(
    (limit: keyof PlanLimits, currentCount: number): boolean => {
      const limitValue = status?.limits[limit] ?? 0;
      // 0 o -1 significa ilimitado
      if (limitValue === 0 || limitValue === -1) return true;
      return currentCount < limitValue;
    },
    [status]
  );

  const value: PremiumContextType = {
    status,
    loading,
    error,
    isPremium,
    isInTrial,
    hasFeature,
    getLimit,
    canCreateMore,
    refresh: fetchStatus,
  };

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium(): PremiumContextType {
  const context = useContext(PremiumContext);
  if (!context) {
    throw new Error('usePremium must be used within a PremiumProvider');
  }
  return context;
}

// Hook independiente para verificar una feature específica
export function useHasFeature(feature: keyof PlanFeatures): {
  hasAccess: boolean;
  loading: boolean;
} {
  const { hasFeature, loading } = usePremium();
  return {
    hasAccess: hasFeature(feature),
    loading,
  };
}

// Hook independiente para verificar un límite
export function useResourceLimit(limit: keyof PlanLimits): {
  limit: number;
  isUnlimited: boolean;
  canCreate: (currentCount: number) => boolean;
  loading: boolean;
} {
  const { getLimit, canCreateMore, loading } = usePremium();
  const limitValue = getLimit(limit);

  return {
    limit: limitValue,
    isUnlimited: limitValue === 0 || limitValue === -1,
    canCreate: (currentCount: number) => canCreateMore(limit, currentCount),
    loading,
  };
}
