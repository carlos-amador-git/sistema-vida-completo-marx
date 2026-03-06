import { motion } from 'framer-motion';
import { fadeInUp } from '../../../lib/animations';

export function ShieldIllustration({ className = '' }: { className?: string }) {
  return (
    <motion.svg
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      viewBox="0 0 120 120"
      fill="none"
      className={className}
    >
      {/* Background */}
      <circle cx="60" cy="60" r="45" className="fill-coral-50 dark:fill-coral-900/20" />

      {/* Shield shape */}
      <motion.path
        d="M60 20L30 35v25c0 20 12 35 30 42 18-7 30-22 30-42V35L60 20z"
        className="fill-coral-100 dark:fill-coral-900/30"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
      <path
        d="M60 25L35 38v22c0 17 10 30 25 36 15-6 25-19 25-36V38L60 25z"
        className="fill-white dark:fill-gray-800 stroke-coral-200 dark:stroke-coral-700"
        strokeWidth="1.5"
      />

      {/* Heart inside shield */}
      <motion.path
        d="M60 50c-3-6-10-7-13-3s-2 10 13 20c15-10 16-16 13-20s-10-3-13 3z"
        className="fill-coral-400"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 300 }}
      />

      {/* Document lines */}
      <rect x="50" y="72" width="20" height="3" rx="1.5" className="fill-coral-200 dark:fill-coral-800" />
      <rect x="53" y="78" width="14" height="3" rx="1.5" className="fill-coral-200 dark:fill-coral-800" />
    </motion.svg>
  );
}
