// src/components/panic/PanicAlertModal.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import EmergencyMap from '../maps/EmergencyMap';
import { panicAlertFeedback } from '../../utils/notificationFeedback';

interface Hospital {
  id: string;
  name: string;
  type: string;
  address?: string;
  phone?: string;
  emergencyPhone?: string;
  latitude: number;
  longitude: number;
  distance?: number;
}

interface PanicAlertResult {
  alertId: string;
  status: string;
  nearbyHospitals: Hospital[];
  representativesNotified: Array<{
    name: string;
    phone: string;
    smsStatus: 'sent' | 'failed' | 'skipped' | 'pending';
    whatsappStatus: 'sent' | 'failed' | 'skipped' | 'pending';
    emailStatus: 'sent' | 'failed' | 'skipped' | 'pending';
  }>;
  createdAt: string;
}

interface PanicAlertModalProps {
  result: PanicAlertResult;
  userLocation: { lat: number; lng: number };
  onClose: () => void;
  onCancel?: (alertId: string) => void;
}

export default function PanicAlertModal({
  result,
  userLocation,
  onClose,
  onCancel,
}: PanicAlertModalProps) {
  const { t } = useTranslation('emergency');
  const [isCancelling, setIsCancelling] = useState(false);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Reproducir sonido y vibrar al abrir el modal
  useEffect(() => {
    panicAlertFeedback();
  }, []);

  // Focus the close button when modal opens
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Escape key closes the modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Focus trap: keep Tab/Shift+Tab inside the dialog
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  const handleHospitalClick = (hospital: Hospital) => {
    setSelectedHospitalId(hospital.id);
  };

  const getMapCenter = () => {
    if (selectedHospitalId) {
      const hospital = result.nearbyHospitals.find(h => h.id === selectedHospitalId);
      if (hospital) {
        return { lat: hospital.latitude, lng: hospital.longitude };
      }
    }
    return userLocation;
  };

  const handleCancel = async () => {
    if (!onCancel) return;
    setIsCancelling(true);
    try {
      await onCancel(result.alertId);
      onClose();
    } catch (error) {
      console.error('Error cancelling alert:', error);
    } finally {
      setIsCancelling(false);
    }
  };

  const successCount = result.representativesNotified.filter((r) => r.smsStatus === 'sent').length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="panic-alert-modal-title"
        aria-describedby="panic-alert-modal-desc"
        onKeyDown={handleKeyDown}
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-8"
      >
        {/* Header */}
        <div className="bg-red-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center" aria-hidden="true">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div>
              <h2 id="panic-alert-modal-title" className="text-xl font-bold">{t('panic.modal.header.title')}</h2>
              <p id="panic-alert-modal-desc" className="text-red-100 text-sm">{t('panic.modal.header.subtitle')}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Notifications sent */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {t('panic.modal.notifications.title')} ({successCount}/{result.representativesNotified.length})
            </h3>

            {result.representativesNotified.length === 0 ? (
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="font-medium text-amber-900">{t('panic.modal.notifications.no_reps_title')}</p>
                    <p
                      className="text-sm text-amber-700 mt-1"
                      dangerouslySetInnerHTML={{ __html: t('panic.modal.notifications.no_reps_description') }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {result.representativesNotified.map((rep, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between p-3 rounded-lg ${rep.smsStatus === 'sent' ? 'bg-green-50' :
                      rep.smsStatus === 'pending' ? 'bg-blue-50 animate-pulse' : 'bg-red-50'
                      }`}
                  >
                    <div>
                      <p className="font-medium text-gray-900">{rep.name}</p>
                      <p className="text-sm text-gray-500">{rep.phone}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      {rep.smsStatus === 'pending' ? (
                        <span className="text-blue-600 flex items-center gap-1 text-xs">
                          <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" />
                          SMS
                        </span>
                      ) : rep.smsStatus === 'sent' ? (
                        <span className="text-green-600 flex items-center gap-1 text-xs">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          SMS
                        </span>
                      ) : (
                        <span className="text-red-600 flex items-center gap-1 text-xs">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          SMS
                        </span>
                      )}

                      {rep.whatsappStatus === 'pending' ? (
                        <span className="text-blue-600 flex items-center gap-1 text-xs">
                          <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:0.2s]" />
                          WhatsApp
                        </span>
                      ) : rep.whatsappStatus === 'sent' ? (
                        <span className="text-green-600 flex items-center gap-1 text-xs">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          WhatsApp
                        </span>
                      ) : (
                        <span className="text-red-600 flex items-center gap-1 text-xs">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          WhatsApp
                        </span>
                      )}

                      {rep.emailStatus === 'pending' ? (
                        <span className="text-blue-600 flex items-center gap-1 text-xs">
                          <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:0.4s]" />
                          Email
                        </span>
                      ) : rep.emailStatus === 'sent' ? (
                        <span className="text-green-600 flex items-center gap-1 text-xs">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Email
                        </span>
                      ) : rep.emailStatus === 'failed' && (
                        <span className="text-red-600 flex items-center gap-1 text-xs">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Email
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Map with nearby hospitals */}
          {result.nearbyHospitals.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                {t('panic.modal.hospitals.title')}
              </h3>
              <EmergencyMap
                userLocation={getMapCenter()}
                hospitals={result.nearbyHospitals}
                height="250px"
                radiusKm={20}
                onHospitalSelect={handleHospitalClick}
              />

              {/* Hospital list */}
              <div className="mt-4 space-y-2">
                {result.nearbyHospitals.slice(0, 3).map((hospital) => (
                  <div
                    key={hospital.id}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${selectedHospitalId === hospital.id
                        ? 'bg-sky-100 border-2 border-sky-500'
                        : 'bg-sky-50 hover:bg-sky-100'
                      }`}
                    onClick={() => handleHospitalClick(hospital)}
                  >
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{hospital.name}</p>
                      {hospital.distance !== undefined && (
                        <p className="text-xs text-gray-500">
                          {hospital.distance.toFixed(1)} {t('panic.modal.hospitals.distance_unit')}
                        </p>
                      )}
                    </div>
                    {hospital.emergencyPhone && (
                      <a
                        href={`tel:${hospital.emergencyPhone}`}
                        className="flex items-center gap-1 text-sm bg-red-600 text-white px-3 py-1 rounded-full hover:bg-red-700 transition"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        {t('panic.modal.hospitals.call')}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 flex gap-3">
          <button
            onClick={handleCancel}
            disabled={isCancelling}
            aria-label={isCancelling ? t('panic.modal.buttons.cancelling') : t('panic.modal.buttons.cancel_alert')}
            className="flex-1 py-3 bg-gray-200 text-gray-800 rounded-xl font-semibold hover:bg-gray-300 transition disabled:opacity-50"
          >
            {isCancelling ? t('panic.modal.buttons.cancelling') : t('panic.modal.buttons.cancel_alert')}
          </button>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label={t('panic.modal.buttons.close')}
            className="flex-1 py-3 bg-vida-600 text-white rounded-xl font-semibold hover:bg-vida-700 transition"
          >
            {t('panic.modal.buttons.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
