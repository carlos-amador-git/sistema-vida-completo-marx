/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
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
        },
        // Semánticos
        danger: 'hsl(var(--danger) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        success: 'hsl(var(--success) / <alpha-value>)',
        // Paleta coral — referencia semántica peligro
        coral: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
          900: '#881337',
        },
        // Verde salud
        salud: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
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
      },
    },
  },
  plugins: [],
}
