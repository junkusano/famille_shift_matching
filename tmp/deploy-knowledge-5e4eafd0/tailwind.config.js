/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)',
  			// ===== cm追加 =====
  			'cm-card': '16px',
  			'cm-btn': '8px',
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			// ===== cm追加 =====
  			'cm-primary': {
  				50:  '#f0f7ff',
  				100: '#e0efff',
  				200: '#c7e0ff',
  				300: '#a3cdff',
  				400: '#7ab8ff',
  				500: '#3b82f6',
  				600: '#2563eb',
  				700: '#1d4ed8',
  				800: '#1e40af',
  				900: '#1e3a5f',
  			},
  			'cm-success': '#10b981',
  			'cm-warning': '#f59e0b',
  			'cm-danger':  '#ef4444',
  			'cm-info':    '#06b6d4',
  		},
  		// ===== cm追加 =====
  		fontFamily: {
  			'cm-sans': ['Noto Sans JP', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
  		},
  		width: {
  			'cm-sidebar':      '256px',
  			'cm-sidebar-mini': '80px',
  		},
  		height: {
  			'cm-header': '64px',
  		},
  		boxShadow: {
  			'cm-card': '0 1px 3px rgba(0, 0, 0, 0.05)',
  			'cm-card-hover': '0 4px 12px rgba(0, 0, 0, 0.1)',
  		},
  	}
  },
  plugins: [require("tailwindcss-animate")],
}