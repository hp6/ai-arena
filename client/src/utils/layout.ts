import { CELL_SIZE, DISPLAY_COLS, DISPLAY_ROWS, GAME_OFFSET, GRID_WIDTH, GRID_HEIGHT } from "@ai-arena/shared";

export interface Layout {
  portrait: boolean;
  width: number;
  height: number;
  margin: number;
  /** Every font size and hand-tuned gap is multiplied by this, so one knob sets the whole scale */
  textScale: number;
  /** Tiles of map drawn, and how many of them are scenery before the playable grid starts */
  viewCols: number;
  viewRows: number;
  gridPad: number;
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
  viewCols: DISPLAY_COLS,
  viewRows: DISPLAY_ROWS,
  gridPad: GAME_OFFSET,
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

// A phone has no room for two tiles of scenery around the board: half a tile still frames it
const PORTRAIT_GRID_PAD = 0.5;
const PORTRAIT_COLS = GRID_WIDTH + PORTRAIT_GRID_PAD * 2;
const PORTRAIT_ROWS = GRID_HEIGHT + PORTRAIT_GRID_PAD * 2;
const PORTRAIT_ARENA_W = PORTRAIT_COLS * CELL_SIZE;
const PORTRAIT_ARENA_H = PORTRAIT_ROWS * CELL_SIZE;

// Just enough edge padding to keep the arena border off the screen edge: the board should own the width
const PORTRAIT_MARGIN = 10;
const PORTRAIT_W = PORTRAIT_ARENA_W + PORTRAIT_MARGIN * 2;

// Phone text has to survive the canvas being scaled down to the screen. This canvas renders at
// roughly two thirds size on a 390px phone, which puts a 11px log line near 12 real pixels.
const SCALE = 1.65;

const HEADER_Y = 14;
const HEADER_LINE = Math.round(13 * SCALE * 1.4);
const PORTRAIT_ARENA_Y = HEADER_Y + HEADER_LINE * 3 + 10;
const PORTRAIT_BUTTONS_Y = PORTRAIT_ARENA_Y + PORTRAIT_ARENA_H + 20;
// Two wrapped rows of touch-sized buttons
const BUTTON_BLOCK = 2 * Math.round(15 * SCALE * 1.3 + 12 * SCALE + 10);
const PORTRAIT_LOG_Y = PORTRAIT_BUTTONS_Y + BUTTON_BLOCK + 16;
const PORTRAIT_GAP = 16;
// A panel this tall still shows a title and five lines; below that the canvas grows and the screen letterboxes
const MIN_PANEL_H = Math.round(SCALE * (40 + 5 * 16));

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
  viewCols: PORTRAIT_COLS,
  viewRows: PORTRAIT_ROWS,
  gridPad: PORTRAIT_GRID_PAD,
  arenaX: PORTRAIT_MARGIN,
  arenaY: PORTRAIT_ARENA_Y,
  panelX: PORTRAIT_MARGIN,
  panelWidth: PORTRAIT_ARENA_W,
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

/** Size of the drawn map window, board plus its scenery border */
export const ARENA_W = LAYOUT.viewCols * CELL_SIZE;
export const ARENA_H = LAYOUT.viewRows * CELL_SIZE;

/** A font size in landscape pixels, scaled up for phones */
export const TEXT = (px: number) => `${Math.round(px * LAYOUT.textScale)}px`;

/** A gap, padding or line height in landscape pixels, scaled up for phones */
export const UI = (px: number) => Math.round(px * LAYOUT.textScale);

// Text drawn inside the arena competes with the tiles for space, so it grows less than the UI does
const ARENA_SCALE = LAYOUT.portrait ? 1.3 : 1;

/** A font size for text drawn on the board itself (names, HP, damage, speech) */
export const ARENA_TEXT = (px: number) => `${Math.round(px * ARENA_SCALE)}px`;
export const ARENA_UI = (px: number) => Math.round(px * ARENA_SCALE);
