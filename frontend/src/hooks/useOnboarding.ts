import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'vida-onboarding';
const TOTAL_STEPS = 5;

interface OnboardingState {
  currentStep: number;
  completed: boolean;
  skipped: boolean;
}

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { currentStep: 0, completed: false, skipped: false };
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const nextStep = useCallback(() => {
    setState(prev => {
      const next = prev.currentStep + 1;
      if (next >= TOTAL_STEPS) return { ...prev, currentStep: next, completed: true };
      return { ...prev, currentStep: next };
    });
  }, []);

  const prevStep = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentStep: Math.max(0, prev.currentStep - 1),
    }));
  }, []);

  const goToStep = useCallback((step: number) => {
    setState(prev => ({ ...prev, currentStep: Math.min(step, TOTAL_STEPS - 1) }));
  }, []);

  const skip = useCallback(() => {
    setState({ currentStep: 0, completed: false, skipped: true });
  }, []);

  const complete = useCallback(() => {
    setState(prev => ({ ...prev, completed: true }));
  }, []);

  const reset = useCallback(() => {
    setState({ currentStep: 0, completed: false, skipped: false });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const progress = ((state.currentStep) / TOTAL_STEPS) * 100;
  const direction = 1; // default forward

  return {
    ...state,
    totalSteps: TOTAL_STEPS,
    progress,
    direction,
    nextStep,
    prevStep,
    goToStep,
    skip,
    complete,
    reset,
    needsOnboarding: !state.completed && !state.skipped,
  };
}
