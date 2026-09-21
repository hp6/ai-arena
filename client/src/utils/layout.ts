import { CELL_SIZE, DISPLAY_COLS, DISPLAY_ROWS } from "@ai-arena/shared";

const ARENA_W = DISPLAY_COLS * CELL_SIZE;
const ARENA_H = DISPLAY_ROWS * CELL_SIZE;

export interface Layout {
  portrait: boolean;
  width: number;
  height: number;
  margin: number;
  /** Every font size and hand-tuned gap is multiplied by this, so one knob sets the whole scale */
  textScale: number;
  arenaX: number;
  arenaY: number;
  /** Log and chat sit beside the arena in landscape, below it in portrait */
  panelX: number;
  panelWidth: number;
  logY: number;
  logHeight: number;
  chatY: number;
  chatHeight: number;
  buttonsY: number;
  headerX: number;
  headerY: number;
  headerLineHeight: number;
}

// Panels sit to the right of the arena, everything on one screen
const landscape: Layout = {
  portrait: false,
  width: 1500,
  height: 980,
  margin: 55,
  textScale: 1,
  arenaX: 55,
  arenaY: 60,
  panelX: 858,
  panelWidth: 620,
  logY: 10,
  logHeight: 470,
  chatY: 490,
  chatHeight: 470,
  buttonsY: 852,
  headerX: 55,
  headerY: 10,
  headerLineHeight: 18,
};

// Phone text has to survive being scaled down to a ~390px screen, so it starts more than twice as big
const SCALE = 2.2;
// Just enough edge padding to keep the arena border off the screen edge: the arena should own the width
const PORTRAIT_MARGIN = 10;
const PORTRAIT_W = ARENA_W + PORTRAIT_MARGIN * 2;

const HEADER_Y = 14;
const HEADER_LINE = Math.round(13 * SCALE * 1.4);
const PORTRAIT_ARENA_Y = HEADER_Y + HEADER_LINE * 3 + 10;
const PORTRAIT_BUTTONS_Y = PORTRAIT_ARENA_Y + ARENA_H + 20;
// Two wrapped rows of touch-sized buttons
const BUTTON_BLOCK = 2 * Math.round(15 * SCALE * 1.3 + 12 * SCALE + 10);
const PORTRAIT_LOG_Y = PORTRAIT_BUTTONS_Y + BUTTON_BLOCK + 16;
const PORTRAIT_GAP = 16;
// A panel this tall still shows five lines; below that the canvas grows instead and the screen letterboxes
const MIN_PANEL_H = 210;

// The canvas keeps the device's aspect so Phaser's FIT scaling fills the full screen width rather
// than shrinking to satisfy a taller-than-the-screen canvas. Only a squat screen (a tablet held
// upright) falls back to the height the content needs.
const CONTENT_H = PORTRAIT_LOG_Y + MIN_PANEL_H * 2 + PORTRAIT_GAP + PORTRAIT_MARGIN;
const DEVICE_H = Math.round((PORTRAIT_W * window.innerHeight) / Math.max(1, window.innerWidth));
const PORTRAIT_H = Math.max(CONTENT_H, DEVICE_H);

// Whatever is left under the buttons is split between the two panels
const PORTRAIT_PANEL_H = Math.floor((PORTRAIT_H - PORTRAIT_MARGIN - PORTRAIT_LOG_Y - PORTRAIT_GAP) / 2);

// A phone-shaped canvas: arena on top, panels stacked underneath
const portrait: Layout = {
  portrait: true,
  width: PORTRAIT_W,
  height: PORTRAIT_H,
  margin: PORTRAIT_MARGIN,
  textScale: SCALE,
  arenaX: PORTRAIT_MARGIN,
  arenaY: PORTRAIT_ARENA_Y,
  panelX: PORTRAIT_MARGIN,
  panelWidth: ARENA_W,
  logY: PORTRAIT_LOG_Y,
  logHeight: PORTRAIT_PANEL_H,
  chatY: PORTRAIT_LOG_Y + PORTRAIT_PANEL_H + PORTRAIT_GAP,
  chatHeight: PORTRAIT_PANEL_H,
  buttonsY: PORTRAIT_BUTTONS_Y,
  headerX: PORTRAIT_MARGIN,
  headerY: HEADER_Y,
  headerLineHeight: HEADER_LINE,
};

// Only a phone-shaped window gets the stacked layout. A squat one (a tablet held upright) cannot fit
// a full-width arena and two panels below it, so it takes the side-by-side layout and fills its width.
export const LAYOUT: Layout = window.innerHeight > window.innerWidth * 1.6 ? portrait : landscape;

/** A font size in landscape pixels, scaled up for phones */
export const TEXT = (px: number) => `${Math.round(px * LAYOUT.textScale)}px`;

/** A gap, padding or line height in landscape pixels, scaled up for phones */
export const UI = (px: number) => Math.round(px * LAYOUT.textScale);

// Text drawn inside the arena competes with the tiles for space, so it grows less than the UI does
const ARENA_SCALE = LAYOUT.portrait ? 1.7 : 1;

/** A font size for text drawn on the board itself (names, HP, damage, speech) */
export const ARENA_TEXT = (px: number) => `${Math.round(px * ARENA_SCALE)}px`;
export const ARENA_UI = (px: number) => Math.round(px * ARENA_SCALE);
