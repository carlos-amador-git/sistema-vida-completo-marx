import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, TrendingUp, TrendingDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSpringCounter } from '../../hooks/useSpringCounter';
import { staggerItem } from '../../lib/animations';

interface HealthStatCardProps {
  to: string;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  value?: number;
  valueLabel?: string;
  subtitle?: string;
  progress?: number;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  delay?: number;
  children?: ReactNode;
}

export function HealthStatCard({
  to,
  icon,
  iconBg,
  iconColor,
  title,
  value,
  valueLabel,
  subtitle,
  progress,
  trend,
  trendLabel,
  delay = 0,
  children,
}: HealthStatCardProps) {
  const counter = useSpringCounter(value ?? 0, 800);

  return (
    <motion.div variants={staggerItem} custom={delay}>
      <Link
        to={to}
        className="block card hover:shadow-lg transition-all duration-300 group"
      >
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 ${iconBg} rounded-xl`}>
            <span className={iconColor}>{icon}</span>
          </div>
          <ArrowRight className={`w-5 h-5 text-gray-300 group-hover:${iconColor.replace('text-', 'text-')} transition-colors`} />
        </div>

        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>

        {value !== undefined && (
          <div className="flex items-baseline gap-2 mb-1" ref={counter.ref}>
            <span className="text-2xl font-bold text-gray-900 dark:text-white">
              {counter.value}
            </span>
            {valueLabel && (
              <span className="text-sm text-gray-500">{valueLabel}</span>
            )}
          </div>
        )}

        {subtitle && (
          <p className="text-sm text-gray-500 mb-2">{subtitle}</p>
        )}

        {trend && trendLabel && (
          <motion.div
            className={`flex items-center gap-1 text-xs font-medium ${
              trend === 'up' ? 'text-salud-600' : trend === 'down' ? 'text-coral-600' : 'text-gray-500'
            }`}
            initial={{ y: 4, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 10, delay: 0.5 + delay }}
          >
            {trend === 'up' && <TrendingUp className="w-3.5 h-3.5" />}
            {trend === 'down' && <TrendingDown className="w-3.5 h-3.5" />}
            {trendLabel}
          </motion.div>
        )}

        {progress !== undefined && (
          <div className="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
            <motion.div
              className="bg-vida-500 h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 + delay }}
            />
          </div>
        )}

        {children}
      </Link>
    </motion.div>
  );
}
