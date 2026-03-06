import { useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, X, Check } from 'lucide-react';
import { useOnboarding } from '../../hooks/useOnboarding';
import { stepTransition } from '../../lib/animations';
import StepPersonalInfo from './steps/StepPersonalInfo';
import StepBloodAllergies from './steps/StepBloodAllergies';
import StepConditionsMeds from './steps/StepConditionsMeds';
import StepEmergencyContacts from './steps/StepEmergencyContacts';
import StepGenerateQR from './steps/StepGenerateQR';
import { AnimatedIcon } from '../ui/AnimatedIcon';

const STEPS = [
  StepPersonalInfo,
  StepBloodAllergies,
  StepConditionsMeds,
  StepEmergencyContacts,
  StepGenerateQR,
];

const STEP_ICONS = ['1', '2', '3', '4', '5'];

export default function OnboardingWizard() {
  const { t } = useTranslation('onboarding');
  const navigate = useNavigate();
  const { currentStep, totalSteps, progress, nextStep, prevStep, skip, complete } = useOnboarding();
  const [direction, setDirection] = useState(1);
  const [showComplete, setShowComplete] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const handleNext = useCallback(() => {
    setDirection(1);
    if (currentStep === totalSteps - 1) {
      setShowComplete(true);
      complete();
      setTimeout(() => navigate('/dashboard'), 1500);
    } else {
      nextStep();
    }
  }, [currentStep, totalSteps, nextStep, complete, navigate]);

  const handlePrev = useCallback(() => {
    setDirection(-1);
    prevStep();
  }, [prevStep]);

  const handleSkip = useCallback(() => {
    skip();
    navigate('/dashboard');
  }, [skip, navigate]);

  const StepComponent = STEPS[currentStep] || STEPS[0];

  return (
    <div className="min-h-dvh bg-gradient-to-br from-vida-50 via-white to-salud-50 dark:from-vida-950 dark:via-background dark:to-salud-950">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {t('title', { defaultValue: 'Configura tu perfil' })}
          </h1>
          <button
            onClick={handleSkip}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 px-3 py-2"
          >
            <X className="w-4 h-4" />
            {t('skip', { defaultValue: 'Omitir' })}
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <ol className="flex items-center justify-between mb-3 list-none">
            {STEP_ICONS.map((icon, i) => (
              <li key={i} className="flex flex-col items-center gap-1">
                <div
                  aria-current={i === currentStep ? 'step' : undefined}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${i < currentStep
                      ? 'bg-salud-500 text-white'
                      : i === currentStep
                        ? 'bg-vida-600 text-white shadow-lg shadow-vida-200'
                        : 'bg-gray-200 text-gray-500 dark:bg-gray-700'
                    }`}
                >
                  {i < currentStep ? (
                    <AnimatedIcon icon={Check} animation="draw" trigger="mount" size={20} className="w-5 h-5 opacity-100" />
                  ) : (
                    icon
                  )}
                </div>
              </li>
            ))}
          </ol>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            aria-label={t('progressLabel', { defaultValue: 'Progreso del perfil médico' })}
            className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden"
          >
            <motion.div
              className="bg-gradient-to-r from-vida-500 to-vida-600 h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2 text-center">
            {t('stepOf', { current: currentStep + 1, total: totalSteps, defaultValue: `Paso ${currentStep + 1} de ${totalSteps}` })}
          </p>
        </div>

        {/* Step content */}
        <div className="relative overflow-hidden min-h-[400px]">
          {showComplete ? (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={prefersReducedMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 200, damping: 15 }}
              className="flex flex-col items-center justify-center h-full py-16"
            >
              <div className="flex items-center justify-center w-20 h-20 rounded-full bg-salud-100 dark:bg-salud-900/30 mb-4">
                <motion.svg
                  width="40" height="40" viewBox="0 0 40 40" fill="none"
                  className="text-salud-600"
                >
                  <motion.path
                    d="M8 20L17 29L32 12"
                    stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={prefersReducedMotion ? { duration: 0.1 } : { duration: 0.5, ease: 'easeOut', delay: 0.2 }}
                  />
                </motion.svg>
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('complete', { defaultValue: '¡Perfil completo!' })}
              </p>
            </motion.div>
          ) : (
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentStep}
                custom={direction}
                variants={prefersReducedMotion
                  ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
                  : stepTransition
                }
                initial="enter"
                animate="center"
                exit="exit"
                className="w-full"
              >
                <StepComponent onNext={handleNext} />
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="flex items-center gap-2 px-4 py-2.5 text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {t('prev', { defaultValue: 'Anterior' })}
          </button>

          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-6 py-2.5 bg-vida-600 text-white rounded-xl hover:bg-vida-700 shadow-lg shadow-vida-200 transition-all hover:shadow-xl"
          >
            {currentStep === totalSteps - 1
              ? t('finish', { defaultValue: 'Finalizar' })
              : t('next', { defaultValue: 'Siguiente' })}
            {currentStep < totalSteps - 1 && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
