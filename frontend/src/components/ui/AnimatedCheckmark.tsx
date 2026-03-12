import { motion } from 'framer-motion';
import { checkmarkDraw } from '../../lib/animations';

interface AnimatedCheckmarkProps {
  size?: number;
  color?: string;
  className?: string;
}

export function AnimatedCheckmark({
  size = 48,
  color = 'currentColor',
  className = '',
}: AnimatedCheckmarkProps) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      initial="hidden"
      animate="visible"
    >
      <motion.circle
        cx="24"
        cy="24"
        r="20"
        stroke={color}
        strokeWidth="3"
        fill="none"
        variants={checkmarkDraw}
      />
      <motion.path
        d="M14 24l7 7 13-13"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        variants={checkmarkDraw}
        transition={{ delay: 0.3, duration: 0.3 }}
      />
    </motion.svg>
  );
}
