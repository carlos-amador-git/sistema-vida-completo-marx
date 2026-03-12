// src/components/admin/pages/AdminSystemHealth.tsx
import React, { useState, useEffect, useCallback } from 'react';
import ConfirmDialog from '../../ConfirmDialog';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../../hooks/useLocale';
import { getSystemHealth, getPerformanceMetrics, runSystemCleanup } from '../../../services/adminApi';
import { SystemHealth, ServiceStatus } from '../../../types/admin';
import { useAdminAuth } from '../../../context/AdminAuthContext';

const AdminSystemHealth: React.FC = () => {
  const { t } = useTranslation('admin');
  const { formatDateTime } = useLocale();
  const { admin } = useAdminAuth();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [performance, setPerformance] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cleanupResult, setCleanupResult] = useState<any>(null);
  const [isRunningCleanup, setIsRunningCleanup] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);

  const isSuperAdmin = admin?.isSuperAdmin;

  useEffect(() => {
    loadHealth();
    loadPerformance();
    const interval = setInterval(loadHealth, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadHealth = async () => {
    try {
      const data = await getSystemHealth();
      setHealth(data);
    } catch (error) {
      console.error('Error loading health:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPerformance = async () => {
    try {
      const data = await getPerformanceMetrics();
      setPerformance(data);
    } catch (error) {
      console.error('Error loading performance:', error);
    }
  };

  const handleCleanup = async (dryRun: boolean) => {
    if (!dryRun) {
      setShowCleanupConfirm(true);
      return;
    }

    try {
      setIsRunningCleanup(true);
      const result = await runSystemCleanup(dryRun);
      setCleanupResult(result);
    } catch (error) {
      console.error('Cleanup error:', error);
      alert(t('system.cleanup_error'));
    } finally {
      setIsRunningCleanup(false);
    }
  };

  const handleConfirmedCleanup = useCallback(async () => {
    setShowCleanupConfirm(false);
    try {
      setIsRunningCleanup(true);
      const result = await runSystemCleanup(false);
      setCleanupResult(result);
    } catch (error) {
      console.error('Cleanup error:', error);
    } finally {
      setIsRunningCleanup(false);
    }
  }, []);

  const getStatusLabel = (status: string) => {
    const key = `system.status_${status}`;
    return t(key, { defaultValue: status });
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatBytes = (mb: number) => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb} MB`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('system.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={showCleanupConfirm}
        title={t('system.cleanup_confirm_title', { defaultValue: 'Confirm Cleanup' })}
        description={t('system.cleanup_confirm')}
        confirmLabel={t('system.cleanup_confirm_action', { defaultValue: 'Run Cleanup' })}
        cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
        variant="destructive"
        onConfirm={handleConfirmedCleanup}
        onOpenChange={(open) => { if (!open) setShowCleanupConfirm(false); }}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('system.title')}</h1>
          <p className="text-gray-500">{t('system.subtitle')}</p>
        </div>
        <button
          onClick={loadHealth}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {t('system.btn_refresh')}
        </button>
      </div>

      {/* Overall Status */}
      {health && (
        <div className={`rounded-xl p-6 text-white ${
          health.status === 'healthy' ? 'bg-gradient-to-r from-green-500 to-green-600' :
          health.status === 'degraded' ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
          'bg-gradient-to-r from-red-500 to-red-600'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                {health.status === 'healthy' ? (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold">{t('system.system_status', { status: getStatusLabel(health.status) })}</h2>
                <p className="text-white/80">
                  {t('system.last_check')} {formatDateTime(health.timestamp)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{health.responseTime}ms</p>
              <p className="text-white/80">{t('system.response_time')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Database */}
        {health?.database && (
          <ServiceCard service={health.database} />
        )}

        {/* Other services */}
        {health?.services.map((service, index) => (
          <ServiceCard key={index} service={service} />
        ))}
      </div>

      {/* System Info */}
      {health?.system && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('system.system_info')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-500">{t('system.info_environment')}</p>
              <p className="text-lg font-semibold text-gray-900 capitalize">{health.system.environment}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('system.info_nodejs')}</p>
              <p className="text-lg font-semibold text-gray-900">{health.system.nodeVersion}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('system.info_uptime')}</p>
              <p className="text-lg font-semibold text-green-600">{formatUptime(health.system.uptime)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('system.info_port')}</p>
              <p className="text-lg font-semibold text-gray-900">{health.system.config.port}</p>
            </div>
          </div>
        </div>
      )}

      {/* Memory Usage */}
      {health?.system?.memory && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('system.memory_usage')}</h3>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-500">{t('system.memory_heap_used')}</p>
              <p className="text-2xl font-bold text-sky-600">{formatBytes(health.system.memory.heapUsed)}</p>
              <div className="mt-2 h-2 bg-gray-100 rounded-full">
                <div
                  className="h-2 bg-sky-500 rounded-full"
                  style={{
                    width: `${(health.system.memory.heapUsed / health.system.memory.heapTotal) * 100}%`
                  }}
                />
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('system.memory_heap_total')}</p>
              <p className="text-2xl font-bold text-gray-900">{formatBytes(health.system.memory.heapTotal)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('system.memory_rss')}</p>
              <p className="text-2xl font-bold text-gray-900">{formatBytes(health.system.memory.rss)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Database Stats */}
      {health?.database?.details?.tables && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('system.db_stats')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {Object.entries(health.database.details.tables).map(([table, count]) => (
              <div key={table} className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{(count as number).toLocaleString()}</p>
                <p className="text-sm text-gray-500 capitalize">{table}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity by Hour */}
      {performance?.activityByHour && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('system.activity_chart')}</h3>
          <div className="flex items-end gap-1 h-32">
            {performance.activityByHour.map((item: { hour: number; count: number }) => {
              const maxCount = Math.max(...performance.activityByHour.map((i: any) => i.count), 1);
              return (
                <div key={item.hour} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-sky-500 rounded-t transition-all"
                    style={{
                      height: `${(item.count / maxCount) * 100}%`,
                      minHeight: item.count > 0 ? '4px' : '0'
                    }}
                    title={`${item.count}`}
                  />
                  <span className="text-xs text-gray-400 mt-1">
                    {item.hour.toString().padStart(2, '0')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cleanup Tool (Super Admin only) */}
      {isSuperAdmin && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('system.maintenance_title')}</h3>

          <div className="flex items-start gap-4">
            <div className="flex-1">
              <p className="text-gray-600 mb-4">
                {t('system.maintenance_desc')}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => handleCleanup(true)}
                  disabled={isRunningCleanup}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                >
                  {t('system.btn_dry_run')}
                </button>
                <button
                  onClick={() => handleCleanup(false)}
                  disabled={isRunningCleanup}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {isRunningCleanup ? t('system.btn_cleanup_running') : t('system.btn_cleanup')}
                </button>
              </div>
            </div>

            {cleanupResult && (
              <div className="flex-1 bg-gray-50 rounded-lg p-4">
                <p className="font-medium text-gray-900 mb-2">
                  {cleanupResult.dryRun ? t('system.cleanup_preview') : t('system.cleanup_result')}
                </p>
                <div className="text-sm space-y-1">
                  <p>{t('system.cleanup_expired_sessions')} <span className="font-medium">{cleanupResult.toDelete?.expiredSessions || 0}</span></p>
                  <p>{t('system.cleanup_expired_admin')} <span className="font-medium">{cleanupResult.toDelete?.expiredAdminSessions || 0}</span></p>
                  <p>{t('system.cleanup_old_accesses')} <span className="font-medium">{cleanupResult.toDelete?.expiredEmergencyAccesses || 0}</span></p>
                  <p>{t('system.cleanup_old_alerts')} <span className="font-medium">{cleanupResult.toDelete?.oldPanicAlerts || 0}</span></p>
                </div>
                {!cleanupResult.dryRun && (
                  <p className="mt-2 text-green-600 font-medium">
                    {t('system.cleanup_deleted', { count: cleanupResult.deleted?.sessions || 0 })}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Service Card Component
const ServiceCard: React.FC<{ service: ServiceStatus }> = ({ service }) => {
  const { t } = useTranslation('admin');
  // Si es opcional y no está configurado, mostramos como "info" en lugar de "warning"
  const isOptionalUnconfigured = service.optional && service.status === 'degraded' && !service.details?.configured;

  const getStatusColor = (status: string) => {
    if (isOptionalUnconfigured) return 'bg-gray-100 border-gray-200';
    switch (status) {
      case 'healthy': return 'bg-green-100 border-green-200';
      case 'degraded': return 'bg-yellow-100 border-yellow-200';
      case 'down': return 'bg-red-100 border-red-200';
      default: return 'bg-gray-100 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    if (isOptionalUnconfigured) {
      return (
        <div className="w-10 h-10 bg-gray-400 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );
    }
    switch (status) {
      case 'healthy':
        return (
          <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'degraded':
        return (
          <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        );
    }
  };

  const getStatusLabel = () => {
    if (isOptionalUnconfigured) return t('system.service_optional');
    const key = `system.status_${service.status}`;
    return t(key, { defaultValue: service.status });
  };

  return (
    <div className={`rounded-xl border p-4 ${getStatusColor(service.status)}`}>
      <div className="flex items-center gap-4">
        {getStatusIcon(service.status)}
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900">{service.name}</h4>
          <p className={`text-sm capitalize ${isOptionalUnconfigured ? 'text-gray-500' : 'text-gray-600'}`}>
            {getStatusLabel()}
          </p>
          {service.responseTime && (
            <p className="text-xs text-gray-500">{service.responseTime}ms</p>
          )}
        </div>
      </div>
      {service.details?.configured !== undefined && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className={`text-sm ${service.details.configured ? 'text-green-600' : isOptionalUnconfigured ? 'text-gray-500' : 'text-orange-600'}`}>
            {service.details.configured ? t('system.service_configured') : isOptionalUnconfigured ? t('system.service_not_required') : t('system.service_not_configured')}
          </p>
        </div>
      )}
    </div>
  );
};

export default AdminSystemHealth;
