import { motion } from 'framer-motion';

interface MiniProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  className?: string;
  delay?: number;
}

export function MiniProgressBar({
  value,
  max = 100,
  color = 'bg-vida-500',
  className = '',
  delay = 0.3,
}: MiniProgressBarProps) {
  const pct = Math.min((value / max) * 100, 100);

  return (
    <div
      className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden ${className}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <motion.div
        className={`${color} h-2 rounded-full`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut', delay }}
      />
    </div>
  );
}
