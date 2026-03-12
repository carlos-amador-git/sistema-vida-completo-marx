import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Users, Phone, Shield } from 'lucide-react';
import { staggerContainer, staggerItem } from '../../../lib/animations';
import { AnimatedIcon } from '../../ui/AnimatedIcon';

interface StepProps {
  onNext: () => void;
}

export default function StepEmergencyContacts({ onNext: _onNext }: StepProps) {
  const { t } = useTranslation('onboarding');

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AnimatedIcon icon={Users} animation="draw" trigger="mount" size={32} className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {t('steps.contacts.title', { defaultValue: 'Contactos de emergencia' })}
        </h2>
        <p className="text-gray-500 mt-1 text-sm">
          {t('steps.contacts.subtitle', { defaultValue: 'Personas que seran notificadas en caso de emergencia' })}
        </p>
      </div>

      <motion.div variants={staggerItem}>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <Phone className="w-5 h-5 text-amber-500" />
            <p className="font-medium text-gray-700 dark:text-gray-300">
              {t('steps.contacts.primary', { defaultValue: 'Contacto principal' })}
            </p>
          </div>
          <p className="text-sm text-gray-500 pl-8">
            {t('steps.contacts.primaryHint', { defaultValue: 'Familiar o persona de confianza que sera contactada primero' })}
          </p>
        </div>
      </motion.div>

      <motion.div variants={staggerItem}>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="w-5 h-5 text-vida-500" />
            <p className="font-medium text-gray-700 dark:text-gray-300">
              {t('steps.contacts.representative', { defaultValue: 'Representante legal' })}
            </p>
          </div>
          <p className="text-sm text-gray-500 pl-8">
            {t('steps.contacts.representativeHint', { defaultValue: 'Persona autorizada para tomar decisiones medicas en tu nombre' })}
          </p>
        </div>
      </motion.div>

      <motion.div variants={staggerItem}>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-100 dark:border-amber-800">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {t('steps.contacts.tip', { defaultValue: 'Podras agregar hasta 5 contactos de emergencia desde la seccion de Representantes.' })}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
