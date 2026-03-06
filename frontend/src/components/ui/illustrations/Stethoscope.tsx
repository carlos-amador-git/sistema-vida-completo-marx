import { motion } from 'framer-motion';
import { fadeInUp } from '../../../lib/animations';

export function StethoscopeIllustration({ className = '' }: { className?: string }) {
  return (
    <motion.svg
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      viewBox="0 0 120 120"
      fill="none"
      className={className}
    >
      {/* Body circle */}
      <circle cx="60" cy="60" r="45" className="fill-vida-50 dark:fill-vida-900/20" />

      {/* Stethoscope tube */}
      <path
        d="M45 40c0-8 5-15 15-15s15 7 15 25v15c0 8-5 14-12 14s-12-6-12-14"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        className="stroke-vida-400"
      />

      {/* Earpieces */}
      <circle cx="45" cy="40" r="4" className="fill-vida-500" />
      <circle cx="75" cy="40" r="4" className="fill-vida-500" />

      {/* Chest piece */}
      <circle cx="63" cy="80" r="10" className="fill-coral-100 dark:fill-coral-900/30" />
      <circle cx="63" cy="80" r="6" className="fill-coral-400" />

      {/* Pulse line */}
      <motion.path
        d="M30 95l8-3 4 8 6-15 4 10 6-5 8 3 5-6 4 5 8-2"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        className="stroke-salud-400"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, ease: 'easeInOut' }}
      />
    </motion.svg>
  );
}
