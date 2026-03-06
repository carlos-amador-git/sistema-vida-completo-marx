import { motion } from 'framer-motion';
import { fadeInUp } from '../../../lib/animations';

export function ContactsIllustration({ className = '' }: { className?: string }) {
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
      <circle cx="60" cy="60" r="45" className="fill-amber-50 dark:fill-amber-900/20" />

      {/* Person 1 (center, primary) */}
      <circle cx="60" cy="45" r="12" className="fill-vida-200 dark:fill-vida-800" />
      <circle cx="60" cy="38" r="6" className="fill-vida-400" />
      <path d="M48 58c0-6.627 5.373-12 12-12s12 5.373 12 12" className="fill-vida-300 dark:fill-vida-700" />

      {/* Person 2 (left, secondary) */}
      <circle cx="35" cy="62" r="8" className="fill-salud-100 dark:fill-salud-900/30" />
      <circle cx="35" cy="58" r="4" className="fill-salud-300" />
      <path d="M28 68c0-3.866 3.134-7 7-7s7 3.134 7 7" className="fill-salud-200 dark:fill-salud-800" />

      {/* Person 3 (right, secondary) */}
      <circle cx="85" cy="62" r="8" className="fill-coral-100 dark:fill-coral-900/30" />
      <circle cx="85" cy="58" r="4" className="fill-coral-300" />
      <path d="M78 68c0-3.866 3.134-7 7-7s7 3.134 7 7" className="fill-coral-200 dark:fill-coral-800" />

      {/* Connection lines */}
      <motion.path
        d="M48 55l-8 8M72 55l8 8"
        strokeWidth="1.5"
        strokeDasharray="3 3"
        className="stroke-gray-300 dark:stroke-gray-600"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, delay: 0.3 }}
      />

      {/* Phone icon */}
      <rect x="50" y="75" width="20" height="12" rx="3" className="fill-vida-100 dark:fill-vida-900/30" />
      <circle cx="60" cy="81" r="2" className="fill-vida-400" />
    </motion.svg>
  );
}
