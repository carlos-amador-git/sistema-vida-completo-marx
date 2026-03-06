// src/components/subscription/FeatureGate.tsx
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePremium } from '../../hooks/usePremium';
import { PlanFeatures, PlanLimits } from '../../services/api';

interface FeatureGateProps {
  feature: keyof PlanFeatures;
  children: ReactNode;
  fallback?: ReactNode;
  showUpgradePrompt?: boolean;
}

const featureKeys: Record<keyof PlanFeatures, string> = {
  advanceDirectives: 'features.advanceDirectives',
  donorPreferences: 'features.donorPreferences',
  nom151Seal: 'features.nom151Seal',
  smsNotifications: 'features.smsNotifications',
  exportData: 'features.exportData',
  prioritySupport: 'features.prioritySupport',
};

export function FeatureGate({
  feature,
  children,
  fallback,
  showUpgradePrompt = true,
}: FeatureGateProps) {
  const { t } = useTranslation('subscription');
  const { hasFeature, loading } = usePremium();

  if (loading) {
    return (
      <div className="animate-pulse bg-gray-100 rounded-lg p-4">
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
      </div>
    );
  }

  if (hasFeature(feature)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (!showUpgradePrompt) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-vida-50 to-vida-100 dark:from-vida-950 dark:to-vida-900 border border-vida-200 dark:border-vida-800 rounded-lg p-6 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 bg-vida-100 dark:bg-vida-800 rounded-full mb-4">
        <svg
          className="w-6 h-6 text-vida-600 dark:text-vida-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {t(featureKeys[feature])}
      </h3>
      <p className="text-muted-foreground mb-4">
        {t('gate.premium_only')}
      </p>
      <Link
        to="/subscription/plans"
        className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-vida-700 transition-colors"
      >
        <svg
          className="w-5 h-5 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
          />
        </svg>
        {t('gate.upgrade_premium')}
      </Link>
    </div>
  );
}

// Componente para verificar límites
interface LimitGateProps {
  limit: keyof PlanLimits;
  currentCount: number;
  children: ReactNode;
  fallback?: ReactNode;
  showUpgradePrompt?: boolean;
}

const limitKeys: Record<keyof PlanLimits, string> = {
  representativesLimit: 'limitNames.representativesLimit',
  qrDownloadsPerMonth: 'limitNames.qrDownloadsPerMonth',
};

export function LimitGate({
  limit,
  currentCount,
  children,
  fallback,
  showUpgradePrompt = true,
}: LimitGateProps) {
  const { t } = useTranslation('subscription');
  const { canCreateMore, getLimit, loading } = usePremium();

  if (loading) {
    return (
      <div className="animate-pulse bg-gray-100 rounded-lg p-4">
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
      </div>
    );
  }

  if (canCreateMore(limit, currentCount)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (!showUpgradePrompt) {
    return null;
  }

  const limitValue = getLimit(limit);

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-6 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-100 rounded-full mb-4">
        <svg
          className="w-6 h-6 text-amber-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {t('gate.limit_reached')}
      </h3>
      <p className="text-gray-600 mb-4">
        {t('gate.limit_reached_description', { limit: limitValue, name: t(limitKeys[limit]) })}
        <br />
        {t('gate.upgrade_for_more')}
      </p>
      <Link
        to="/subscription/plans"
        className="inline-flex items-center px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
      >
        <svg
          className="w-5 h-5 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
          />
        </svg>
        {t('gate.view_premium_plans')}
      </Link>
    </div>
  );
}

// Badge para indicar que algo es Premium
interface PremiumBadgeProps {
  className?: string;
}

export function PremiumBadge({ className = '' }: PremiumBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gradient-to-r from-vida-600 to-vida-800 text-white ${className}`}
    >
      <svg
        className="w-3 h-3 mr-1"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      Premium
    </span>
  );
}

// Indicador de límite restante
interface LimitIndicatorProps {
  limit: keyof PlanLimits;
  currentCount: number;
  showUpgradeLink?: boolean;
}

export function LimitIndicator({
  limit,
  currentCount,
  showUpgradeLink = true,
}: LimitIndicatorProps) {
  const { t } = useTranslation('subscription');
  const { getLimit, loading } = usePremium();

  if (loading) {
    return <span className="text-gray-400">...</span>;
  }

  const limitValue = getLimit(limit);
  const isUnlimited = limitValue === 0;
  const remaining = isUnlimited ? Infinity : limitValue - currentCount;
  const percentage = isUnlimited ? 0 : (currentCount / limitValue) * 100;

  if (isUnlimited) {
    return (
      <span className="text-green-600 text-sm font-medium">
        {t('gate.unlimited')}
      </span>
    );
  }

  const colorClass =
    percentage >= 100
      ? 'text-red-600'
      : percentage >= 80
      ? 'text-amber-600'
      : 'text-gray-600';

  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm font-medium ${colorClass}`}>
        {currentCount}/{limitValue}
      </span>
      {remaining <= 0 && showUpgradeLink && (
        <Link
          to="/subscription/plans"
          className="text-xs text-vida-600 hover:text-vida-800 dark:text-vida-400 dark:hover:text-vida-300 underline"
        >
          {t('gate.increase_limit')}
        </Link>
      )}
    </div>
  );
}
