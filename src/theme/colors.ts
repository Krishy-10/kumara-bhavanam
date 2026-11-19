/**
 * The palette, in one place. tailwind.config.ts builds its colour names from
 * this, and charts (which need real colour values) read it too, so no
 * component ever writes a hex code.
 */
export const colors = {
  peacock: { DEFAULT: '#0F5E5A', dark: '#0A4441', mist: '#D4E8E4' },
  // deep: marigold darkened for chart marks on white (3:1 contrast, colour-blind safe next to peacock).
  marigold: { DEFAULT: '#F2A93B', glow: '#F7C873', deep: '#C97A14' },
  terracotta: { DEFAULT: '#A8401F', 50: '#FFF1EA', 100: '#F6D9CB' },
  jasmine: '#FFFBF5',
  haldi: '#FFF4E0',
  teak: '#2B1D14',
  muted: '#6E5A4B',
  line: { DEFAULT: '#F0E6D8', strong: '#EADFCF' },
  leaf: '#5BB5A2',
} as const;
