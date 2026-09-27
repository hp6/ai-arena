const STORAGE_KEY = "tiny-ai-arena:muted";

// Phaser's WebAudio `sound.mute` getter lags the setter, so the truth is mirrored here.
let muted = false;
let manager: Phaser.Sound.BaseSoundManager | null = null;

function remember(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // A private window or blocked storage just means the choice lasts one session
  }
}

/** Called once at boot, before anything plays, so a muted visitor never hears the first note. */
export function loadMutePreference(sounds: Phaser.Sound.BaseSoundManager) {
  manager = sounds;
  try {
    muted = localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    muted = false;
  }
  sounds.mute = muted;
}

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  if (manager) manager.mute = value;
  remember(value);
}

export function toggleMute() {
  setMuted(!muted);
  return muted;
}
