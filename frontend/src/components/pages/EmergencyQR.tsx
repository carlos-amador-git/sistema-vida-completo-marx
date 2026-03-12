// src/components/pages/EmergencyQR.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { profileApi } from '../../services/api';
import { QRCodeSVG } from 'qrcode.react';
import { useLocale } from '../../hooks/useLocale';
import { QRReveal } from '../qr/QRReveal';
import { QRSkeleton } from '../ui/skeletons/QRSkeleton';
import { ShieldAlert } from 'lucide-react';
import { AnimatedIcon } from '../ui/AnimatedIcon';
import { ConfirmDialog } from '../ConfirmDialog';

export default function EmergencyQR() {
  const { t } = useTranslation('emergency');
  const { formatDateTime } = useLocale();

  const [qrData, setQrData] = useState<{
    qrToken: string;
    qrDataUrl: string;
    generatedAt: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);

  const fetchQR = async () => {
    try {
      setLoading(true);
      const res = await profileApi.getQR();
      if (res.success && res.data) {
        setQrData(res.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t('qr.error_load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQR();
  }, []);

  const handleRegenerate = () => {
    setRegenConfirmOpen(true);
  };

  const doRegenerate = async () => {
    try {
      setRegenerating(true);
      const res = await profileApi.regenerateQR();
      if (res.success && res.data) {
        setQrData({
          qrToken: res.data.qrToken,
          qrDataUrl: res.data.qrDataUrl,
          generatedAt: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t('qr.error_regenerate'));
    } finally {
      setRegenerating(false);
    }
  };

  const emergencyUrl = qrData ? `${window.location.origin}/emergency/${qrData.qrToken}` : '';

  if (loading) {
    return <QRSkeleton />;
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchQR}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            {t('qr.buttons.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="max-w-2xl mx-auto space-y-6" aria-labelledby="qr-title">
      {/* Header */}
      <div>
        <h1 id="qr-title" className="text-2xl font-bold text-gray-900">{t('qr.title')}</h1>
        <p className="text-gray-600 mt-1">
          {t('qr.subtitle')}
        </p>
      </div>

      {/* QR Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-vida-600 to-vida-700 text-white p-6 text-center">
          <h2 className="text-xl font-semibold">{t('qr.card.header_title')}</h2>
          <p className="text-vida-100 text-sm">{t('qr.card.header_subtitle')}</p>
        </div>

        <div className="p-8 flex flex-col items-center">
          {qrData && (
            <>
              {/* QR Code — animated reveal */}
              <QRReveal glow>
                <div
                  className="bg-white p-4 rounded-xl shadow-lg border-4 border-vida-100 mb-6"
                  role="img"
                  aria-label={t('qr.card.qrAlt', { defaultValue: 'Código QR de emergencia médica VIDA' })}
                >
                  <QRCodeSVG
                    value={emergencyUrl}
                    size={250}
                    level="H"
                    includeMargin={true}
                    fgColor="#000000"
                  />
                </div>
              </QRReveal>

              {/* Token info */}
              <p className="text-sm text-gray-700 font-mono mb-2">
                {t('qr.card.token_label')} {qrData.qrToken}
              </p>
              <button
                onClick={() => navigator.clipboard.writeText(emergencyUrl)}
                className="text-sm text-vida-600 hover:text-vida-800 underline mb-4"
              >
                {t('qr.buttons.copy_link', { defaultValue: 'Copiar enlace' })}
              </button>

              {/* Generated date */}
              <p className="text-sm text-gray-500 mb-6">
                {t('qr.card.generated_label')} {formatDateTime(qrData.generatedAt)}
              </p>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              aria-busy={regenerating}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
            >
              {regenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" aria-hidden="true"></div>
                  {t('qr.buttons.regenerating')}
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {t('qr.buttons.regenerate')}
                </>
              )}
            </button>

            <button
              onClick={() => {
                if (qrData?.qrDataUrl) {
                  const link = document.createElement('a');
                  link.href = qrData.qrDataUrl;
                  link.download = 'mi-codigo-qr-vida.png';
                  link.click();
                }
              }}
              className="px-4 py-2 bg-vida-600 text-white rounded-lg hover:bg-vida-700 flex items-center gap-2"
            >
              <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {t('qr.buttons.download')}
            </button>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <aside className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <h3 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
          <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {t('qr.instructions.title')}
        </h3>
        <ul className="text-amber-700 space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <span className="font-bold">1.</span>
            {t('qr.instructions.step_1')}
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">2.</span>
            {t('qr.instructions.step_2')}
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">3.</span>
            {t('qr.instructions.step_3')}
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">4.</span>
            {t('qr.instructions.step_4')}
          </li>
        </ul>
      </aside>

      {/* Security note */}
      <aside className="bg-gray-50 border border-gray-200 rounded-xl p-6">
        <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
          <AnimatedIcon icon={ShieldAlert} trigger="inView" animation="pulse" size={20} className="w-5 h-5 text-gray-600" />
          {t('qr.security.title')}
        </h3>
        <p className="text-gray-600 text-sm">
          {t('qr.security.text')}
        </p>
      </aside>

      <ConfirmDialog
        open={regenConfirmOpen}
        onOpenChange={setRegenConfirmOpen}
        title={t('qr.confirm_regenerate_title', { defaultValue: 'Regenerar código QR' })}
        description={t('qr.confirm_regenerate', { defaultValue: 'El código QR anterior dejará de funcionar. ¿Continuar?' })}
        confirmLabel={t('qr.buttons.regenerate', { defaultValue: 'Regenerar' })}
        variant="destructive"
        onConfirm={doRegenerate}
      />

      {/* NFC Option */}
      <Link
        to="/nfc"
        className="block bg-gradient-to-r from-sky-50 to-vida-50 border border-sky-200 rounded-xl p-6 hover:shadow-md transition"
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white rounded-xl shadow-sm flex items-center justify-center" aria-hidden="true">
            <svg className="w-8 h-8 text-vida-600" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              {t('qr.nfc.title')}
              <span className="text-xs bg-vida-100 text-vida-700 px-2 py-0.5 rounded-full">{t('qr.nfc.badge')}</span>
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {t('qr.nfc.description')}
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
