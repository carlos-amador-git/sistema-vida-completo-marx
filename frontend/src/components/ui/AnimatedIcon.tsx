import React, { useEffect } from 'react';
import { motion, useAnimation, useReducedMotion, Variants } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export type AnimationType = 'pulse' | 'draw' | 'spin' | 'bounce' | 'none';
export type TriggerType = 'mount' | 'hover' | 'tap' | 'inView';

interface AnimatedIconProps extends Omit<React.SVGProps<SVGSVGElement>, 'ref'> {
  icon: LucideIcon;
  animation?: AnimationType;
  trigger?: TriggerType;
  size?: number | string;
  className?: string;
}

export function AnimatedIcon({
  icon: Icon,
  animation = 'none',
  trigger = 'hover',
  size = 24,
  className,
  ...props
}: AnimatedIconProps) {
  const controls = useAnimation();
  const prefersReducedMotion = useReducedMotion();

  const variants: Variants = prefersReducedMotion
    ? { pulse: {}, draw: {}, spin: {}, bounce: {}, none: {} }
    : {
        pulse: {
          scale: [1, 1.2, 1],
          transition: { duration: 0.5, ease: 'easeInOut' as any },
        },
        draw: {
          pathLength: [0, 1] as any,
          opacity: [0, 1],
          transition: { duration: 0.6, ease: 'easeOut' as any },
        },
        spin: {
          rotate: 90,
          transition: { duration: 0.3, ease: 'easeInOut' as any },
        },
        bounce: {
          y: [0, -8, 0],
          transition: { duration: 0.4, type: 'spring', stiffness: 300, damping: 15 },
        },
        none: {},
      };

  useEffect(() => {
    if (trigger === 'mount' && animation !== 'none') {
      controls.start(animation);
    }
  }, [trigger, animation, controls]);

  const handleHoverStart = () => {
    if (trigger === 'hover' && animation !== 'none') {
      controls.start(animation);
    }
  };

  const handleHoverEnd = () => {
    if (trigger === 'hover') {
      // Optional: reset or defined exit animation
    }
  };

  const handleTapStart = () => {
    if (trigger === 'tap' && animation !== 'none') {
      controls.start(animation);
    }
  };

  // Render the Lucide icon directly. We wrap it in a motion.div to apply transforms
  // like scale, rotation, or y-translation. Draw animation (pathLength) requires
  // wrapping the actual paths, which is complex with Lucide dynamic imports.
  // For most (pulse, spin, bounce), animating the container is sufficient.

  if (animation === 'draw') {
    // Note: True 'draw' animation requires motion.path which Lucide doesn't expose easily
    // Here we simulate it with a fade/scale if 'draw' is specifically requested on a container
    return (
      <motion.div
        initial={!prefersReducedMotion && (trigger === 'mount' || trigger === 'inView') ? { opacity: 0, scale: 0.8 } : false}
        animate={trigger === 'mount' ? { opacity: 1, scale: 1 } : controls}
        whileInView={!prefersReducedMotion && trigger === 'inView' ? { opacity: 1, scale: 1 } : undefined}
        viewport={{ once: true, margin: '-20px' }}
        onHoverStart={handleHoverStart}
        onHoverEnd={handleHoverEnd}
        onTapStart={handleTapStart}
        className={cn('inline-flex items-center justify-center', className)}
      >
        <Icon size={size} {...props as any} />
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={variants}
      initial="none"
      animate={controls}
      whileInView={!prefersReducedMotion && trigger === 'inView' ? animation : undefined}
      viewport={{ once: true, margin: '-20px' }}
      onHoverStart={handleHoverStart}
      onHoverEnd={handleHoverEnd}
      onTapStart={handleTapStart}
      className={cn('inline-flex items-center justify-center', className)}
    >
      <Icon size={size} {...props as any} />
    </motion.div>
  );
}

export default AnimatedIcon;
