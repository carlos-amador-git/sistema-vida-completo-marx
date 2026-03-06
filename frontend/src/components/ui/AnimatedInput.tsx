import { useState, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { shakeVariants } from '../../lib/animations';

interface AnimatedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hasError?: boolean;
}

export const AnimatedInput = forwardRef<HTMLInputElement, AnimatedInputProps>(
  ({ label, error, hasError, className = '', ...props }, ref) => {
    const [focused, setFocused] = useState(false);
    const hasValue = !!props.value || !!props.defaultValue;
    const isFloating = focused || hasValue;
    const showError = hasError || !!error;

    return (
      <motion.div
        className="relative"
        variants={shakeVariants}
        animate={showError ? 'shake' : undefined}
      >
        <input
          ref={ref}
          {...props}
          onFocus={e => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={e => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          className={`peer w-full px-4 pt-6 pb-2 border-2 rounded-xl text-gray-900 dark:text-white bg-white dark:bg-gray-800 outline-none transition-all duration-200 ${
            showError
              ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100'
              : focused
              ? 'border-vida-500 ring-2 ring-vida-100'
              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
          } ${className}`}
          placeholder=" "
        />
        <motion.label
          className={`absolute left-4 pointer-events-none transition-all duration-200 ${
            isFloating
              ? 'top-2 text-xs font-medium'
              : 'top-4 text-sm'
          } ${
            showError
              ? 'text-red-500'
              : focused
              ? 'text-vida-600'
              : 'text-gray-500'
          }`}
          animate={{
            y: isFloating ? 0 : 4,
            scale: isFloating ? 0.85 : 1,
          }}
          transition={{ duration: 0.15 }}
          style={{ originX: 0 }}
        >
          {label}
        </motion.label>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1.5 text-xs text-red-500 pl-1"
          >
            {error}
          </motion.p>
        )}
      </motion.div>
    );
  }
);

AnimatedInput.displayName = 'AnimatedInput';
