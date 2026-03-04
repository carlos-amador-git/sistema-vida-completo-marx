// src/components/ui/EmptyState.tsx
import type { ReactNode } from 'react';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  /** Lucide-react icon element — rendered at 64 x 64 with muted color */
  icon?: ReactNode;
  /** Short headline shown below the icon */
  title: string;
  /** Optional supporting text */
  description?: string;
  /** Optional call-to-action button */
  action?: EmptyStateAction;
  /** Extra classes applied to the outer wrapper */
  className?: string;
}

/**
 * Generic empty-state component.
 *
 * Usage:
 *   <EmptyState
 *     icon={<Shield />}
 *     title="No hay accesos registrados"
 *     description="Cuando alguien acceda a tu información de emergencia aparecerá aquí."
 *     action={{ label: 'Ver QR de emergencia', onClick: () => navigate('/emergency-qr') }}
 *   />
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}
      role="status"
      aria-label={title}
    >
      {icon && (
        <div className="mb-4 flex items-center justify-center w-16 h-16 text-gray-300">
          {/* Clone-like trick: wrap icon in a sized container; callers pass e.g. <Shield className="w-full h-full" /> */}
          <span className="[&>svg]:w-16 [&>svg]:h-16 [&>svg]:text-gray-300">{icon}</span>
        </div>
      )}

      <h3 className="text-lg font-medium text-gray-900 mb-1">{title}</h3>

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
    </div>
  );
}
