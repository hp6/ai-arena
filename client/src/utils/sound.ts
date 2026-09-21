import Phaser from "phaser";
import { TEXT, UI } from "./layout";

const STORAGE_KEY = "tiny-ai-arena:muted";

// Tracked here because Phaser's WebAudio `sound.mute` getter reads the gain node, which lags behind the setter
let muted = false;

export function loadMutePreference(scene: Phaser.Scene) {
  try {
    muted = localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Storage can be blocked; sound just starts unmuted
  }
  scene.sound.mute = muted;
}

// Mute applies to the game-wide sound manager, so one toggle covers every scene and future music
export function addMuteButton(scene: Phaser.Scene, x: number, y: number, originX: number) {
  const label = () => (muted ? "SOUND: OFF" : "SOUND: ON");
  const button = scene.add
    .text(x, y, label(), {
      fontSize: TEXT(13),
      fontFamily: "monospace",
      fontStyle: "bold",
      color: "#efe1ab",
      backgroundColor: "#315a6d",
      padding: { x: UI(10), y: UI(4) },
    })
    .setOrigin(originX, 0)
    .setInteractive({ useHandCursor: true });

  const toggle = () => {
    muted = !muted;
    scene.sound.mute = muted;
    try {
      localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
    } catch {
      // Preference just won't persist
    }
    button.setText(label());
  };

  button.on("pointerdown", toggle);
  scene.input.keyboard!.on("keydown-M", toggle);
  return button;
}
