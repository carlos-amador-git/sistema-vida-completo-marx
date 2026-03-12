import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Info, X, Loader2 } from 'lucide-react';
import toast, { Toast } from 'react-hot-toast';

type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

interface CustomToastProps {
  t: Toast;
  type: ToastType;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  progress?: number;
}

const ICON_MAP = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  loading: Loader2,
};

const COLOR_MAP = {
  success: {
    bg: 'bg-salud-50 dark:bg-salud-900/30',
    border: 'border-salud-200 dark:border-salud-800',
    icon: 'text-salud-600',
    bar: 'bg-salud-500',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-900/30',
    border: 'border-red-200 dark:border-red-800',
    icon: 'text-red-600',
    bar: 'bg-red-500',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    border: 'border-amber-200 dark:border-amber-800',
    icon: 'text-amber-600',
    bar: 'bg-amber-500',
  },
  info: {
    bg: 'bg-vida-50 dark:bg-vida-900/30',
    border: 'border-vida-200 dark:border-vida-800',
    icon: 'text-vida-600',
    bar: 'bg-vida-500',
  },
  loading: {
    bg: 'bg-gray-50 dark:bg-gray-800',
    border: 'border-gray-200 dark:border-gray-700',
    icon: 'text-vida-600',
    bar: 'bg-vida-500',
  },
};

export function CustomToast({ t: toastInstance, type, title, description, action, progress }: CustomToastProps) {
  const Icon = ICON_MAP[type];
  const colors = COLOR_MAP[type];
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={prefersReducedMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 350, damping: 25 }}
      className={`${colors.bg} ${colors.border} border rounded-xl shadow-lg max-w-sm w-full overflow-hidden`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <motion.div
            initial={type === 'success' ? { scale: 0 } : undefined}
            animate={type === 'success' ? { scale: 1 } : undefined}
            transition={prefersReducedMotion ? { duration: 0.1 } : { type: 'spring', stiffness: 500, damping: 15, delay: 0.1 }}
          >
            <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${colors.icon} ${type === 'loading' ? 'animate-spin' : ''}`} />
          </motion.div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-gray-900 dark:text-white">{title}</p>
            {description && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{description}</p>
            )}
            {action && (
              <button
                onClick={() => {
                  action.onClick();
                  toast.dismiss(toastInstance.id);
                }}
                className="mt-2 text-xs font-semibold text-vida-600 hover:text-vida-700 transition-colors"
              >
                {action.label}
              </button>
            )}
          </div>
          <button
            onClick={() => toast.dismiss(toastInstance.id)}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0 p-2"
            aria-label="Cerrar notificación"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {progress !== undefined && (
        <div className="h-1 bg-gray-200 dark:bg-gray-700">
          <motion.div
            className={`h-1 ${colors.bar}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}
    </motion.div>
  );
}

// Helper functions
export const vidaToast = {
  success: (title: string, opts?: { description?: string; action?: { label: string; onClick: () => void } }) =>
    toast.custom(t => <CustomToast t={t} type="success" title={title} {...opts} />, { duration: 4000 }),

  error: (title: string, opts?: { description?: string }) =>
    toast.custom(t => <CustomToast t={t} type="error" title={title} {...opts} />, { duration: 5000 }),

  warning: (title: string, opts?: { description?: string }) =>
    toast.custom(t => <CustomToast t={t} type="warning" title={title} {...opts} />, { duration: 4000 }),

  info: (title: string, opts?: { description?: string; action?: { label: string; onClick: () => void } }) =>
    toast.custom(t => <CustomToast t={t} type="info" title={title} {...opts} />, { duration: 4000 }),

  loading: (title: string, opts?: { description?: string; progress?: number }) =>
    toast.custom(t => <CustomToast t={t} type="loading" title={title} {...opts} />, { duration: Infinity }),
};
