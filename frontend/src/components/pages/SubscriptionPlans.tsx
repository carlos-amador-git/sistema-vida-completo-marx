// src/components/pages/SubscriptionPlans.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlans, useSubscription } from '../../hooks/useSubscription';
import { usePremium } from '../../hooks/usePremium';
import type { SubscriptionPlan } from '../../services/api';

export default function SubscriptionPlans() {
  const { t } = useTranslation('subscription');
  const { plans, loading: loadingPlans } = usePlans();
  const { subscription, upgrade, upgrading } = useSubscription();
  const { isPremium } = usePremium();
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const handleUpgrade = async (planId: string) => {
    try {
      setSelectedPlan(planId);
      await upgrade(planId, billingCycle);
    } catch (error) {
      console.error('Error al procesar upgrade:', error);
      alert(t('plans.upgrade_error'));
    } finally {
      setSelectedPlan(null);
    }
  };

  const getPrice = (plan: SubscriptionPlan) => {
    if (billingCycle === 'ANNUAL' && plan.priceAnnual) {
      return plan.priceAnnual;
    }
    return plan.priceMonthly;
  };

  const getMonthlyEquivalent = (plan: SubscriptionPlan) => {
    if (billingCycle === 'ANNUAL' && plan.priceAnnual) {
      return Math.round(plan.priceAnnual / 12);
    }
    return plan.priceMonthly;
  };

  const getSavings = (plan: SubscriptionPlan) => {
    if (plan.priceMonthly && plan.priceAnnual) {
      const annualIfMonthly = plan.priceMonthly * 12;
      return Math.round(annualIfMonthly - plan.priceAnnual);
    }
    return 0;
  };

  if (loadingPlans) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" role="status" aria-label="Cargando planes">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-vida-600" aria-hidden="true"></div>
      </div>
    );
  }

  const basicoPlan = plans.find((p) => p.slug === 'basico');
  const premiumPlan = plans.find((p) => p.slug === 'premium');

  return (
    <div className="min-h-screen bg-gradient-to-b from-vida-50 to-white py-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 id="plans-title" className="text-4xl font-bold text-gray-900 mb-4">
            {t('plans.page_title')}
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            {t('plans.page_subtitle')}
          </p>
        </div>

        {/* Toggle Mensual/Anual */}
        <div className="flex justify-center mb-10">
          <div className="bg-white rounded-xl p-1 shadow-sm border border-gray-200" role="group" aria-label={t('plans.billingCycleLabel', { defaultValue: 'Ciclo de facturación' })}>
            <button
              onClick={() => setBillingCycle('MONTHLY')}
              aria-pressed={billingCycle === 'MONTHLY'}
              className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
                billingCycle === 'MONTHLY'
                  ? 'bg-vida-600 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('plans.billing_monthly')}
            </button>
            <button
              onClick={() => setBillingCycle('ANNUAL')}
              aria-pressed={billingCycle === 'ANNUAL'}
              className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
                billingCycle === 'ANNUAL'
                  ? 'bg-vida-600 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('plans.billing_annual')}
              {premiumPlan && getSavings(premiumPlan) > 0 && (
                <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                  {t('plans.save_amount', { amount: getSavings(premiumPlan) })}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Plan Básico */}
          {basicoPlan && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">{basicoPlan.name}</h2>
                <p className="text-gray-500 mt-1">{t('plans.basico.description')}</p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline">
                  <span className="text-4xl font-bold text-gray-900">
                    ${getMonthlyEquivalent(basicoPlan)}
                  </span>
                  <span className="text-gray-500 ml-2">{t('plans.mxn_per_month')}</span>
                </div>
                {billingCycle === 'ANNUAL' && (
                  <p className="text-sm text-gray-500 mt-1">
                    {t('plans.billed_annually', { amount: getPrice(basicoPlan) })}
                  </p>
                )}
                {basicoPlan.trialDays > 0 && (
                  <p className="text-sm text-green-600 mt-2 font-medium">
                    {t('plans.trial_days', { count: basicoPlan.trialDays })}
                  </p>
                )}
              </div>

              <div className="space-y-4 mb-8">
                <p className="text-sm font-medium text-gray-700">{t('plans.includes_label')}</p>
                <ul className="space-y-3">
                  <li className="flex items-start">
                    <svg className="w-5 h-5 text-green-500 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-600">{t('plans.basico.feature_profile')}</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 text-green-500 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-600">{t('plans.basico.feature_qr')}</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 text-green-500 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-600">
                      {t('features.representatives_limited', { count: basicoPlan.limits.representativesLimit })}
                    </span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 text-green-500 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-600">
                      {t('features.qr_limited', { count: basicoPlan.limits.qrDownloadsPerMonth })}
                    </span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 text-green-500 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-600">{t('plans.basico.feature_history')}</span>
                  </li>
                </ul>
              </div>

              {subscription?.plan.slug === 'basico' ? (
                <button
                  disabled
                  className="w-full py-3 px-6 bg-gray-100 text-gray-500 rounded-xl font-medium cursor-not-allowed"
                >
                  {t('plans.basico.current_plan')}
                </button>
              ) : (
                <button
                  onClick={() => handleUpgrade(basicoPlan.id)}
                  disabled={upgrading}
                  className="w-full py-3 px-6 border-2 border-vida-600 text-vida-600 rounded-xl font-medium hover:bg-vida-50 transition-colors disabled:opacity-50"
                >
                  {upgrading && selectedPlan === basicoPlan.id ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t('plans.premium.processing')}
                    </span>
                  ) : basicoPlan.trialDays > 0 ? (
                    t('plans.basico.start_trial', { count: basicoPlan.trialDays })
                  ) : (
                    t('plans.basico.subscribe')
                  )}
                </button>
              )}
            </div>
          )}

          {/* Premium Plan */}
          {premiumPlan && (
            <div className="bg-gradient-to-br from-vida-600 to-vida-800 rounded-2xl shadow-xl p-8 text-white relative overflow-hidden">
              {/* Popular badge */}
              <div className="absolute top-4 right-4">
                <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-3 py-1 rounded-full">
                  {t('plans.premium.badge')}
                </span>
              </div>

              <div className="mb-6">
                <h2 className="text-2xl font-bold">{premiumPlan.name}</h2>
                <p className="text-vida-200 mt-1">{t('plans.premium.description')}</p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline">
                  <span className="text-4xl font-bold">
                    ${getMonthlyEquivalent(premiumPlan)}
                  </span>
                  <span className="text-vida-200 ml-2">{t('plans.mxn_per_month')}</span>
                </div>
                {billingCycle === 'ANNUAL' && (
                  <p className="text-sm text-vida-200 mt-1">
                    {t('plans.billed_annually', { amount: getPrice(premiumPlan) })}
                  </p>
                )}
              </div>

              <div className="space-y-4 mb-8">
                <p className="text-sm font-medium text-vida-100">{t('plans.premium.includes_basic')}</p>
                <ul className="space-y-3">
                  {Object.entries(premiumPlan.features).map(([key, value]) => {
                    if (value) {
                      return (
                        <li key={key} className="flex items-start">
                          <svg className="w-5 h-5 text-green-400 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span>{t(`features.${key}`, { defaultValue: key })}</span>
                        </li>
                      );
                    }
                    return null;
                  })}
                  <li className="flex items-start">
                    <svg className="w-5 h-5 text-green-400 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>{t('features.representatives_unlimited')}</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 text-green-400 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>{t('features.qr_unlimited')}</span>
                  </li>
                </ul>
              </div>

              {isPremium && subscription?.plan.slug === 'premium' ? (
                <button
                  disabled
                  className="w-full py-3 px-6 bg-white/20 text-white rounded-xl font-medium cursor-not-allowed"
                >
                  {t('plans.premium.current_plan')}
                </button>
              ) : (
                <button
                  onClick={() => handleUpgrade(premiumPlan.id)}
                  disabled={upgrading}
                  className="w-full py-3 px-6 bg-white text-vida-600 rounded-xl font-semibold hover:bg-vida-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {upgrading && selectedPlan === premiumPlan.id ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t('plans.premium.processing')}
                    </span>
                  ) : (
                    t('plans.premium.subscribe')
                  )}
                </button>
              )}

              {subscription?.plan.slug === 'basico' && (
                <p className="text-center text-vida-200 text-sm mt-3">
                  {t('plans.premium.upgrade_note')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Comparison Table */}
        <div className="mt-16 max-w-4xl mx-auto">
          <h3 className="text-2xl font-bold text-center text-gray-900 mb-8">
            {t('plans.comparison.title')}
          </h3>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">{t('plans.comparison.col_feature')}</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">{t('plans.comparison.col_basico')}</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-vida-600">{t('plans.comparison.col_premium')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-600">{t('plans.comparison.row_price')}</td>
                  <td className="px-6 py-4 text-center text-sm font-medium text-gray-900">$49 MXN</td>
                  <td className="px-6 py-4 text-center text-sm font-medium text-vida-600">$149 MXN</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-600">{t('plans.comparison.row_profile')}</td>
                  <td className="px-6 py-4 text-center"><CheckIcon /></td>
                  <td className="px-6 py-4 text-center"><CheckIcon className="text-vida-600" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-600">{t('plans.comparison.row_qr')}</td>
                  <td className="px-6 py-4 text-center"><CheckIcon /></td>
                  <td className="px-6 py-4 text-center"><CheckIcon className="text-vida-600" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-600">{t('plans.comparison.row_representatives')}</td>
                  <td className="px-6 py-4 text-center text-sm text-gray-900">{t('plans.comparison.val_basico_reps')}</td>
                  <td className="px-6 py-4 text-center text-sm text-vida-600">{t('plans.comparison.val_premium_reps')}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-600">{t('plans.comparison.row_qr_downloads')}</td>
                  <td className="px-6 py-4 text-center text-sm text-gray-900">{t('plans.comparison.val_basico_qr')}</td>
                  <td className="px-6 py-4 text-center text-sm text-vida-600">{t('plans.comparison.val_premium_qr')}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-600">{t('plans.comparison.row_directives')}</td>
                  <td className="px-6 py-4 text-center"><XIcon /></td>
                  <td className="px-6 py-4 text-center"><CheckIcon className="text-vida-600" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-600">{t('plans.comparison.row_donor')}</td>
                  <td className="px-6 py-4 text-center"><XIcon /></td>
                  <td className="px-6 py-4 text-center"><CheckIcon className="text-vida-600" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-600">{t('plans.comparison.row_nom151')}</td>
                  <td className="px-6 py-4 text-center"><XIcon /></td>
                  <td className="px-6 py-4 text-center"><CheckIcon className="text-vida-600" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-600">{t('plans.comparison.row_sms')}</td>
                  <td className="px-6 py-4 text-center"><XIcon /></td>
                  <td className="px-6 py-4 text-center"><CheckIcon className="text-vida-600" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-600">{t('plans.comparison.row_export')}</td>
                  <td className="px-6 py-4 text-center"><XIcon /></td>
                  <td className="px-6 py-4 text-center"><CheckIcon className="text-vida-600" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-600">{t('plans.comparison.row_support')}</td>
                  <td className="px-6 py-4 text-center"><XIcon /></td>
                  <td className="px-6 py-4 text-center"><CheckIcon className="text-vida-600" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-16 text-center">
          <p className="text-gray-500">
            {t('plans.faq.questions')}{' '}
            <a href="mailto:soporte@sistemavida.mx" className="text-vida-600 hover:underline">
              {t('plans.faq.contact_us')}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function CheckIcon({ className = "text-green-500" }: { className?: string }) {
  return (
    <svg className={`w-5 h-5 mx-auto ${className}`} aria-hidden="true" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-5 h-5 mx-auto text-gray-300" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}
