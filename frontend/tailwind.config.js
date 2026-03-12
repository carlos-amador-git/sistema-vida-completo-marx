/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // shadcn/ui compatible semantic tokens (backed by CSS vars)
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },

        // Paleta de colores VIDA — referencia variables CSS HSL
        vida: {
          50: 'hsl(var(--vida-50) / <alpha-value>)',
          100: 'hsl(var(--vida-100) / <alpha-value>)',
          200: 'hsl(var(--vida-200) / <alpha-value>)',
          300: 'hsl(var(--vida-300) / <alpha-value>)',
          400: 'hsl(var(--vida-400) / <alpha-value>)',
          500: 'hsl(var(--vida-500) / <alpha-value>)',
          600: 'hsl(var(--vida-600) / <alpha-value>)',
          700: 'hsl(var(--vida-700) / <alpha-value>)',
          800: 'hsl(var(--vida-800) / <alpha-value>)',
          900: 'hsl(var(--vida-900) / <alpha-value>)',
          950: 'hsl(var(--vida-950) / <alpha-value>)',
        },
        // Acento (verde esmeralda médico)
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          light: 'hsl(var(--accent-light) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        // Semánticos
        danger: 'hsl(var(--danger) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        success: 'hsl(var(--success) / <alpha-value>)',
        // Paleta coral — referencia variables CSS HSL (dark mode aware)
        coral: {
          50:  'hsl(var(--coral-50)  / <alpha-value>)',
          100: 'hsl(var(--coral-100) / <alpha-value>)',
          200: 'hsl(var(--coral-200) / <alpha-value>)',
          300: 'hsl(var(--coral-300) / <alpha-value>)',
          400: 'hsl(var(--coral-400) / <alpha-value>)',
          500: 'hsl(var(--coral-500) / <alpha-value>)',
          600: 'hsl(var(--coral-600) / <alpha-value>)',
          700: 'hsl(var(--coral-700) / <alpha-value>)',
          800: 'hsl(var(--coral-800) / <alpha-value>)',
          900: 'hsl(var(--coral-900) / <alpha-value>)',
        },
        // Verde salud — referencia variables CSS HSL (dark mode aware)
        salud: {
          50:  'hsl(var(--salud-50)  / <alpha-value>)',
          100: 'hsl(var(--salud-100) / <alpha-value>)',
          200: 'hsl(var(--salud-200) / <alpha-value>)',
          300: 'hsl(var(--salud-300) / <alpha-value>)',
          400: 'hsl(var(--salud-400) / <alpha-value>)',
          500: 'hsl(var(--salud-500) / <alpha-value>)',
          600: 'hsl(var(--salud-600) / <alpha-value>)',
          700: 'hsl(var(--salud-700) / <alpha-value>)',
          800: 'hsl(var(--salud-800) / <alpha-value>)',
          900: 'hsl(var(--salud-900) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
}
