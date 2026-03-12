import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

export function ThemeToggle({ compact = false, className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  if (compact) {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

    return (
      <button
        onClick={() => setTheme(next)}
        className={cn(
          'inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors',
          className
        )}
        aria-label={`Cambiar tema a ${next}`}
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className={cn('flex items-center gap-1 rounded-lg bg-muted p-1', className)}>
      {[
        { value: 'light' as const, icon: Sun, label: 'Claro' },
        { value: 'dark' as const, icon: Moon, label: 'Oscuro' },
        { value: 'system' as const, icon: Monitor, label: 'Sistema' },
      ].map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={cn(
            'inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
            theme === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          aria-label={label}
          aria-pressed={theme === value}
        >
          <Icon className="h-3.5 w-3.5 mr-1" />
          {label}
        </button>
      ))}
    </div>
  );
}
