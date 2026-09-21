import { CELL_SIZE, DISPLAY_COLS, DISPLAY_ROWS } from "@ai-arena/shared";

const ARENA_W = DISPLAY_COLS * CELL_SIZE;
const ARENA_H = DISPLAY_ROWS * CELL_SIZE;

export interface Layout {
  portrait: boolean;
  width: number;
  height: number;
  margin: number;
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
}

// Panels sit to the right of the arena, everything on one screen
const landscape: Layout = {
  portrait: false,
  width: 1500,
  height: 980,
  margin: 55,
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
};

const PORTRAIT_W = ARENA_W + 52;
// Match the device's aspect so the canvas fills the screen, but never shorter than the content needs
const PORTRAIT_H = Math.max(1560, Math.round((PORTRAIT_W * window.innerHeight) / Math.max(1, window.innerWidth)));

// Stacked below the arena, detail line, buttons and hint; the two panels split whatever is left
const PORTRAIT_LOG_Y = ARENA_H + 250;
const PORTRAIT_GAP = 16;
const PORTRAIT_PANEL_H = Math.max(200, Math.floor((PORTRAIT_H - 26 - PORTRAIT_LOG_Y - PORTRAIT_GAP) / 2));

// A phone-shaped canvas: arena on top, panels stacked underneath
const portrait: Layout = {
  portrait: true,
  width: PORTRAIT_W,
  height: PORTRAIT_H,
  margin: 26,
  arenaX: 26,
  arenaY: 96,
  panelX: 26,
  panelWidth: ARENA_W,
  logY: PORTRAIT_LOG_Y,
  logHeight: PORTRAIT_PANEL_H,
  chatY: PORTRAIT_LOG_Y + PORTRAIT_PANEL_H + PORTRAIT_GAP,
  chatHeight: PORTRAIT_PANEL_H,
  buttonsY: ARENA_H + 116,
  headerX: 26,
  headerY: 14,
};

/** Chosen once at startup from the window shape; a tall window gets the stacked layout */
export const LAYOUT: Layout = window.innerHeight > window.innerWidth * 1.1 ? portrait : landscape;
