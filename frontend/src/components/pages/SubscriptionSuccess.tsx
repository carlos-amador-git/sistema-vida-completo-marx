// src/components/pages/SubscriptionSuccess.tsx
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePremium } from '../../hooks/usePremium';

export default function SubscriptionSuccess() {
  const { t } = useTranslation('subscription');
  const { refresh, status } = usePremium();

  useEffect(() => {
    // Refrescar estado premium después de un momento para dar tiempo al webhook
    const timer = setTimeout(() => {
      refresh();
    }, 2000);

    return () => clearTimeout(timer);
  }, [refresh]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Success Icon */}
        <div className="mb-6" aria-hidden="true">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
            <svg
              className="w-10 h-10 text-green-600"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          {t('success.title')}
        </h1>

        {/* Message */}
        <p className="text-gray-600 mb-8">
          {t('success.message')}
        </p>

        {/* Features unlocked */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8 text-left">
          <h3 className="font-semibold text-gray-900 mb-4">{t('success.unlocked_title')}</h3>
          <ul className="space-y-3">
            <li className="flex items-center text-sm text-gray-600">
              <svg className="w-5 h-5 text-green-500 mr-3" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {t('success.feature_directives')}
            </li>
            <li className="flex items-center text-sm text-gray-600">
              <svg className="w-5 h-5 text-green-500 mr-3" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {t('success.feature_donor')}
            </li>
            <li className="flex items-center text-sm text-gray-600">
              <svg className="w-5 h-5 text-green-500 mr-3" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {t('success.feature_nom151')}
            </li>
            <li className="flex items-center text-sm text-gray-600">
              <svg className="w-5 h-5 text-green-500 mr-3" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {t('success.feature_sms')}
            </li>
            <li className="flex items-center text-sm text-gray-600">
              <svg className="w-5 h-5 text-green-500 mr-3" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {t('success.feature_representatives')}
            </li>
            <li className="flex items-center text-sm text-gray-600">
              <svg className="w-5 h-5 text-green-500 mr-3" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {t('success.feature_support')}
            </li>
          </ul>
        </div>

        {/* Trial info */}
        {status?.inTrial && status.trialDaysLeft > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm text-blue-800">
            {t('success.trial_info', { count: status.trialDaysLeft })}
          </div>
        )}

        {/* CTA Buttons */}
        <div className="space-y-3">
          <Link
            to="/dashboard"
            className="block w-full px-6 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-colors"
          >
            {t('success.btn_dashboard')}
          </Link>
          <Link
            to="/directives"
            className="block w-full px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            {t('success.btn_directive')}
          </Link>
        </div>

        {/* Receipt info */}
        <p className="text-sm text-gray-500 mt-6">
          {t('success.receipt_info')}
        </p>
      </div>
    </div>
  );
}
