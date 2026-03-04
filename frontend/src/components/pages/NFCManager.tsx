// src/components/pages/NFCManager.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useNFC, EmergencyNFCData } from '../../hooks/useNFC';
import { profileApi } from '../../services/api';

interface UserProfile {
  id: string;
  bloodType?: string | null;
  allergies?: string[];
  conditions?: string[];
  qrToken?: string;
}

type WriteMode = 'url' | 'full';

export default function NFCManager() {
  const { t } = useTranslation('extras');
  const { user } = useAuth();
  const { isSupported, isWriting, writeUrl, writeEmergencyData, cancelOperation } = useNFC();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [writeMode, setWriteMode] = useState<WriteMode>('url');
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info' | null; message: string }>({
    type: null,
    message: '',
  });

  const emergencyUrl = profile?.qrToken
    ? `${window.location.origin}/emergency/${profile.qrToken}`
    : '';

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await profileApi.getProfile();
      setProfile(response.data?.profile ?? null);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleWriteTag = async () => {
    if (!emergencyUrl) {
      setStatus({ type: 'error', message: t('nfc.errors.noEmergencyId') });
      return;
    }

    setStatus({ type: 'info', message: t('nfc.status.approaching') });

    let result;

    if (writeMode === 'url') {
      result = await writeUrl(emergencyUrl);
    } else {
      const emergencyData: EmergencyNFCData = {
        url: emergencyUrl,
        name: user?.name || 'Paciente',
        bloodType: profile?.bloodType ?? undefined,
        allergies: profile?.allergies,
        conditions: profile?.conditions,
      };
      result = await writeEmergencyData(emergencyData);
    }

    if (result.success) {
      setStatus({ type: 'success', message: t('nfc.status.success') });
    } else {
      setStatus({ type: 'error', message: result.error || t('nfc.errors.writeError') });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" role="status" aria-label="Cargando">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-vida-600" aria-hidden="true"></div>
      </div>
    );
  }

  return (
    <section className="max-w-lg mx-auto p-4 space-y-6" aria-labelledby="nfc-title">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 bg-vida-100 rounded-full flex items-center justify-center mx-auto mb-4" aria-hidden="true">
          <svg className="w-8 h-8 text-vida-600" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 id="nfc-title" className="text-2xl font-bold text-gray-900">{t('nfc.pageTitle')}</h1>
        <p className="text-gray-600 mt-2">
          {t('nfc.pageDescription')}
        </p>
      </div>

      {/* NFC Support Check */}
      {!isSupported && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4" role="alert">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-amber-600 flex-shrink-0" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="font-semibold text-amber-800">{t('nfc.notSupported.title')}</h3>
              <p className="text-sm text-amber-700 mt-1">
                {t('nfc.notSupported.description')}
              </p>
              <ul className="text-sm text-amber-700 mt-2 list-disc list-inside">
                <li>{t('nfc.notSupported.requirements.android')}</li>
                <li>{t('nfc.notSupported.requirements.chrome')}</li>
                <li>{t('nfc.notSupported.requirements.https')}</li>
              </ul>
              <p className="text-sm text-amber-700 mt-2">
                <strong>{t('nfc.notSupported.alternative')}</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Emergency URL Display */}
      <div className="bg-gray-50 rounded-xl p-4">
        <label htmlFor="nfc-emergency-url" className="block text-sm font-medium text-gray-700 mb-2">
          {t('nfc.emergencyUrl.label')}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="nfc-emergency-url"
            type="text"
            value={emergencyUrl}
            readOnly
            aria-label={t('nfc.emergencyUrl.label')}
            className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-600"
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(emergencyUrl);
              setStatus({ type: 'success', message: t('nfc.emergencyUrl.copySuccess') });
            }}
            aria-label={t('nfc.emergencyUrl.copyLabel', { defaultValue: 'Copiar URL de emergencia' })}
            className="p-2 bg-vida-600 text-white rounded-lg hover:bg-vida-700 transition"
          >
            <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Write Mode Selection */}
      {isSupported && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            {t('nfc.writeMode.label')}
          </label>
          <div className="space-y-3">
            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition">
              <input
                type="radio"
                name="writeMode"
                value="url"
                checked={writeMode === 'url'}
                onChange={() => setWriteMode('url')}
                className="mt-1"
              />
              <div>
                <span className="font-medium text-gray-900">{t('nfc.writeMode.urlOnly.title')}</span>
                <p className="text-sm text-gray-500">
                  {t('nfc.writeMode.urlOnly.description')}
                </p>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition">
              <input
                type="radio"
                name="writeMode"
                value="full"
                checked={writeMode === 'full'}
                onChange={() => setWriteMode('full')}
                className="mt-1"
              />
              <div>
                <span className="font-medium text-gray-900">{t('nfc.writeMode.fullData.title')}</span>
                <p className="text-sm text-gray-500">
                  {t('nfc.writeMode.fullData.description')}
                </p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Data Preview (for full mode) */}
      {isSupported && writeMode === 'full' && profile && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
          <h3 className="font-semibold text-sky-800 mb-2">{t('nfc.dataPreview.title')}</h3>
          <ul className="text-sm text-sky-700 space-y-1">
            <li>👤 {user?.name}</li>
            {profile.bloodType && <li>🩸 {t('nfc.dataPreview.bloodType')}: {profile.bloodType}</li>}
            {profile.allergies?.length ? (
              <li>⚠️ {t('nfc.dataPreview.allergies')}: {profile.allergies.join(', ')}</li>
            ) : null}
            {profile.conditions?.length ? (
              <li>💊 {t('nfc.dataPreview.conditions')}: {profile.conditions.slice(0, 3).join(', ')}</li>
            ) : null}
          </ul>
        </div>
      )}

      {/* Write Button */}
      {isSupported && (
        <div className="space-y-3">
          {!isWriting ? (
            <button
              onClick={handleWriteTag}
              className="w-full py-4 bg-vida-600 text-white rounded-xl font-semibold text-lg hover:bg-vida-700 transition flex items-center justify-center gap-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              {t('nfc.buttons.write')}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="w-full py-4 bg-vida-100 text-vida-700 rounded-xl font-semibold text-lg flex items-center justify-center gap-3">
                <div className="animate-pulse">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                {t('nfc.buttons.writing')}
              </div>
              <button
                onClick={cancelOperation}
                className="w-full py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition"
              >
                {t('nfc.buttons.cancel')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Status Message */}
      {status.type && (
        <div
          role="status"
          aria-live="polite"
          className={`p-4 rounded-xl flex items-center gap-3 ${
            status.type === 'success'
              ? 'bg-green-50 text-green-800'
              : status.type === 'error'
              ? 'bg-red-50 text-red-800'
              : 'bg-blue-50 text-blue-800'
          }`}
        >
          {status.type === 'success' && (
            <svg className="w-6 h-6" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {status.type === 'error' && (
            <svg className="w-6 h-6" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {status.type === 'info' && (
            <svg className="w-6 h-6 animate-pulse" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span>{status.message}</span>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-gray-50 rounded-xl p-4">
        <h3 className="font-semibold text-gray-900 mb-3">{t('nfc.instructions.title')}</h3>
        <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
          <li>{t('nfc.instructions.step1')}</li>
          <li>{t('nfc.instructions.step2')}</li>
          <li>{t('nfc.instructions.step3')}</li>
          <li>{t('nfc.instructions.step4')}</li>
          <li>{t('nfc.instructions.step5')}</li>
        </ol>
      </div>

      {/* Product Recommendations */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="font-semibold text-gray-900 mb-3">{t('nfc.products.title')}</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-12 h-12 bg-vida-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">⌚</span>
            </div>
            <div>
              <p className="font-medium text-gray-900">{t('nfc.products.bracelet.name')}</p>
              <p className="text-sm text-gray-500">{t('nfc.products.bracelet.description')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-12 h-12 bg-vida-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">💳</span>
            </div>
            <div>
              <p className="font-medium text-gray-900">{t('nfc.products.card.name')}</p>
              <p className="text-sm text-gray-500">{t('nfc.products.card.description')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-12 h-12 bg-vida-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">🏷️</span>
            </div>
            <div>
              <p className="font-medium text-gray-900">{t('nfc.products.sticker.name')}</p>
              <p className="text-sm text-gray-500">{t('nfc.products.sticker.description')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Wallet Option */}
      <Link
        to="/wallet"
        className="block bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-6 hover:shadow-lg transition"
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/10 rounded-xl flex items-center justify-center" aria-hidden="true">
            <svg className="w-8 h-8 text-white" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-white flex items-center gap-2">
              {t('nfc.walletPromo.title')}
              <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full">{t('nfc.walletPromo.proBadge')}</span>
            </h3>
            <p className="text-sm text-gray-300 mt-1">
              {t('nfc.walletPromo.description')}
            </p>
          </div>
          <svg className="w-5 h-5 text-gray-400" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </Link>
    </section>
  );
}
