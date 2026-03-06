import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Pill, Stethoscope } from 'lucide-react';
import { staggerContainer, staggerItem } from '../../../lib/animations';
import { AnimatedIcon } from '../../ui/AnimatedIcon';

interface StepProps {
  onNext: () => void;
}

export default function StepConditionsMeds({ onNext: _onNext }: StepProps) {
  const { t } = useTranslation('onboarding');

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-salud-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AnimatedIcon icon={Stethoscope} animation="draw" trigger="mount" size={32} className="w-8 h-8 text-salud-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {t('steps.conditions.title', { defaultValue: 'Condiciones y medicamentos' })}
        </h2>
        <p className="text-gray-500 mt-1 text-sm">
          {t('steps.conditions.subtitle', { defaultValue: 'Ayuda a los medicos a tomar mejores decisiones' })}
        </p>
      </div>

      <motion.div variants={staggerItem}>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <Stethoscope className="w-5 h-5 text-salud-500" />
            <p className="font-medium text-gray-700 dark:text-gray-300">
              {t('steps.conditions.conditionsLabel', { defaultValue: 'Condiciones medicas' })}
            </p>
          </div>
          <p className="text-sm text-gray-500 pl-8">
            {t('steps.conditions.conditionsHint', { defaultValue: 'Diabetes, hipertension, asma, epilepsia, etc.' })}
          </p>
        </div>
      </motion.div>

      <motion.div variants={staggerItem}>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <Pill className="w-5 h-5 text-amber-500" />
            <p className="font-medium text-gray-700 dark:text-gray-300">
              {t('steps.conditions.medsLabel', { defaultValue: 'Medicamentos actuales' })}
            </p>
          </div>
          <p className="text-sm text-gray-500 pl-8">
            {t('steps.conditions.medsHint', { defaultValue: 'Incluye dosis y frecuencia si es posible' })}
          </p>
        </div>
      </motion.div>

      <motion.div variants={staggerItem}>
        <div className="bg-salud-50 dark:bg-salud-900/20 rounded-xl p-4 border border-salud-100 dark:border-salud-800">
          <p className="text-sm text-salud-700 dark:text-salud-300">
            {t('steps.conditions.tip', { defaultValue: 'Podras agregar detalles completos desde la seccion de Perfil Medico.' })}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
