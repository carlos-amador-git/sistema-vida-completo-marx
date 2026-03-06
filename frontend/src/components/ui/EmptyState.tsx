// src/components/ui/EmptyState.tsx
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { fadeInUp } from '../../lib/animations';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  /** Lucide-react icon element — rendered at 64 x 64 with muted color */
  icon?: ReactNode;
  /** SVG illustration component (from ui/illustrations/) */
  illustration?: ReactNode;
  /** Short headline shown below the icon */
  title: string;
  /** Optional supporting text */
  description?: string;
  /** Optional call-to-action button */
  action?: EmptyStateAction;
  /** Extra classes applied to the outer wrapper */
  className?: string;
}

export function EmptyState({
  icon,
  illustration,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}
      role="status"
      aria-label={title}
    >
      {illustration && (
        <div className="mb-6 w-28 h-28">
          {illustration}
        </div>
      )}

      {!illustration && icon && (
        <div className="mb-4 flex items-center justify-center w-16 h-16 text-gray-300">
          <span className="[&>svg]:w-16 [&>svg]:h-16 [&>svg]:text-gray-300">{icon}</span>
        </div>
      )}

      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">{title}</h3>

      {description && (
        <p className="text-sm text-gray-500 max-w-sm mb-6">{description}</p>
      )}

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="btn-primary"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
}
