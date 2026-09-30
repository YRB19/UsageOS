/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'media',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'rgb(var(--canvas) / <alpha-value>)',
        foreground: 'rgb(var(--text) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        border: 'rgb(var(--divider) / <alpha-value>)',
        muted: 'rgb(var(--text-secondary) / <alpha-value>)',
        accent: {
          primary: 'rgb(var(--accent) / <alpha-value>)',
          highlight: '#FF453A',
          secondary: '#FF9500',
        },
      },
      borderRadius: {
        xl: '0.75rem',
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(-4px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'pulse-saved': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'slide-in': 'slide-in 0.2s ease-out forwards',
        'pulse-saved': 'pulse-saved 1.2s ease-in-out',
      },
    },
  },
  plugins: [],
}