import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { ArenaScene } from "./scenes/ArenaScene";
import { MenuScene } from "./scenes/MenuScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1500,
  height: 980,
  parent: "game-container",
  backgroundColor: "#161c2e",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, ArenaScene],
};

new Phaser.Game(config);
