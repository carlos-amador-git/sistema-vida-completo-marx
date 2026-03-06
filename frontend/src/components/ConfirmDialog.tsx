// src/components/ConfirmDialog.tsx
import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'destructive' | 'default';
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  onConfirm,
  onOpenChange,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus trap + Escape key
  useEffect(() => {
    if (!open) return;

    cancelRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {title}
        </h2>
        <p id="confirm-dialog-desc" className="text-gray-600 dark:text-gray-400 mb-6">
          {description}
        </p>
        <div className="flex gap-3 justify-end">
          <button
            ref={cancelRef}
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-lg text-gray-700 bg-gray-100 hover:bg-gray-200 font-medium transition focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className={`px-4 py-2 rounded-lg font-medium transition text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              variant === 'destructive'
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                : 'bg-vida-600 hover:bg-vida-700 focus:ring-vida-500'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
