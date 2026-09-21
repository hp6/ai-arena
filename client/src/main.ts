import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { ArenaScene } from "./scenes/ArenaScene";
import { MenuScene } from "./scenes/MenuScene";
import { LAYOUT } from "./utils/layout";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: LAYOUT.width,
  height: LAYOUT.height,
  parent: "game-container",
  backgroundColor: "#161c2e",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, ArenaScene],
};

new Phaser.Game(config);
