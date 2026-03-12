// src/components/subscription/UpgradePrompt.tsx
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../hooks/useLocale';
import { usePremium } from '../../hooks/usePremium';

interface UpgradePromptProps {
  title?: string;
  description?: string;
  features?: string[];
  compact?: boolean;
  className?: string;
}

export function UpgradePrompt({
  title,
  description,
  features,
  compact = false,
  className = '',
}: UpgradePromptProps) {
  const { t } = useTranslation('subscription');
  const { isPremium, isInTrial, status } = usePremium();

  const resolvedTitle = title ?? t('upgrade_prompt.default_title');
  const resolvedDescription = description ?? t('upgrade_prompt.default_description');
  const resolvedFeatures = features ?? [
    t('upgrade_prompt.default_features.directives'),
    t('upgrade_prompt.default_features.donor'),
    t('upgrade_prompt.default_features.nom151'),
    t('upgrade_prompt.default_features.sms'),
    t('upgrade_prompt.default_features.representatives'),
    t('upgrade_prompt.default_features.support'),
  ];

  // No mostrar si ya es premium
  if (isPremium && !isInTrial) {
    return null;
  }

  // Versión compacta
  if (compact) {
    return (
      <div
        className={`bg-gradient-to-r from-vida-600 to-vida-800 rounded-lg p-4 text-white ${className}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <svg
              className="w-8 h-8 mr-3"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <div>
              <p className="font-semibold">{resolvedTitle}</p>
              <p className="text-sm text-vida-200">{resolvedDescription}</p>
            </div>
          </div>
          <Link
            to="/subscription/plans"
            className="px-4 py-2 bg-white text-vida-600 rounded-lg font-medium hover:bg-vida-50 transition-colors whitespace-nowrap"
          >
            {t('upgrade_prompt.btn_see_plans')}
          </Link>
        </div>
      </div>
    );
  }

  // Versión completa
  return (
    <div
      className={`bg-gradient-to-br from-vida-600 via-vida-700 to-vida-800 rounded-2xl p-8 text-white shadow-xl ${className}`}
    >
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="inline-flex items-center px-3 py-1 bg-white/20 rounded-full text-sm font-medium mb-4">
            <svg
              className="w-4 h-4 mr-1"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Premium
          </div>
          <h3 className="text-2xl font-bold mb-2">{resolvedTitle}</h3>
          <p className="text-vida-200">{resolvedDescription}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold">{t('upgrade_prompt.price')}</p>
          <p className="text-vida-200 text-sm">{t('upgrade_prompt.currency')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {resolvedFeatures.map((feature, index) => (
          <div key={index} className="flex items-center text-sm">
            <svg
              className="w-5 h-5 mr-2 text-green-400 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            {feature}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <Link
          to="/subscription/plans"
          className="flex-1 px-6 py-3 bg-white text-vida-600 rounded-xl font-semibold text-center hover:bg-vida-50 transition-colors"
        >
          {t('upgrade_prompt.btn_trial')}
        </Link>
        <Link
          to="/subscription/plans"
          className="px-6 py-3 border border-white/30 rounded-xl font-medium hover:bg-white/10 transition-colors"
        >
          {t('upgrade_prompt.btn_compare')}
        </Link>
      </div>

      {isInTrial && status?.trialDaysLeft && (
        <p className="mt-4 text-center text-vida-200 text-sm">
          {t('upgrade_prompt.trial_days_left', { count: status.trialDaysLeft })}
        </p>
      )}
    </div>
  );
}

// Banner de trial que expira pronto
export function TrialExpiringBanner() {
  const { t } = useTranslation('subscription');
  const { isInTrial, status } = usePremium();

  if (!isInTrial || !status?.trialDaysLeft || status.trialDaysLeft > 3) {
    return null;
  }

  const isLastDay = status.trialDaysLeft <= 1;

  return (
    <div
      className={`${
        isLastDay ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
      } border rounded-lg p-4 mb-4`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <svg
            className={`w-5 h-5 mr-2 ${isLastDay ? 'text-red-500' : 'text-amber-500'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
              clipRule="evenodd"
            />
          </svg>
          <span className={`font-medium ${isLastDay ? 'text-red-800' : 'text-amber-800'}`}>
            {isLastDay
              ? t('trial_banner.expires_today')
              : t('trial_banner.expires_in', { count: status.trialDaysLeft })}
          </span>
        </div>
        <Link
          to="/subscription/plans"
          className={`px-4 py-1.5 ${
            isLastDay
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-amber-600 hover:bg-amber-700'
          } text-white text-sm font-medium rounded-lg transition-colors`}
        >
          {t('trial_banner.subscribe_now')}
        </Link>
      </div>
    </div>
  );
}

// Banner para suscripción que se cancelará
export function CancellingBanner() {
  const { t } = useTranslation('subscription');
  const { status } = usePremium();
  const { formatDate } = useLocale();

  if (!status?.cancelAtPeriodEnd || !status.expiresAt) {
    return null;
  }

  const formattedDate = formatDate(status.expiresAt);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <svg
            className="w-5 h-5 mr-2 text-gray-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-gray-700">
            {t('cancelling_banner.message')} <strong>{formattedDate}</strong>
          </span>
        </div>
        <Link
          to="/subscription"
          className="px-4 py-1.5 bg-vida-600 hover:bg-vida-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {t('cancelling_banner.reactivate')}
        </Link>
      </div>
    </div>
  );
}
