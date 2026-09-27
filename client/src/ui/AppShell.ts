import type Phaser from "phaser";
import type { ArenaScene } from "../scenes/ArenaScene";
import { ArenaHud } from "./ArenaHud";
import { MenuView } from "./MenuView";
import { must } from "./dom";

/**
 * Which screen is on show, and the one place scenes are started and stopped. The menu is plain
 * DOM and no longer a Phaser scene, so navigation lives here rather than in `scene.start`.
 */
export class AppShell {
  private readonly arenaScreen = must("#arena-screen");
  private readonly menu: MenuView;
  private hud: ArenaHud | null = null;

  constructor(private readonly game: Phaser.Game) {
    this.menu = new MenuView(
      (gameId) => this.showArena({ gameId }),
      () => this.showArena({ newGame: true }),
    );
  }

  showMenu() {
    // Guarded: stopping a scene that never started would shut down a pending one
    if (this.game.scene.isActive("Arena")) this.game.scene.stop("Arena");
    this.arenaScreen.hidden = true;
    this.menu.show();
  }

  showArena(data: { gameId?: string; newGame?: boolean }) {
    this.menu.hide();
    this.arenaScreen.hidden = false;

    // Built on first use, once Phaser has finished booting and the scene instance exists
    const scene = this.game.scene.getScene("Arena") as ArenaScene;
    this.hud ??= new ArenaHud(scene, () => this.showMenu());

    // The board's box was zero-sized while the screen was hidden, so ask for a refit
    this.game.scale.dirty = true;
    this.game.scene.start("Arena", data);
  }
}
