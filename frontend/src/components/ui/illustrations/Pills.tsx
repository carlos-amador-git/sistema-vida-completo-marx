import { motion } from 'framer-motion';
import { fadeInUp } from '../../../lib/animations';

export function PillsIllustration({ className = '' }: { className?: string }) {
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

      {/* Pill 1 — capsule */}
      <rect x="35" y="45" width="30" height="14" rx="7" className="fill-coral-400" transform="rotate(-20 50 52)" />
      <rect x="50" y="45" width="15" height="14" rx="7" className="fill-coral-300" transform="rotate(-20 50 52)" />

      {/* Pill 2 — round */}
      <circle cx="75" cy="55" r="10" className="fill-vida-400" />
      <path d="M68 55h14" strokeWidth="1.5" className="stroke-vida-200" />

      {/* Pill 3 — tablet */}
      <rect x="40" y="70" width="18" height="12" rx="4" className="fill-salud-400" />
      <line x1="49" y1="70" x2="49" y2="82" strokeWidth="1" className="stroke-salud-300" />

      {/* Plus sign */}
      <circle cx="85" cy="78" r="12" className="fill-white dark:fill-gray-800 stroke-amber-300" strokeWidth="1.5" />
      <path d="M85 73v10M80 78h10" strokeWidth="2" strokeLinecap="round" className="stroke-amber-500" />
    </motion.svg>
  );
}
