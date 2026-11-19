import type { Config } from 'tailwindcss';
import { colors } from './src/theme/colors';

/**
 * Design tokens from the PRD's Build notes. Components use these names only,
 * never raw hex (values live in src/theme/colors.ts). The extra shades (mist, glow, 50/100, strong, leaf) are taken
 * from the design file, which uses them for text on peacock, the owed card,
 * stronger borders and the "free" marker.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors,
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
