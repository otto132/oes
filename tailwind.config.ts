import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg:       'var(--bg)',
        elevated: 'var(--elevated)',
        surface:  'var(--surface)',
        overlay:  'var(--overlay)',
        hover:    'var(--hover)',
        brand:    { DEFAULT: 'var(--brand)', dim: 'var(--brand-dim)', border: 'var(--brand-border)', on: 'var(--brand-on)' },
        border:   { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
        sub:      'var(--sub)',
        muted:    'var(--muted)',
        text:     'var(--text)',
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
        '3xs': ['9px',  '12px'],
        '2xs': ['10px', '14px'],
        'xs':  ['11px', '15px'],
        'sm':  ['12px', '16px'],
        'base':['13px', '18px'],
        'md':  ['14px', '19px'],
        'lg':  ['15px', '20px'],
        'xl':  ['16px', '22px'],
        '2xl': ['18px', '24px'],
        '3xl': ['20px', '26px'],
        '4xl': ['24px', '30px'],
        '5xl': ['28px', '34px'],
        '6xl': ['48px', '1'],
      },
      borderRadius: {
        DEFAULT: '8px',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0,0,0,var(--shadow-opacity))',
        md: '0 4px 12px -2px rgba(0,0,0,calc(var(--shadow-opacity) * 1.3))',
        lg: '0 8px 24px -4px rgba(0,0,0,calc(var(--shadow-opacity) * 1.6))',
        ring: '0 0 0 2px var(--brand-border)',
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
