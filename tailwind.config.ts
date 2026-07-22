import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			display: ['var(--font-inter)', 'sans-serif'],
  			body: ['var(--font-inter)', 'sans-serif'],
  			mono: ['var(--font-geist-mono)', 'monospace'],
  		},
  		colors: {
  			// Mintlify system (see DESIGN.md). Token names kept from the old
  			// system where components already reference them (paper, ink,
  			// ink-muted, mark-*) so existing classes recolor in place.
  			paper: '#ffffff',            // {colors.canvas}
  			surface: {
  				DEFAULT: '#f7f7f7',        // {colors.surface}
  				soft: '#fafafa',           // {colors.surface-soft}
  			},
  			hairline: {
  				DEFAULT: '#e5e5e5',        // {colors.hairline}
  				soft: '#ededed',           // {colors.hairline-soft}
  			},
  			charcoal: '#1c1c1e',         // {colors.charcoal} — pressed primary
  			ink: {
  				DEFAULT: '#0a0a0a',        // {colors.ink}
  				muted: '#5a5a5c',          // {colors.steel}
  			},
  			brand: {
  				DEFAULT: '#00d4a4',        // {colors.brand-green} — accent only
  				deep: '#00b48a',           // {colors.brand-green-deep}
  				soft: '#7cebcb',           // {colors.brand-green-soft}
  			},
  			mark: {
  				correct: '#1ba673',        // {colors.brand-annotate}
  				error: '#d45656',          // {colors.brand-error}
  				flag: '#c37d0d',           // {colors.brand-warn}
  			},
  			hero: {
  				from: '#87a8c8',           // {colors.hero-sky-from}
  				to: '#f5e9d8',             // {colors.hero-sky-to}
  			},
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
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 4px)',
  			sm: 'calc(var(--radius) - 6px)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
