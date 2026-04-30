import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'

const themeUtilities = plugin(({ addUtilities }) => {
  addUtilities({
    '.bg-page':         { 'background-color': 'var(--color-bg)' },
    '.bg-card':         { 'background-color': 'var(--color-surface)' },
    '.bg-raised':       { 'background-color': 'var(--color-raised)' },
    '.bg-input':        { 'background-color': 'var(--color-input)' },
    '.border-default':  { 'border-color': 'var(--color-border)' },
    '.border-subtle':   { 'border-color': 'var(--color-border-subtle)' },
    '.text-default':    { 'color': 'var(--color-text-default)' },
    '.text-secondary':  { 'color': 'var(--color-text-secondary)' },
    '.text-muted':      { 'color': 'var(--color-text-muted)' },
  })
})

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [themeUtilities],
} satisfies Config
