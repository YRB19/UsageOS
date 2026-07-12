/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0f0e17',
        foreground: '#fffffe',
        card: '#1f2937',
        border: '#374151',
        muted: '#a7a9be',
        accent: {
          primary: '#ff8906',
          highlight: '#f25f4c',
          secondary: '#e53170',
        },
      },
      borderRadius: {
        xl: '0.75rem',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
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