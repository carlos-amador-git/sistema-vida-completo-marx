import type { Variants, Transition } from 'framer-motion';

// ─── Shared transitions ─────────────────────────────────────────────────────

export const springTransition: Transition = {
  type: 'spring',
  stiffness: 350,
  damping: 30,
};

export const easeTransition: Transition = {
  duration: 0.2,
  ease: [0.25, 0.1, 0.25, 1],
};

// ─── Page transition variants ────────────────────────────────────────────────

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export const pageTransition: Transition = {
  duration: 0.2,
  ease: 'easeInOut',
};

// ─── Fade variants ───────────────────────────────────────────────────────────

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 16 },
};

export const fadeInDown: Variants = {
  initial: { opacity: 0, y: -16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
};

// ─── Scale variants ──────────────────────────────────────────────────────────

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: springTransition,
  },
  exit: { opacity: 0, scale: 0.8 },
};

// ─── Slide variants ──────────────────────────────────────────────────────────

export const slideInLeft: Variants = {
  initial: { x: '-100%' },
  animate: { x: 0 },
  exit: { x: '-100%' },
};

export const slideInRight: Variants = {
  initial: { x: '100%' },
  animate: { x: 0 },
  exit: { x: '100%' },
};

export const slideInBottom: Variants = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
};

// ─── Stagger containers ─────────────────────────────────────────────────────

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: easeTransition,
  },
};

// ─── Overlay variants ────────────────────────────────────────────────────────

export const overlayVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const modalVariants: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { ...easeTransition, duration: 0.2 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 10,
    transition: { duration: 0.15 },
  },
};

// ─── Skeleton shimmer (for progressive loading) ──────────────────────────────

export const shimmer: Variants = {
  initial: { opacity: 0.5 },
  animate: {
    opacity: 1,
    transition: {
      duration: 1.5,
      repeat: Infinity,
      repeatType: 'reverse',
      ease: 'easeInOut',
    },
  },
};

// ─── Sprint 1: Onboarding & Micro-interactions ──────────────────────────────

export const shakeVariants: Variants = {
  shake: { x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.3 } },
};

export const checkmarkDraw: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
};

export const stepTransition = {
  enter: (dir: number) => ({ x: dir > 0 ? 200 : -200, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.3, ease: 'easeInOut' as const } },
  exit: (dir: number) => ({ x: dir > 0 ? -200 : 200, opacity: 0, transition: { duration: 0.3, ease: 'easeInOut' as const } }),
};

// ─── Sprint 2: Dashboard & Toasts ───────────────────────────────────────────

export const counterSpring: Transition = { type: 'spring', stiffness: 50, damping: 15 };

export const trendBounce: Variants = {
  initial: { y: 4, opacity: 0 },
  animate: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 400, damping: 10 },
  },
};

// ─── Sprint 4: QR Reveal & Bottom Sheets ────────────────────────────────────

export const revealEffect: Variants = {
  initial: { filter: 'blur(10px)', scale: 0.9, opacity: 0 },
  animate: {
    filter: 'blur(0px)',
    scale: 1,
    opacity: 1,
    transition: { duration: 0.6, ease: 'easeOut' },
  },
};

export const flipVariants: Variants = {
  front: { rotateY: 0 },
  back: { rotateY: 180 },
};

export const glowPulse: Variants = {
  animate: {
    boxShadow: [
      '0 0 20px rgba(59,130,246,0.3)',
      '0 0 40px rgba(59,130,246,0.6)',
      '0 0 20px rgba(59,130,246,0.3)',
    ],
    transition: { duration: 2, repeat: Infinity },
  },
};
