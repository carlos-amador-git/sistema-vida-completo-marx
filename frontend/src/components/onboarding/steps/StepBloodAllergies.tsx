import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Droplets, AlertCircle } from 'lucide-react';
import { staggerContainer, staggerItem } from '../../../lib/animations';
import { AnimatedIcon } from '../../ui/AnimatedIcon';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

interface StepProps {
  onNext: () => void;
}

export default function StepBloodAllergies({ onNext: _onNext }: StepProps) {
  const { t } = useTranslation('onboarding');

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-coral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AnimatedIcon icon={Droplets} animation="draw" trigger="mount" size={32} className="w-8 h-8 text-coral-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {t('steps.blood.title', { defaultValue: 'Tipo de sangre y alergias' })}
        </h2>
        <p className="text-gray-500 mt-1 text-sm">
          {t('steps.blood.subtitle', { defaultValue: 'Informacion critica en una emergencia' })}
        </p>
      </div>

      <motion.div variants={staggerItem}>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          {t('steps.blood.bloodType', { defaultValue: 'Tipo de sangre' })}
        </label>
        <div className="grid grid-cols-4 gap-2">
          {BLOOD_TYPES.map(type => (
            <button
              key={type}
              type="button"
              className="px-3 py-3 border-2 border-gray-200 rounded-xl text-center font-semibold text-gray-700 hover:border-coral-400 hover:bg-coral-50 focus:border-coral-500 focus:ring-2 focus:ring-coral-200 transition-all dark:border-gray-600 dark:text-gray-300 dark:hover:border-coral-500"
            >
              {type}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div variants={staggerItem}>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          {t('steps.blood.allergies', { defaultValue: 'Alergias conocidas' })}
        </label>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3 text-gray-500">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm">
              {t('steps.blood.allergiesHint', { defaultValue: 'Podras agregar alergias detalladas en tu perfil' })}
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div variants={staggerItem}>
        <div className="bg-coral-50 dark:bg-coral-900/20 rounded-xl p-4 border border-coral-100 dark:border-coral-800">
          <p className="text-sm text-coral-700 dark:text-coral-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {t('steps.blood.tip', { defaultValue: 'Esta informacion puede salvar tu vida. Los paramedicos la consultan primero.' })}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
