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
  			// Neobrutalism × FlyRank palette (see DESIGN.md). Token names kept
  			// from the previous system so existing classes recolor in place.
  			paper: '#ffffff',            // card fill
  			surface: {
  				DEFAULT: '#f8f8f8',        // FlyRank whitesmoke canvas
  				soft: '#fcfcfc',
  			},
  			hairline: {
  				DEFAULT: '#e5e5e5',        // inner dividers ONLY — outer borders are ink
  				soft: '#ededed',
  			},
  			charcoal: '#0c1b1b',         // hover state for ink-filled buttons
  			ink: {
  				DEFAULT: '#001820',        // FlyRank dark teal — text, borders, shadows
  				muted: '#425153',          // FlyRank slate
  			},
  			brand: {
  				DEFAULT: '#50e098',        // FlyRank mint — primary accent
  				deep: '#2fbf7b',           // hover darken
  				soft: '#a9efcb',           // tints/washes
  			},
  			mark: {
  				correct: '#1ba673',        // tick — unchanged, already mint-family
  				error: '#e5484d',          // cross — warm red, fits mint + dark teal
  				flag: '#c37d0d',           // low-confidence flag — unchanged
  			},
  			hero: {
  				from: '#87a8c8',           // dead after Task 4 — deleted there
  				to: '#f5e9d8',
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
  		},
  		boxShadow: {
  			// Neobrutalist hard offset shadows — no blur, ink or mint, never #000
  			brut: '4px 4px 0 0 #001820',
  			'brut-sm': '2px 2px 0 0 #001820',
  			'brut-brand': '6px 6px 0 0 #50e098',
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
