// src/components/pages/NotificationSettings.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../../context/NotificationContext';
import {
  Bell,
  BellOff,
  AlertTriangle,
  QrCode,
  FileText,
  Users,
  ArrowLeft,
  Moon,
  Volume2,
  VolumeX,
  Smartphone,
  Mail,
  MessageSquare,
  Check,
  Info
} from 'lucide-react';
import toast from 'react-hot-toast';

interface NotificationPreferences {
  // Por tipo de notificacion
  panicAlerts: boolean;
  qrAccess: boolean;
  systemNotifications: boolean;
  representativeUpdates: boolean;
  documentUpdates: boolean;

  // Canales
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;

  // No molestar
  doNotDisturbEnabled: boolean;
  doNotDisturbStart: string;
  doNotDisturbEnd: string;

  // Sonido
  soundEnabled: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  panicAlerts: true,
  qrAccess: true,
  systemNotifications: true,
  representativeUpdates: true,
  documentUpdates: true,
  pushEnabled: true,
  emailEnabled: true,
  smsEnabled: false,
  doNotDisturbEnabled: false,
  doNotDisturbStart: '22:00',
  doNotDisturbEnd: '08:00',
  soundEnabled: true,
};

const STORAGE_KEY = 'vida_notification_preferences';

function loadPreferences(): NotificationPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Error loading notification preferences:', e);
  }
  return DEFAULT_PREFERENCES;
}

function savePreferences(prefs: NotificationPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error('Error saving notification preferences:', e);
  }
}

export default function NotificationSettings() {
  const { t } = useTranslation('notifications');
  const { permission, supported, requestPermission } = useNotifications();
  const [preferences, setPreferences] = useState<NotificationPreferences>(loadPreferences);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Detectar cambios
  useEffect(() => {
    const stored = loadPreferences();
    const changed = JSON.stringify(stored) !== JSON.stringify(preferences);
    setHasChanges(changed);
  }, [preferences]);

  const updatePreference = <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K]
  ) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      savePreferences(preferences);
      toast.success(t('settings.toast.saved'));
      setHasChanges(false);
    } catch (error) {
      toast.error(t('settings.toast.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleRequestPermission = async () => {
    const result = await requestPermission();
    if (result === 'granted') {
      toast.success(t('settings.toast.permissionGranted'));
      updatePreference('pushEnabled', true);
    } else if (result === 'denied') {
      toast.error(t('settings.toast.permissionDenied'));
    }
  };

  const ToggleSwitch = ({
    enabled,
    onChange,
    disabled = false,
    label
  }: {
    enabled: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
    label?: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        disabled
          ? 'bg-gray-200 cursor-not-allowed'
          : enabled
            ? 'bg-vida-600'
            : 'bg-gray-300'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );

  return (
    <section className="space-y-6 animate-fade-in" aria-labelledby="notification-settings-title">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/notifications"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label={t('settings.backLabel', { defaultValue: 'Volver a notificaciones' })}
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" aria-hidden="true" />
        </Link>
        <div>
          <h1 id="notification-settings-title" className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
          <p className="text-gray-600 mt-1">{t('settings.subtitle')}</p>
        </div>
      </div>

      {/* Estado de permisos del navegador */}
      {supported && permission !== 'granted' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-amber-100 rounded-lg">
              <BellOff className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-amber-900">{t('settings.permissions.disabled.title')}</h3>
              <p className="text-sm text-amber-700 mt-1">
                {t('settings.permissions.disabled.description')}
              </p>
              <button
                onClick={handleRequestPermission}
                className="mt-3 bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
              >
                {t('settings.permissions.disabled.enable')}
              </button>
            </div>
          </div>
        </div>
      )}

      {permission === 'granted' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-medium text-green-900">{t('settings.permissions.granted.title')}</h3>
              <p className="text-sm text-green-700">{t('settings.permissions.granted.description')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tipos de notificaciones */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{t('settings.types.sectionTitle')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('settings.types.sectionSubtitle')}</p>
        </div>

        <div className="divide-y divide-gray-100">
          {/* Alertas de panico */}
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-red-100 rounded-lg" aria-hidden="true">
                <AlertTriangle className="w-5 h-5 text-red-600" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{t('settings.types.panicAlerts.title')}</h3>
                <p className="text-sm text-gray-500">{t('settings.types.panicAlerts.description')}</p>
              </div>
            </div>
            <ToggleSwitch
              enabled={preferences.panicAlerts}
              onChange={(v) => updatePreference('panicAlerts', v)}
              label={t('settings.types.panicAlerts.title')}
            />
          </div>

          {/* Accesos QR */}
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-blue-100 rounded-lg" aria-hidden="true">
                <QrCode className="w-5 h-5 text-blue-600" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{t('settings.types.qrAccess.title')}</h3>
                <p className="text-sm text-gray-500">{t('settings.types.qrAccess.description')}</p>
              </div>
            </div>
            <ToggleSwitch
              enabled={preferences.qrAccess}
              onChange={(v) => updatePreference('qrAccess', v)}
              label={t('settings.types.qrAccess.title')}
            />
          </div>

          {/* Representantes */}
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-vida-100 rounded-lg" aria-hidden="true">
                <Users className="w-5 h-5 text-vida-600" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{t('settings.types.representatives.title')}</h3>
                <p className="text-sm text-gray-500">{t('settings.types.representatives.description')}</p>
              </div>
            </div>
            <ToggleSwitch
              enabled={preferences.representativeUpdates}
              onChange={(v) => updatePreference('representativeUpdates', v)}
              label={t('settings.types.representatives.title')}
            />
          </div>

          {/* Documentos */}
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-amber-100 rounded-lg" aria-hidden="true">
                <FileText className="w-5 h-5 text-amber-600" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{t('settings.types.documents.title')}</h3>
                <p className="text-sm text-gray-500">{t('settings.types.documents.description')}</p>
              </div>
            </div>
            <ToggleSwitch
              enabled={preferences.documentUpdates}
              onChange={(v) => updatePreference('documentUpdates', v)}
              label={t('settings.types.documents.title')}
            />
          </div>

          {/* Sistema */}
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-gray-100 rounded-lg" aria-hidden="true">
                <Bell className="w-5 h-5 text-gray-600" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{t('settings.types.system.title')}</h3>
                <p className="text-sm text-gray-500">{t('settings.types.system.description')}</p>
              </div>
            </div>
            <ToggleSwitch
              enabled={preferences.systemNotifications}
              onChange={(v) => updatePreference('systemNotifications', v)}
              label={t('settings.types.system.title')}
            />
          </div>
        </div>
      </div>

      {/* Canales de notificacion */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{t('settings.channels.sectionTitle')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('settings.channels.sectionSubtitle')}</p>
        </div>

        <div className="divide-y divide-gray-100">
          {/* Push */}
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-vida-100 rounded-lg" aria-hidden="true">
                <Smartphone className="w-5 h-5 text-vida-600" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{t('settings.channels.push.title')}</h3>
                <p className="text-sm text-gray-500">{t('settings.channels.push.description')}</p>
              </div>
            </div>
            <ToggleSwitch
              enabled={preferences.pushEnabled && permission === 'granted'}
              onChange={(v) => updatePreference('pushEnabled', v)}
              disabled={permission !== 'granted'}
              label={t('settings.channels.push.title')}
            />
          </div>

          {/* Email */}
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-blue-100 rounded-lg" aria-hidden="true">
                <Mail className="w-5 h-5 text-blue-600" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{t('settings.channels.email.title')}</h3>
                <p className="text-sm text-gray-500">{t('settings.channels.email.description')}</p>
              </div>
            </div>
            <ToggleSwitch
              enabled={preferences.emailEnabled}
              onChange={(v) => updatePreference('emailEnabled', v)}
              label={t('settings.channels.email.title')}
            />
          </div>

          {/* SMS */}
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-green-100 rounded-lg" aria-hidden="true">
                <MessageSquare className="w-5 h-5 text-green-600" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{t('settings.channels.sms.title')}</h3>
                <p className="text-sm text-gray-500">{t('settings.channels.sms.description')}</p>
                <span className="inline-flex items-center gap-1 mt-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  <Info className="w-3 h-3" aria-hidden="true" />
                  {t('settings.channels.sms.premiumBadge')}
                </span>
              </div>
            </div>
            <ToggleSwitch
              enabled={preferences.smsEnabled}
              onChange={(v) => updatePreference('smsEnabled', v)}
              label={t('settings.channels.sms.title')}
            />
          </div>
        </div>
      </div>

      {/* Horario de no molestar */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">{t('settings.dnd.title')}</h2>
              <p className="text-sm text-gray-500 mt-1">{t('settings.dnd.subtitle')}</p>
            </div>
            <ToggleSwitch
              enabled={preferences.doNotDisturbEnabled}
              onChange={(v) => updatePreference('doNotDisturbEnabled', v)}
              label={t('settings.dnd.title')}
            />
          </div>
        </div>

        {preferences.doNotDisturbEnabled && (
          <div className="px-6 py-4">
            <div className="flex items-center gap-4">
              <Moon className="w-5 h-5 text-vida-500" aria-hidden="true" />
              <div className="flex items-center gap-3">
                <div>
                  <label htmlFor="dnd-start" className="block text-xs text-gray-500 mb-1">{t('settings.dnd.from')}</label>
                  <input
                    id="dnd-start"
                    type="time"
                    value={preferences.doNotDisturbStart}
                    onChange={(e) => updatePreference('doNotDisturbStart', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <span className="text-gray-400 mt-5" aria-hidden="true">-</span>
                <div>
                  <label htmlFor="dnd-end" className="block text-xs text-gray-500 mb-1">{t('settings.dnd.to')}</label>
                  <input
                    id="dnd-end"
                    type="time"
                    value={preferences.doNotDisturbEnd}
                    onChange={(e) => updatePreference('doNotDisturbEnd', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3 ml-9">
              {t('settings.dnd.note')}
            </p>
          </div>
        )}
      </div>

      {/* Sonido */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-gray-100 rounded-lg" aria-hidden="true">
              {preferences.soundEnabled ? (
                <Volume2 className="w-5 h-5 text-gray-600" aria-hidden="true" />
              ) : (
                <VolumeX className="w-5 h-5 text-gray-400" aria-hidden="true" />
              )}
            </div>
            <div>
              <h3 className="font-medium text-gray-900">{t('settings.sound.title')}</h3>
              <p className="text-sm text-gray-500">{t('settings.sound.description')}</p>
            </div>
          </div>
          <ToggleSwitch
            enabled={preferences.soundEnabled}
            onChange={(v) => updatePreference('soundEnabled', v)}
            label={t('settings.sound.title')}
          />
        </div>
      </div>

      {/* Boton guardar */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving}
            className="bg-vida-600 text-white px-6 py-3 rounded-xl font-medium shadow-lg hover:bg-vida-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                {t('settings.saving')}
              </>
            ) : (
              <>
                <Check className="w-5 h-5" aria-hidden="true" />
                {t('settings.save')}
              </>
            )}
          </button>
        </div>
      )}

      {/* Enlace al Aviso de Privacidad */}
      <aside className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700">Aviso de Privacidad (LFPDPPP)</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Conozca cómo tratamos sus datos personales conforme a la ley mexicana.
          </p>
        </div>
        <Link
          to="/aviso-privacidad"
          className="flex items-center gap-1.5 text-sm text-vida-600 hover:text-vida-800 font-medium transition-colors"
        >
          Ver aviso
          <ArrowLeft className="w-4 h-4 rotate-180" aria-hidden="true" />
        </Link>
      </aside>
    </section>
  );
}
