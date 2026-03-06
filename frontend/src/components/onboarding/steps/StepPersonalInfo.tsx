import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { User, Calendar, UserCircle } from 'lucide-react';
import { staggerContainer, staggerItem } from '../../../lib/animations';
import { AnimatedIcon } from '../../ui/AnimatedIcon';

interface StepProps {
  onNext: () => void;
}

export default function StepPersonalInfo({ onNext: _onNext }: StepProps) {
  const { t } = useTranslation('onboarding');

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-vida-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AnimatedIcon icon={User} animation="draw" trigger="mount" size={32} className="w-8 h-8 text-vida-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {t('steps.personal.title', { defaultValue: 'Datos personales' })}
        </h2>
        <p className="text-gray-500 mt-1 text-sm">
          {t('steps.personal.subtitle', { defaultValue: 'Esta informacion aparecera en tu perfil de emergencia' })}
        </p>
      </div>

      <motion.div variants={staggerItem} className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
            <UserCircle className="w-5 h-5 text-vida-500" />
            <div>
              <p className="font-medium">{t('steps.personal.name', { defaultValue: 'Nombre completo' })}</p>
              <p className="text-sm text-gray-500">{t('steps.personal.nameHint', { defaultValue: 'Ya lo tenemos de tu registro' })}</p>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div variants={staggerItem} className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
            <Calendar className="w-5 h-5 text-vida-500" />
            <div>
              <p className="font-medium">{t('steps.personal.dob', { defaultValue: 'Fecha de nacimiento' })}</p>
              <p className="text-sm text-gray-500">{t('steps.personal.dobHint', { defaultValue: 'Importante para calculos medicos' })}</p>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div variants={staggerItem}>
        <div className="bg-vida-50 dark:bg-vida-900/20 rounded-xl p-4 border border-vida-100 dark:border-vida-800">
          <p className="text-sm text-vida-700 dark:text-vida-300">
            {t('steps.personal.tip', { defaultValue: 'Puedes actualizar estos datos en cualquier momento desde tu perfil.' })}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
