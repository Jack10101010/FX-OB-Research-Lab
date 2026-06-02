/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
    theme: {
        extend: {
            fontFamily: {
                ui:      ['"IBM Plex Sans"', 'Inter', 'system-ui', 'sans-serif'],
                display: ['"IBM Plex Sans"', 'Inter', 'system-ui', 'sans-serif'],
                num:     ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
                mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
                code:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
            },
            fontSize: {
                tiny: ['10px', { lineHeight: '1.2', letterSpacing: '0.08em' }],
                caption: ['11px', { lineHeight: '1.35', letterSpacing: '0.06em' }],
                'body-sm': ['12px', { lineHeight: '1.5' }],
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) + 2px)',
                sm: 'calc(var(--radius) - 2px)',
            },
            colors: {
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                card: {
                    DEFAULT: 'hsl(var(--card))',
                    foreground: 'hsl(var(--card-foreground))',
                },
                popover: {
                    DEFAULT: 'hsl(var(--popover))',
                    foreground: 'hsl(var(--popover-foreground))',
                },
                primary: {
                    DEFAULT: 'hsl(var(--primary))',
                    foreground: 'hsl(var(--primary-foreground))',
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary))',
                    foreground: 'hsl(var(--secondary-foreground))',
                },
                muted: {
                    DEFAULT: 'hsl(var(--muted))',
                    foreground: 'hsl(var(--muted-foreground))',
                },
                accent: {
                    DEFAULT: 'hsl(var(--accent))',
                    foreground: 'hsl(var(--accent-foreground))',
                    primary: 'hsl(var(--accent-primary))',
                    secondary: 'hsl(var(--accent-secondary))',
                    glow: 'hsl(var(--accent-glow))',
                    border: 'hsl(var(--accent-border))',
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive))',
                    foreground: 'hsl(var(--destructive-foreground))',
                },
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                panel: {
                    DEFAULT: 'hsl(var(--panel))',
                    2: 'hsl(var(--panel-2))',
                    3: 'hsl(var(--panel-3))',
                },
                success: 'hsl(var(--success))',
                danger: 'hsl(var(--danger))',
                warning: 'hsl(var(--warning))',
                info: 'hsl(var(--info))',
                bull: 'hsl(var(--bull))',
                bear: 'hsl(var(--bear))',
            },
            keyframes: {
                'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
                'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out',
            },
        },
    },
    plugins: [require("tailwindcss-animate")],
};
