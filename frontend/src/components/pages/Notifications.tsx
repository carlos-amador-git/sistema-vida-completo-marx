// src/components/pages/Notifications.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../../context/NotificationContext';
import { VidaNotification } from '../../hooks/usePushNotifications';
import { useLocale } from '../../hooks/useLocale';
import {
  Bell,
  BellOff,
  AlertTriangle,
  QrCode,
  FileText,
  Users,
  Settings,
  Check,
  CheckCheck,
  Trash2,
  Filter
} from 'lucide-react';
import { Link } from 'react-router-dom';

type FilterType = 'all' | 'unread' | 'PANIC_ALERT' | 'QR_ACCESS' | 'SYSTEM' | 'REPRESENTATIVE' | 'DOCUMENT';

export default function Notifications() {
  const { t } = useTranslation('notifications');
  const { t: tCommon } = useTranslation('common');
  const { formatDate } = useLocale();

  const {
    notifications,
    unreadCount,
    permission,
    supported,
    requestPermission,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications
  } = useNotifications();

  const [filter, setFilter] = useState<FilterType>('all');
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const NOTIFICATION_CONFIG: Record<VidaNotification['type'], {
    icon: typeof Bell;
    color: string;
    bgColor: string;
    label: string;
  }> = {
    PANIC_ALERT: {
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      label: t('types.PANIC_ALERT')
    },
    QR_ACCESS: {
      icon: QrCode,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      label: t('types.QR_ACCESS')
    },
    SYSTEM: {
      icon: Bell,
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
      label: t('types.SYSTEM')
    },
    REPRESENTATIVE: {
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      label: t('types.REPRESENTATIVE')
    },
    DOCUMENT: {
      icon: FileText,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100',
      label: t('types.DOCUMENT')
    }
  };

  function formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return tCommon('time.now');
    if (diffMins < 60) return tCommon('time.minutesAgo', { count: diffMins });
    if (diffHours < 24) return tCommon('time.hoursAgo', { count: diffHours });
    if (diffDays < 7) return tCommon('time.daysAgo', { count: diffDays });

    return formatDate(date, { day: 'numeric', month: 'short' });
  }

  // Filtrar notificaciones
  const filteredNotifications = notifications.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.read;
    return n.type === filter;
  });

  // Agrupar por fecha
  const groupedNotifications = filteredNotifications.reduce((groups, notification) => {
    const date = notification.createdAt.toDateString();
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    let groupKey = date;
    if (date === today) groupKey = t('groups.today');
    else if (date === yesterday) groupKey = t('groups.yesterday');

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(notification);
    return groups;
  }, {} as Record<string, VidaNotification[]>);

  const handleRequestPermission = async () => {
    const result = await requestPermission();
    if (result === 'granted') {
      // Mostrar mensaje de éxito
    }
  };

  return (
    <section className="space-y-6 animate-fade-in" aria-labelledby="notifications-title">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 id="notifications-title" className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-gray-600 mt-1">
            {unreadCount > 0
              ? t('unreadCount', { count: unreadCount })
              : t('allRead')
            }
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/settings/notifications"
            className="btn-secondary flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">{t('configure')}</span>
          </Link>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="btn-secondary flex items-center gap-2"
            >
              <CheckCheck className="w-4 h-4" />
              <span className="hidden sm:inline">{t('markAllRead')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Banner de permisos si no están habilitados */}
      {supported && permission !== 'granted' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-amber-100 rounded-lg">
              <BellOff className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-amber-900">{t('permissionBanner.title')}</h3>
              <p className="text-sm text-amber-700 mt-1">
                {t('permissionBanner.description')}
              </p>
              <button
                onClick={handleRequestPermission}
                className="mt-3 bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
              >
                {t('permissionBanner.enable')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2" role="group" aria-label={t('filters.label', { defaultValue: 'Filtrar notificaciones' })}>
        <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
        {[
          { key: 'all', label: t('filters.all') },
          { key: 'unread', label: t('filters.unread') },
          { key: 'PANIC_ALERT', label: t('filters.alerts') },
          { key: 'QR_ACCESS', label: t('filters.access') },
          { key: 'SYSTEM', label: t('filters.system') },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key as FilterType)}
            aria-pressed={filter === key}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filter === key
                ? 'bg-vida-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
            {key === 'unread' && unreadCount > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full" aria-label={`${unreadCount} sin leer`}>
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lista de notificaciones */}
      <div aria-live="polite" aria-atomic="false" className="sr-only">
        {filteredNotifications.length === 0
          ? t('empty.all')
          : t('resultsCount', { count: filteredNotifications.length })}
      </div>
      {filteredNotifications.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {filter === 'all'
              ? t('empty.all')
              : filter === 'unread'
                ? t('empty.unread')
                : t('empty.filtered')
            }
          </h3>
          <p className="text-gray-500">
            {t('empty.description')}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedNotifications).map(([dateGroup, notifs]) => (
            <div key={dateGroup}>
              <h3 className="text-sm font-medium text-gray-500 mb-3">{dateGroup}</h3>
              <div className="space-y-2">
                {notifs.map((notification) => {
                  const config = NOTIFICATION_CONFIG[notification.type];
                  const Icon = config.icon;

                  return (
                    <article
                      key={notification.id}
                      aria-label={notification.title}
                      className={`bg-white rounded-xl border p-4 transition-all ${
                        notification.read
                          ? 'border-gray-100'
                          : 'border-vida-200 bg-vida-50/30 shadow-sm'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`p-2.5 rounded-xl ${config.bgColor}`} aria-hidden="true">
                          <Icon className={`w-5 h-5 ${config.color}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.bgColor} ${config.color}`}>
                                {config.label}
                              </span>
                              <h4 className="font-medium text-gray-900 mt-1">
                                {notification.title}
                              </h4>
                            </div>
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {formatTimeAgo(notification.createdAt)}
                            </span>
                          </div>

                          <p className="text-sm text-gray-600 mt-1">
                            {notification.body}
                          </p>

                          {notification.data && (
                            <div className="mt-2 text-xs text-gray-500">
                              {notification.data.accessorRole && (
                                <span>{t('data.role')}: {notification.data.accessorRole}</span>
                              )}
                              {notification.data.location && (
                                <span className="ml-2">{t('data.location')}: {notification.data.location}</span>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-3 mt-3">
                            {!notification.read && (
                              <button
                                onClick={() => markAsRead(notification.id)}
                                className="text-xs text-vida-600 hover:text-vida-700 flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" />
                                {t('actions.markRead')}
                              </button>
                            )}
                            <button
                              onClick={() => clearNotification(notification.id)}
                              className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              {t('actions.delete')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Botón para limpiar todas */}
          {notifications.length > 0 && (
            <div className="text-center pt-4">
              {showConfirmClear ? (
                <div className="inline-flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2" role="alert" aria-live="assertive">
                  <span className="text-sm text-red-700">{t('confirmClear.question')}</span>
                  <button
                    onClick={() => {
                      clearAllNotifications();
                      setShowConfirmClear(false);
                    }}
                    className="text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    {t('confirmClear.confirm')}
                  </button>
                  <button
                    onClick={() => setShowConfirmClear(false)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    {t('confirmClear.cancel')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfirmClear(true)}
                  className="text-sm text-gray-400 hover:text-red-600 flex items-center gap-1 mx-auto"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('actions.deleteAll')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
