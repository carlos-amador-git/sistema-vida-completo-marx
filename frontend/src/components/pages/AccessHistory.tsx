// src/components/pages/AccessHistory.tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield } from 'lucide-react';
import { useLocale } from '../../hooks/useLocale';
import { emergencyApi } from '../../services/api';
import type { EmergencyAccess } from '../../types';
import { TableRowSkeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBoundary, ErrorFallback } from '../ui/ErrorBoundary';

export default function AccessHistory() {
  const { t } = useTranslation('emergency');
  const { formatDate, formatTime } = useLocale();
  const [accesses, setAccesses] = useState<EmergencyAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const fetchHistory = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await emergencyApi.getHistory();
        if (!cancelled && res.success && res.data) {
          setAccesses(res.data.accesses);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.response?.data?.error?.message || t('accessHistory.errors.loading'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchHistory();

    return () => { cancelled = true; };
  }, [t, retryCount]);

  const handleRetry = () => setRetryCount((c) => c + 1);

  const getRoleLabel = (role: string) => {
    return t(`accessHistory.roles.${role}`, { defaultValue: role });
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6" role="status" aria-label={t('accessHistory.loading')}>
        {/* Header skeleton */}
        <div className="space-y-2">
          <div className="animate-pulse h-8 w-64 bg-gray-200 rounded-md" aria-hidden="true" />
          <div className="animate-pulse h-4 w-80 bg-gray-200 rounded-md" aria-hidden="true" />
        </div>
        {/* Stats card skeleton */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-4">
            <div className="animate-pulse w-12 h-12 rounded-full bg-gray-200" aria-hidden="true" />
            <div className="space-y-2">
              <div className="animate-pulse h-8 w-10 bg-gray-200 rounded-md" aria-hidden="true" />
              <div className="animate-pulse h-4 w-32 bg-gray-200 rounded-md" aria-hidden="true" />
            </div>
          </div>
        </div>
        {/* Table rows skeleton */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRowSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <ErrorFallback
          error={new Error(error)}
          onRetry={handleRetry}
          title="Error al cargar historial"
          description={error}
        />
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <section className="max-w-4xl mx-auto space-y-6" aria-labelledby="access-history-title">
      {/* Header */}
      <div>
        <h1 id="access-history-title" className="text-2xl font-bold text-gray-900">{t('accessHistory.title')}</h1>
        <p className="text-gray-600 mt-1">
          {t('accessHistory.subtitle')}
        </p>
      </div>

      {/* Stats */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-vida-100 rounded-full flex items-center justify-center" aria-hidden="true">
            <svg className="w-6 h-6 text-vida-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{accesses.length}</p>
            <p className="text-gray-500">{t('accessHistory.totalAccesses')}</p>
          </div>
        </div>
      </div>

      {/* Access List */}
      {accesses.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <EmptyState
            icon={<Shield />}
            title={t('accessHistory.emptyState.title')}
            description={t('accessHistory.emptyState.description')}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {accesses.map((access) => (
            <div
              key={access.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0" aria-hidden="true">
                      <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{access.accessorName}</h3>
                      <p className="text-sm text-gray-500">{getRoleLabel(access.accessorRole)}</p>
                      {access.institutionName && (
                        <p className="text-sm text-gray-500">{access.institutionName}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {formatDate(access.accessedAt)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatTime(access.accessedAt)}
                    </p>
                  </div>
                </div>

                {/* Location */}
                {access.locationName && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {access.locationName}
                  </div>
                )}

                {/* Data accessed */}
                {access.dataAccessed && access.dataAccessed.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-400 mb-2">{t('accessHistory.dataAccessed')}</p>
                    <div className="flex flex-wrap gap-2">
                      {access.dataAccessed.map((item, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <aside className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {t('accessHistory.infoBox.title')}
        </h3>
        <p className="text-blue-700 text-sm">
          {t('accessHistory.infoBox.description')}
        </p>
      </aside>
    </section>
    </ErrorBoundary>
  );
}
