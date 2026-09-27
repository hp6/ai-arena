import { CELL_SIZE, GRID_WIDTH, GRID_HEIGHT } from "@ai-arena/shared";

/**
 * Board geometry. Everything that is not the board is HTML/CSS now, so there is no page layout
 * to compute here and nothing to compensate for: the canvas *is* the board, and Phaser's FIT
 * scaling sizes it to whatever box the stylesheet gives #board.
 *
 * That also means one framing works everywhere. The old portrait/landscape split existed to buy
 * back pixels on a phone, where the board had to share a fixed canvas with the log, the chat and
 * the buttons; now the board gets its own box at every width and only has to pick how much
 * scenery frames the grid.
 */

/** Tiles of scenery between the canvas edge and the playable 8x8. */
export const GRID_PAD = 1;

export const VIEW_COLS = GRID_WIDTH + GRID_PAD * 2;
export const VIEW_ROWS = GRID_HEIGHT + GRID_PAD * 2;

/** Logical size of the canvas: the drawn map window, board plus its scenery border. */
export const ARENA_W = VIEW_COLS * CELL_SIZE;
export const ARENA_H = VIEW_ROWS * CELL_SIZE;

/**
 * Text drawn on the board (names, HP, damage, speech) is authored in board units, so it scales
 * with the board exactly like the tiles under it. That is right for the tiles and wrong for the
 * text: a phone shows the same 640px board in ~370 real pixels, which would put an 11px name at
 * under 7 real pixels. Board type is nudged up there to land back where it used to read.
 *
 * Read once at module load, like the rest of the board's geometry. Rotating a phone therefore
 * keeps the old scale until the next match is loaded, since a fighter's text is baked when the
 * fighter is built.
 */
const BOARD_TEXT_SCALE = window.matchMedia("(min-width: 900px)").matches ? 1 : 1.45;

export const ARENA_TEXT = (px: number) => `${Math.round(px * BOARD_TEXT_SCALE)}px`;
export const ARENA_UI = (px: number) => Math.round(px * BOARD_TEXT_SCALE);
