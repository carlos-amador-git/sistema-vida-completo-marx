import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Check, Loader2 } from 'lucide-react';

interface AutoSaveIndicatorProps {
  saving: boolean;
  saved: boolean;
  className?: string;
}

export function AutoSaveIndicator({ saving, saved, className = '' }: AutoSaveIndicatorProps) {
  const { t } = useTranslation('common');

  return (
    <AnimatePresence mode="wait">
      {saving && (
        <motion.div
          key="saving"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className={`flex items-center gap-2 text-xs text-gray-500 ${className}`}
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{t('autoSave.saving', { defaultValue: 'Guardando...' })}</span>
        </motion.div>
      )}
      {saved && !saving && (
        <motion.div
          key="saved"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className={`flex items-center gap-2 text-xs text-salud-600 ${className}`}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 15 }}
          >
            <Check className="w-3.5 h-3.5" />
          </motion.div>
          <span>{t('autoSave.saved', { defaultValue: 'Guardado' })}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
