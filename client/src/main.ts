import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { ArenaScene } from "./scenes/ArenaScene";
import { AppShell } from "./ui/AppShell";
import { ARENA_H, ARENA_W } from "./utils/layout";
import "./ui/styles.css";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  // The canvas is exactly the board; CSS decides how big #board is, and FIT does the rest
  width: ARENA_W,
  height: ARENA_H,
  parent: "board",
  backgroundColor: "#161c2e",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // Phaser otherwise rewrites #board's width, height and overflow when it measures zero
    expandParent: false,
    // Integral CSS sizes, which keeps the tile seams from landing on half pixels
    autoRound: true,
    // Phaser polls the parent's size; 500ms lags visibly while a window is being dragged
    resizeInterval: 250,
  },
  input: {
    // Phaser calls preventDefault on every touch event by default, which blocks pinch-zoom.
    // The board only needs taps, so leave the gestures to the browser.
    touch: { capture: false },
  },
  scene: [BootScene, ArenaScene],
};

const game = new Phaser.Game(config);
const shell = new AppShell(game);

// The arena screen starts visible so #board has a real size while Phaser boots; the shell swaps
// to the menu as soon as the assets are in.
game.events.once("boot-complete", () => shell.showMenu());

// FIT only re-measures on a window resize or its own 250ms poll, so nudge it when the box itself
// changes — a layout reflow, a screen swap, a rotation.
const board = document.getElementById("board");
if (board) new ResizeObserver(() => (game.scale.dirty = true)).observe(board);
