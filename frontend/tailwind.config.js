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
          '0%':   { transform: 'scale(0.92)', opacity: '0'   },
          '60%':  { transform: 'scale(1.04)', opacity: '1'   },
          '100%': { transform: 'scale(1)',    opacity: '1'   },
        },
        'streak-glow': {
          '0%, 100%': { boxShadow: '0 0 8px 0px rgba(249,115,22,0.2)'  },
          '50%':      { boxShadow: '0 0 20px 4px rgba(249,115,22,0.45)' },
        },
        'gold-glow': {
          '0%, 100%': { filter: 'drop-shadow(0 0 2px rgba(234,179,8,0.25))' },
          '50%':      { filter: 'drop-shadow(0 0 8px rgba(234,179,8,0.6))'  },
        },
      },
      animation: {
        'winner-pop':    'winner-pop 0.25s ease-out',
        'streak-pulse':  'streak-pulse 1.5s ease-in-out infinite',
        'card-enter':    'card-enter 0.35s ease-out both',
        'duo-form':      'duo-form 0.4s ease-out both',
        'streak-glow':   'streak-glow 2s ease-in-out infinite',
        'gold-glow':     'gold-glow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
