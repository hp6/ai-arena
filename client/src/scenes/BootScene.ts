import Phaser from "phaser";
import { WARRIOR_COLORS } from "../objects/Fighter";
import { loadMutePreference } from "../utils/sound";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    this.load.json("mapdata", "assets/terrain/map.json");

    // Tile layer tilesets
    this.load.spritesheet("Tilemap_color2", "assets/terrain/Tilemap_color2.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.image("Water_Background_color", "assets/terrain/Water_Background_color.png");
    this.load.spritesheet("Water_Foam", "assets/terrain/Water_Foam.png", {
      frameWidth: 64,
      frameHeight: 64,
    });

    // Object layer tilesets
    this.load.spritesheet("Tree1", "assets/terrain/Tree1.png", {
      frameWidth: 192,
      frameHeight: 256,
    });
    this.load.spritesheet("Tree2", "assets/terrain/Tree2.png", {
      frameWidth: 192,
      frameHeight: 256,
    });
    this.load.spritesheet("Tree3", "assets/terrain/Tree3.png", {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.spritesheet("Stump_1", "assets/terrain/Stump_1.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("Bushe1", "assets/terrain/Bushe1.png", {
      frameWidth: 128,
      frameHeight: 128,
    });
    this.load.spritesheet("Bushe2", "assets/terrain/Bushe2.png", {
      frameWidth: 128,
      frameHeight: 128,
    });

    for (let i = 1; i <= 4; i++) {
      this.load.image(`rock${i}`, `assets/decorations/Rock${i}.png`);
    }

    this.load.audio("footstep", "assets/sounds/footstep.wav");
    this.load.audio("bg_music", "assets/sounds/bg_music.mp3");
    this.load.audio("sword_clash", "assets/sounds/sword_clash.wav");

    for (let i = 1; i <= 4; i++) {
      this.load.image(`cloud${i}`, `assets/decorations/Clouds_0${i}.png`);
    }

    this.load.image("banner_panel", "assets/ui/banner_panel.png");

    this.load.spritesheet("gold", "assets/resources/Gold_Resource_Highlight.png", {
      frameWidth: 128,
      frameHeight: 128,
    });

    for (const color of WARRIOR_COLORS) {
      for (const [anim, file] of [["idle", "Idle"], ["attack1", "Attack1"], ["attack2", "Attack2"]]) {
        this.load.spritesheet(`warrior_${anim}_${color}`, `assets/units/${color}/Warrior_${file}.png`, {
          frameWidth: 192,
          frameHeight: 192,
        });
      }
    }
  }

  create() {
    this.anims.create({
      key: "gold_shine",
      frames: this.anims.generateFrameNumbers("gold", {}),
      frameRate: 10,
      repeat: -1,
      repeatDelay: 1200,
    });

    for (const color of WARRIOR_COLORS) {
      this.anims.create({
        key: `warrior_idle_${color}`,
        frames: this.anims.generateFrameNumbers(`warrior_idle_${color}`, {}),
        frameRate: 10,
        repeat: -1,
      });
      for (const anim of ["attack1", "attack2"]) {
        this.anims.create({
          key: `warrior_${anim}_${color}`,
          frames: this.anims.generateFrameNumbers(`warrior_${anim}_${color}`, {}),
          frameRate: 12,
          repeat: 0,
        });
      }
    }
    loadMutePreference(this);
    // The sound manager is game-wide, so the music keeps looping across scene changes; browsers start it on the first click
    this.sound.play("bg_music", { loop: true, volume: 0.3 });
    this.scene.start("Menu");
  }
}
