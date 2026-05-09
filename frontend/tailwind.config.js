/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'winner-pop': {
          '0%':   { transform: 'scale(1)' },
          '40%':  { transform: 'scale(1.06)' },
          '100%': { transform: 'scale(1)' },
        },
        'streak-pulse': {
          '0%, 100%': { transform: 'scale(1)',    opacity: '1'   },
          '50%':      { transform: 'scale(1.35)', opacity: '0.7' },
        },
        'card-enter': {
          '0%':   { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        'duo-form': {
          '0%':   { transform: 'scale(0.92)',  opacity: '0' },
          '60%':  { transform: 'scale(1.025)', opacity: '1' },
          '100%': { transform: 'scale(1)',     opacity: '1' },
        },
        'duo-ring': {
          '0%':   { opacity: '0',    transform: 'scale(0.94)' },
          '35%':  { opacity: '0.9',  transform: 'scale(1)'    },
          '100%': { opacity: '0',    transform: 'scale(1.08)' },
        },
        'duo-snap-top': {
          '0%':   { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',     opacity: '1' },
        },
        'duo-snap-bottom': {
          '0%':   { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        'duo-link-draw': {
          '0%':   { transform: 'scaleX(0)', opacity: '0' },
          '100%': { transform: 'scaleX(1)', opacity: '1' },
        },
        'duo-dot-pop': {
          '0%':   { transform: 'scale(0)', opacity: '0' },
          '60%':  { transform: 'scale(1.4)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'streak-glow': {
          '0%, 100%': { boxShadow: '0 0 8px 0px rgba(249,115,22,0.2)'  },
          '50%':      { boxShadow: '0 0 20px 4px rgba(249,115,22,0.45)' },
        },
        'gold-glow': {
          '0%, 100%': { filter: 'drop-shadow(0 0 2px rgba(234,179,8,0.25))' },
          '50%':      { filter: 'drop-shadow(0 0 8px rgba(234,179,8,0.6))'  },
        },
        'card-exit': {
          '0%':   { transform: 'translateX(0)',     opacity: '1' },
          '100%': { transform: 'translateX(-24px)', opacity: '0' },
        },
        'toast-enter': {
          '0%':   { transform: 'translateY(-14px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',     opacity: '1' },
        },
        'toast-exit': {
          '0%':   { transform: 'translateY(0)',    opacity: '1' },
          '100%': { transform: 'translateY(-8px)', opacity: '0' },
        },
        'tab-slide-left': {
          '0%':   { transform: 'translateX(20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
        'tab-slide-right': {
          '0%':   { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)',     opacity: '1' },
        },
        'my-card-pulse': {
          '0%':   { boxShadow: '0 0 0 3px  rgba(22, 163, 74, 0.55)' },
          '65%':  { boxShadow: '0 0 0 9px  rgba(22, 163, 74, 0.1)'  },
          '100%': { boxShadow: '0 0 0 14px rgba(22, 163, 74, 0)'    },
        },
      },
      animation: {
        'winner-pop':    'winner-pop 0.25s ease-out',
        'streak-pulse':  'streak-pulse 2s ease-in-out infinite',
        'card-enter':    'card-enter 0.35s ease-out both',
        'card-exit':     'card-exit 0.3s ease-in forwards',
        'duo-form':       'duo-form 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'duo-ring':       'duo-ring 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        'duo-snap-top':   'duo-snap-top 0.32s cubic-bezier(0.22, 1, 0.36, 1) 80ms both',
        'duo-snap-bottom':'duo-snap-bottom 0.32s cubic-bezier(0.22, 1, 0.36, 1) 80ms both',
        'duo-link-draw':  'duo-link-draw 0.35s cubic-bezier(0.22, 1, 0.36, 1) 120ms both',
        'duo-dot-pop':    'duo-dot-pop 0.35s cubic-bezier(0.22, 1, 0.36, 1) 240ms both',
        'toast-enter':   'toast-enter 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
        'toast-exit':    'toast-exit 0.18s cubic-bezier(0.7, 0, 0.84, 0) forwards',
        'streak-glow':    'streak-glow 2s ease-in-out infinite',
        'gold-glow':      'gold-glow 2s ease-in-out infinite',
        'tab-slide-left':  'tab-slide-left 0.22s ease-out backwards',
        'tab-slide-right': 'tab-slide-right 0.22s ease-out backwards',
        'my-card-pulse':   'my-card-pulse 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
    },
  },
  plugins: [],
}
