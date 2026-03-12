import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg:       '#09090b',
        elevated: '#111113',
        surface:  '#18181b',
        overlay:  '#1e1e22',
        hover:    '#1c1c20',
        brand:    { DEFAULT: '#3ecf8e', dim: 'rgba(62,207,142,0.06)', border: 'rgba(62,207,142,0.15)' },
        border:   { DEFAULT: '#27272a', strong: '#3f3f46' },
        sub:      '#a1a1aa',
        muted:    '#52525b',
        text:     '#fafafa',
        danger:   '#ef4444',
        warn:     '#eab308',
        info:     '#60a5fa',
        purple:   '#a78bfa',
        teal:     '#2dd4bf',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        '3xs': ['9px', '12px'],
      },
      borderRadius: {
        DEFAULT: '8px',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0,0,0,0.3)',
        md: '0 4px 12px -2px rgba(0,0,0,0.4)',
        lg: '0 8px 24px -4px rgba(0,0,0,0.5)',
        ring: '0 0 0 2px rgba(62,207,142,0.15)',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease both',
        'slide-up': 'slideUp 0.2s cubic-bezier(0.16,1,0.3,1) both',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
export default config;
