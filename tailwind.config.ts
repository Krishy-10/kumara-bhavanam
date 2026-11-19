import type { Config } from 'tailwindcss';

/**
 * Design tokens from the PRD's Build notes. Components use these names only,
 * never raw hex. The extra shades (mist, glow, 50/100, strong, leaf) are taken
 * from the design file, which uses them for text on peacock, the owed card,
 * stronger borders and the "free" marker.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        peacock: { DEFAULT: '#0F5E5A', dark: '#0A4441', mist: '#D4E8E4' },
        marigold: { DEFAULT: '#F2A93B', glow: '#F7C873' },
        terracotta: { DEFAULT: '#A8401F', 50: '#FFF1EA', 100: '#F6D9CB' },
        jasmine: '#FFFBF5',
        haldi: '#FFF4E0',
        teak: '#2B1D14',
        muted: '#6E5A4B',
        line: { DEFAULT: '#F0E6D8', strong: '#EADFCF' },
        leaf: '#5BB5A2',
      },
      fontFamily: {
        // Anek Tamil: headings and every number. Hind Madurai: body.
        display: ['"Anek Tamil"', 'system-ui', 'sans-serif'],
        body: ['"Hind Madurai"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '22px',
        hero: '28px',
        btn: '20px',
      },
      minHeight: {
        touch: '48px',
        primary: '60px',
      },
      minWidth: {
        touch: '48px',
      },
      maxWidth: {
        app: '480px',
      },
    },
  },
  plugins: [],
} satisfies Config;
