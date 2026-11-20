/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          dark: 'var(--color-dark-green)',
          light: 'var(--color-light-green)',
        },
        surface: {
          bg: 'var(--color-bg)',
          card: 'var(--color-white)',
          border: 'var(--color-border)',
        },
        ink: {
          main: 'var(--color-text-main)',
          secondary: 'var(--color-text-secondary)',
        },
        danger: {
          DEFAULT: 'var(--color-error)',
        },
      },
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'Apple SD Gothic Neo',
          'Malgun Gothic',
          'sans-serif',
        ],
      },
      borderRadius: {
        card: '20px',
        modal: '24px',
        control: '16px',
      },
      boxShadow: {
        soft: '0 6px 24px -6px rgba(38, 55, 42, 0.06), 0 2px 8px -2px rgba(38, 55, 42, 0.04)',
        'soft-lg': '0 14px 36px -10px rgba(38, 55, 42, 0.10), 0 4px 12px -4px rgba(38, 55, 42, 0.05)',
        'green-glow': '0 8px 22px -6px rgba(146, 214, 83, 0.45)',
      },
      keyframes: {
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'float-slow': 'floatSlow 4.5s ease-in-out infinite',
        'fade-up': 'fadeUp 0.35s ease-out both',
      },
    },
  },
  plugins: [],
};
