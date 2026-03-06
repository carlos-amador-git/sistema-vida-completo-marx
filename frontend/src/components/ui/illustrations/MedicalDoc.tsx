import { motion } from 'framer-motion';
import { fadeInUp } from '../../../lib/animations';

export function MedicalDocIllustration({ className = '' }: { className?: string }) {
  return (
    <motion.svg
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      viewBox="0 0 120 120"
      fill="none"
      className={`${className}`}
    >
      {/* Document base */}
      <rect x="25" y="15" width="70" height="90" rx="8" className="fill-vida-100 dark:fill-vida-900/30" />
      <rect x="30" y="20" width="60" height="80" rx="6" className="fill-white dark:fill-gray-800 stroke-vida-200 dark:stroke-vida-700" strokeWidth="1.5" />

      {/* Header line */}
      <rect x="40" y="30" width="40" height="4" rx="2" className="fill-vida-400" />

      {/* Content lines */}
      <rect x="40" y="42" width="35" height="3" rx="1.5" className="fill-gray-200 dark:fill-gray-600" />
      <rect x="40" y="50" width="28" height="3" rx="1.5" className="fill-gray-200 dark:fill-gray-600" />
      <rect x="40" y="58" width="32" height="3" rx="1.5" className="fill-gray-200 dark:fill-gray-600" />

      {/* Cross icon */}
      <circle cx="85" cy="80" r="14" className="fill-salud-100 dark:fill-salud-900/30" />
      <path d="M85 72v16M77 80h16" strokeWidth="2.5" strokeLinecap="round" className="stroke-salud-500" />
    </motion.svg>
  );
}
