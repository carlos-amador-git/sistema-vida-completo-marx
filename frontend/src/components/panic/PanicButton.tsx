// src/components/panic/PanicButton.tsx
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface PanicButtonProps {
  onPanicActivated?: (result: any) => void;
  onError?: (error: string) => void;
}

// Haptic feedback helper
const vibrate = (pattern: number | number[]) => {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
};

export default function PanicButton({ onPanicActivated, onError }: PanicButtonProps) {
  const { t } = useTranslation('emergency');

  const [isConfirming, setIsConfirming] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Haptic feedback on hold progress milestones
  useEffect(() => {
    if (holdProgress === 25 || holdProgress === 50 || holdProgress === 75) {
      vibrate(30);
    }
    if (holdProgress >= 100) {
      vibrate([100, 50, 100]); // Strong feedback when activated
    }
  }, [holdProgress]);

  // Countdown when confirming
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isConfirming && countdown > 0) {
      vibrate(50); // Tick feedback
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (isConfirming && countdown === 0) {
      activatePanic();
    }
    return () => clearTimeout(timer);
  }, [isConfirming, countdown]);

  // Hold progress
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isHolding) {
      interval = setInterval(() => {
        setHoldProgress((prev) => {
          if (prev >= 100) {
            setIsConfirming(true);
            setIsHolding(false);
            return 0;
          }
          return prev + 4; // ~2.5 seconds to fill
        });
      }, 100);
    } else {
      setHoldProgress(0);
    }
    return () => clearInterval(interval);
  }, [isHolding]);

  const activatePanic = async () => {
    setIsActivating(true);
    vibrate([200, 100, 200, 100, 200]); // Emergency pattern

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        throw new Error(t('panic.button.errors.no_session'));
      }

      // Get current location (optional — alert still sent without GPS)
      let latitude: number | null = null;
      let longitude: number | null = null;
      let accuracy: number | null = null;

      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            reject,
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0,
            }
          );
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
        accuracy = position.coords.accuracy;
      } catch {
        // GPS unavailable — send alert without coordinates
        console.warn('Geolocation unavailable, sending alert without coordinates');
      }

      // Call API - use environment variable for API base URL
      const apiBaseUrl = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiBaseUrl}/emergency/panic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          latitude,
          longitude,
          accuracy,
        }),
      });

      // Check if response is OK before parsing
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = t('panic.button.errors.activation_failed');
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error?.message || errorMessage;
        } catch {
          // Response is not JSON (likely HTML error page)
          console.error('Server returned non-JSON response:', errorText.substring(0, 200));
          errorMessage = `${t('panic.button.errors.server_error')} (${response.status}): ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      // Safely parse JSON response
      const responseText = await response.text();
      if (!responseText) {
        throw new Error(t('panic.button.errors.no_data'));
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        console.error('Invalid JSON response:', responseText.substring(0, 200));
        throw new Error(t('panic.button.errors.invalid_response'));
      }

      if (data.success) {
        onPanicActivated?.(data.data);
      } else {
        throw new Error(data.error?.message || t('panic.button.errors.activation_failed'));
      }
    } catch (error: any) {
      console.error('Error activating panic:', error);
      vibrate(500); // Error feedback
      onError?.(error.message || t('panic.button.errors.could_not_activate'));
    } finally {
      setIsActivating(false);
      setIsConfirming(false);
      setCountdown(3);
    }
  };

  const cancelPanic = useCallback(() => {
    vibrate(100);
    setIsConfirming(false);
    setCountdown(3);
    setIsHolding(false);
    setHoldProgress(0);
  }, []);

  const startHold = useCallback(() => {
    vibrate(30);
    setIsHolding(true);
  }, []);

  const endHold = useCallback(() => {
    setIsHolding(false);
  }, []);

  // Loading state
  if (isActivating) {
    return (
      <div className="fixed bottom-24 md:bottom-8 right-4 md:right-6 z-50">
        <div className="w-20 h-20 md:w-24 md:h-24 bg-red-600 rounded-full flex items-center justify-center shadow-2xl animate-pulse">
          <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Confirmation modal
  if (isConfirming) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl animate-scale-in">
          {/* Countdown circle */}
          <div className="relative w-32 h-32 mx-auto mb-6">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#fee2e2"
                strokeWidth="6"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#dc2626"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray="283"
                strokeDashoffset={283 - (283 * (3 - countdown)) / 3}
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-5xl font-bold text-red-600">{countdown}</span>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('panic.modal.confirming.title')}</h2>
          <p className="text-gray-600 mb-8">
            {t('panic.modal.confirming.description')}
          </p>

          <button
            onClick={cancelPanic}
            className="w-full py-4 bg-gray-100 text-gray-800 rounded-2xl font-semibold text-lg active:bg-gray-200 transition touch-manipulation"
            style={{ minHeight: '56px' }}
          >
            {t('panic.modal.confirming.cancel')}
          </button>
        </div>
      </div>
    );
  }

  // Main button
  return (
    <>
      {/* Expanded overlay */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsExpanded(false)}
        />
      )}

      <div className={`fixed z-50 transition-all duration-300 ${isExpanded
          ? 'bottom-24 right-4 left-4'
          : 'bottom-24 md:bottom-8 right-4 md:right-6'
        }`}>

        {/* Expanded mode - Large button for emergencies */}
        {isExpanded ? (
          <div className="bg-white rounded-3xl p-4 shadow-2xl">
            <p className="text-center text-gray-600 text-sm mb-3">
              {t('panic.button.hold_to_activate')}
            </p>

            <div className="relative flex justify-center">
              {/* Progress ring */}
              <svg className="w-40 h-40 -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="#fecaca"
                  strokeWidth="6"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${holdProgress * 2.83} 283`}
                  className="transition-all duration-100"
                />
              </svg>

              {/* Button */}
              <button
                onTouchStart={startHold}
                onTouchEnd={endHold}
                onTouchCancel={endHold}
                onMouseDown={startHold}
                onMouseUp={endHold}
                onMouseLeave={endHold}
                className={`absolute inset-3 bg-red-600 rounded-full flex items-center justify-center shadow-lg transition-all touch-manipulation ${isHolding ? 'scale-95 bg-red-700' : 'active:scale-95'
                  }`}
                style={{ touchAction: 'none' }}
              >
                <div className="text-center text-white">
                  <svg className="w-12 h-12 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <span className="text-lg font-bold">SOS</span>
                </div>
              </button>
            </div>

            <button
              onClick={() => setIsExpanded(false)}
              className="w-full mt-4 py-3 text-gray-500 font-medium"
            >
              {t('panic.button.close')}
            </button>
          </div>
        ) : (
          /* Compact mode - Floating button */
          <div className="relative">
            {/* Hold instruction tooltip */}
            {isHolding && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-black/90 text-white text-sm px-4 py-2 rounded-xl whitespace-nowrap animate-fade-in">
                {t('panic.button.holding')}
              </div>
            )}

            {/* Progress ring */}
            <svg className="w-20 h-20 md:w-24 md:h-24 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#fecaca"
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#dc2626"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${holdProgress * 2.83} 283`}
                className="transition-all duration-100"
              />
            </svg>

            {/* Button */}
            <button
              onTouchStart={startHold}
              onTouchEnd={endHold}
              onTouchCancel={endHold}
              onMouseDown={startHold}
              onMouseUp={endHold}
              onMouseLeave={endHold}
              onClick={() => !isHolding && setIsExpanded(true)}
              className={`absolute inset-2 bg-red-600 rounded-full flex items-center justify-center shadow-xl transition-all touch-manipulation ${isHolding ? 'scale-95 bg-red-700' : 'active:scale-95 hover:shadow-2xl'
                }`}
              style={{ touchAction: 'none', minWidth: '64px', minHeight: '64px' }}
            >
              <div className="text-center text-white">
                <svg className="w-7 h-7 md:w-8 md:h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="text-[10px] md:text-xs font-bold">SOS</span>
              </div>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
