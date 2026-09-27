/**
 * The one place the palette lives. `styles.css` mirrors these as custom properties on :root;
 * Phaser needs the same colors as numbers, so both spellings are derived from one table to
 * keep the canvas and the DOM from drifting apart.
 */
const PALETTE = {
  navy: 0x161c2e,
  gold: 0xe8ce91,
  parchment: 0xefe1ab,
  text: 0xd8cfa8,
  muted: 0x8fa39e,
  grass: 0x85b156,
  leaf: 0x93ba4f,
  red: 0xe76161,
  teal: 0x315a6d,
  panel: 0x1e2b38,
  panelDark: 0x1b2531,
  moss: 0x455a4b,
} as const;

export type ColorName = keyof typeof PALETTE;

/** `0x161c2e` — for Phaser, which wants numbers. */
export const COLOR = PALETTE;

/** `"#161c2e"` — for CSS and for Phaser's text styles, which want strings. */
export const CSS_COLOR = Object.fromEntries(
  Object.entries(PALETTE).map(([name, value]) => [name, hex(value)]),
) as Record<ColorName, string>;

/** A fighter color arrives from the server as a decimal int; the DOM needs it as `#rrggbb`. */
export function hex(value: number): string {
  return "#" + value.toString(16).padStart(6, "0");
}

/** Board-only colors, kept beside the palette so there is a single import for all of them. */
export const BOARD_COLOR = {
  HP_BAR_BG: PALETTE.moss,
  HP_BAR_FILL: PALETTE.grass,
  HP_BAR_LOW: PALETTE.red,
};
