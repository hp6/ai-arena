import Phaser from "phaser";
import type { GameFrame, FighterState, ArenaConfig, TurnLogEntry } from "@ai-arena/shared";
import { Arena } from "../objects/Arena";
import { Fighter } from "../objects/Fighter";
import { hex } from "../ui/theme";

import { API_BASE, framesUrl, gameUrl } from "../utils/api";

import { ARENA_H, ARENA_TEXT, ARENA_W } from "../utils/layout";

const POLL_INTERVAL = 1500;
const AUTO_PLAY_INTERVAL = 400;

/** How a status line should read: plain, good news, a caveat, or a failure. */
export type StatusTone = "muted" | "ok" | "warn" | "error";

export interface FrameEvent {
  index: number;
  total: number;
  round: number;
}

export interface StatusEvent {
  text: string;
  tone: StatusTone;
}

export interface LogLine {
  text: string;
  kind: TurnLogEntry["actionType"];
}

export interface ChatLine {
  who: string;
  color: string;
  text: string;
}

/**
 * A feed update. The HUD drops everything from `from` onward, then appends `lines` — which makes
 * stepping forward an append of one line and stepping back a truncation, rather than a rebuild.
 */
export interface FeedEvent<T> {
  lines: T[];
  from: number;
  /** Index of the entry that is "now"; -1 when the feed is empty. Only the log uses it. */
  current: number;
}

/**
 * Renders the board and owns playback. Everything else — the header, the buttons, the log and the
 * chat — is DOM, and hears about changes through the events below rather than being drawn here.
 *
 * Events: `frame` (FrameEvent), `status` (StatusEvent), `log` (FeedEvent<LogLine>),
 * `chat` (FeedEvent<ChatLine>), `autoplay` (boolean).
 */
export class ArenaScene extends Phaser.Scene {
  private arena?: Arena;
  // Bumped whenever the scene (re)starts or leaves, so late fetch responses from an old visit are ignored
  private session = 0;
  private fighters: Fighter[] = [];
  private frames: GameFrame[] = [];
  private currentFrame = 0;
  private gameId: string | null = null;
  private gameFinished = false;
  private autoPlaying = false;
  private autoPlayTimer: Phaser.Time.TimerEvent | null = null;
  private pollTimer: Phaser.Time.TimerEvent | null = null;

  /** Every chat line in frame order, with `chatPrefix[i]` counting those said through frame i. */
  private chatLines: ChatLine[] = [];
  private chatPrefix: number[] = [];
  private indexedFrames = 0;

  // How many entries the DOM feeds currently hold, so an update can be a delta
  private renderedLog = 0;
  private renderedChat = 0;

  constructor() {
    super("Arena");
  }

  create(data: { gameId?: string; newGame?: boolean }) {
    this.session++;
    this.arena = undefined;
    this.fighters = [];
    this.frames = [];
    this.currentFrame = 0;
    this.gameId = null;
    this.gameFinished = false;
    this.autoPlaying = false;
    this.autoPlayTimer = null;
    this.pollTimer = null;
    this.resetFeeds();

    this.addArenaTapTarget();
    this.events.emit("autoplay", false);

    if (data?.newGame) this.startNewGame();
    else if (data?.gameId) this.loadGame(data.gameId);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.session++;
      this.stopPolling();
      this.stopAutoPlay();
    });
  }

  /** A touch screen has no arrow keys, so tapping the board steps forward exactly like NEXT */
  private addArenaTapTarget() {
    if (!this.sys.game.device.input.touch) return;
    this.add
      .zone(0, 0, ARENA_W, ARENA_H)
      .setOrigin(0)
      .setInteractive()
      .on("pointerup", (pointer: Phaser.Input.Pointer) => {
        // Not while a second finger is still down (a pinch-zoom), and not after a drag
        const touches = (pointer.event as TouchEvent).touches;
        if (touches && touches.length > 0) return;
        if (pointer.getDistance() > 12) return;
        this.stepForward();
      });
  }

  private status(text: string, tone: StatusTone) {
    this.events.emit("status", { text, tone } satisfies StatusEvent);
  }

  // ---- SERVER COMMUNICATION ----

  private async loadGame(gameId: string) {
    this.stopAutoPlay();
    this.stopPolling();

    const session = this.session;
    try {
      const metaResp = await fetch(gameUrl(gameId));
      if (!metaResp.ok) return;
      const meta = await metaResp.json();

      const framesResp = await fetch(framesUrl(gameId, -1));
      if (!framesResp.ok) return;
      const framesData = await framesResp.json();
      if (session !== this.session) return;

      this.setupGame(meta, framesData.frames);

      this.gameFinished = meta.status !== "running";
      if (!this.gameFinished) this.startPolling();
    } catch {
      if (session !== this.session) return;
      this.status("Failed to load game!", "error");
    }
  }

  async startNewGame() {
    this.stopAutoPlay();
    this.stopPolling();
    this.status("Creating game…", "muted");

    const session = this.session;
    try {
      const resp = await fetch(`${API_BASE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await resp.json();
      if (session !== this.session) return;

      if (resp.status === 409) {
        await this.loadGame(data.runningGameId);
        if (session !== this.session) return;
        this.status(data.error ?? "Too many games running", "warn");
        return;
      }

      this.setupGame(data, []);
      this.status(`Game ${data.id} — AI running…`, "warn");

      await this.pollFrames();
      this.startPolling();
    } catch {
      if (session !== this.session) return;
      this.status("Failed to connect to server!", "error");
    }
  }

  private setupGame(
    data: { id: string; fighters: FighterState[]; arena: ArenaConfig; status?: string },
    frames: GameFrame[],
  ) {
    this.gameId = data.id;
    this.gameFinished = data.status === "finished" || data.status === "interrupted";
    this.frames = frames;
    this.resetFeeds();

    for (const f of this.fighters) f.destroy();
    this.arena?.destroy();

    const arena = new Arena(this, data.arena.obstacles, data.arena.gold ?? null);
    this.arena = arena;

    this.fighters = [];
    for (const fs of data.fighters) {
      const worldPos = arena.gridToWorld(fs.position.x, fs.position.y);
      const fighter = new Fighter(this, fs.id, fs.name, worldPos.x, worldPos.y, fs.color, fs.hp, fs.maxHp);
      fighter.setPosition(worldPos.x, worldPos.y, fs.position.x, fs.position.y);
      this.fighters.push(fighter);
    }

    if (this.frames.length > 0) this.applyFrame(0);
    else this.events.emit("frame", { index: -1, total: 0, round: 0 } satisfies FrameEvent);

    const label = this.gameFinished ? "Game finished" : "AI running…";
    this.status(`Game ${data.id} — ${label}`, this.gameFinished ? "ok" : "warn");
  }

  private async pollFrames() {
    if (!this.gameId) return;

    const { session, gameId } = this;
    try {
      const after = this.frames.length - 1;
      const resp = await fetch(framesUrl(gameId, after));
      if (!resp.ok) return;

      const data = await resp.json();
      if (session !== this.session || gameId !== this.gameId) return;
      if (data.frames.length > 0) {
        this.frames.push(...data.frames);

        // Follow the newest frame only for a viewer who was already at the tail
        if (this.currentFrame >= this.frames.length - data.frames.length - 1) {
          this.applyFrame(this.frames.length - 1);
        }
      }

      if (data.status === "finished" || data.status === "interrupted") {
        this.gameFinished = true;
        this.stopPolling();
        if (data.status === "finished") this.status("Game finished!", "ok");
        else this.status("Game interrupted", "error");
      } else {
        this.status(`Game ${this.gameId} — AI running… (${data.totalFrames} frames)`, "warn");
      }
    } catch {}
  }

  private startPolling() {
    this.stopPolling();
    this.pollTimer = this.time.addEvent({
      delay: POLL_INTERVAL,
      callback: () => this.pollFrames(),
      loop: true,
    });
  }

  private stopPolling() {
    if (this.pollTimer) {
      this.pollTimer.destroy();
      this.pollTimer = null;
    }
  }

  // ---- NAVIGATION ----

  // Stepping by hand takes over from auto play
  stepForward() {
    this.stopAutoPlay();
    if (this.currentFrame < this.frames.length - 1) this.applyFrame(this.currentFrame + 1);
  }

  stepBackward() {
    this.stopAutoPlay();
    if (this.currentFrame > 0) this.applyFrame(this.currentFrame - 1);
  }

  goToFrame(index: number) {
    this.stopAutoPlay();
    if (this.frames.length === 0) return;
    this.applyFrame(Math.max(0, Math.min(index, this.frames.length - 1)));
  }

  goToFirst() {
    this.goToFrame(0);
  }

  goToLast() {
    this.goToFrame(this.frames.length - 1);
  }

  toggleAutoPlay() {
    if (this.autoPlaying) {
      this.stopAutoPlay();
    } else {
      this.autoPlaying = true;
      this.events.emit("autoplay", true);
      this.autoStep();
    }
  }

  private stopAutoPlay() {
    const was = this.autoPlaying;
    this.autoPlaying = false;
    if (this.autoPlayTimer) {
      this.autoPlayTimer.destroy();
      this.autoPlayTimer = null;
    }
    if (was) this.events.emit("autoplay", false);
  }

  private autoStep() {
    if (!this.autoPlaying) return;

    if (this.currentFrame < this.frames.length - 1) this.applyFrame(this.currentFrame + 1);

    // A live game keeps the timer armed at the tail, waiting for frames still to be written
    if (this.gameFinished && this.currentFrame >= this.frames.length - 1) {
      this.stopAutoPlay();
      return;
    }

    this.autoPlayTimer = this.time.delayedCall(AUTO_PLAY_INTERVAL, () => this.autoStep());
  }

  // ---- DISPLAY ----

  private applyFrame(index: number) {
    if (this.frames.length === 0) return;

    this.currentFrame = Math.max(0, Math.min(index, this.frames.length - 1));
    const frame = this.frames[this.currentFrame];
    this.arena!.setGold(frame.gold ?? null);

    // Show a speech bubble only for a line that was said on this frame
    const said = this.saidOn(this.currentFrame);
    for (const f of this.fighters) {
      const line = said.filter((m) => m.fighterId === f.id).pop();
      f.showChat(line?.text ?? null);
    }

    for (let i = 0; i < this.fighters.length; i++) {
      const fs = frame.fighters[i];
      const worldPos = this.arena!.gridToWorld(fs.gridX, fs.gridY);
      this.fighters[i].setPosition(worldPos.x, worldPos.y, fs.gridX, fs.gridY);
      this.fighters[i].setHp(fs.hp);
      this.fighters[i].setAp(fs.ap, fs.maxAp);
      this.fighters[i].setAlive(fs.alive);
      this.fighters[i].setActive(this.fighters[i].id === frame.activeFighterId);
    }

    if (frame.logEntry.actionType === "move") {
      this.sound.play("footstep");
    }

    if (frame.logEntry.actionType === "attack") {
      this.sound.play("sword_clash", { volume: 0.35 });
    }

    if (frame.logEntry.actionType === "attack" && this.currentFrame > 0) {
      const prev = this.frames[this.currentFrame - 1];
      const attacker = this.fighters.findIndex((f) => f.id === frame.logEntry.fighterId);
      const target = frame.fighters.findIndex((fs, i) => fs.hp < prev.fighters[i].hp);
      if (attacker >= 0 && target >= 0) {
        this.fighters[attacker].playAttack(frame.fighters[target].gridX);
      }
      frame.fighters.forEach((fs, i) => {
        const change = fs.hp - prev.fighters[i].hp;
        if (change !== 0) this.showHpChange(this.fighters[i], change);
      });
    }

    this.events.emit("frame", {
      index: this.currentFrame,
      total: this.frames.length,
      round: frame.round,
    } satisfies FrameEvent);

    this.emitLog();
    this.emitChat();
  }

  /** New matches store only what was said on each frame; older ones repeat the whole conversation */
  private saidOn(index: number): { fighterId: string; text: string }[] {
    const frame = this.frames[index];
    if (frame.chat) return frame.chat;
    const previous = index > 0 ? (this.frames[index - 1].chatMessages?.length ?? 0) : 0;
    return (frame.chatMessages ?? []).slice(previous);
  }

  private resetFeeds() {
    this.chatLines = [];
    this.chatPrefix = [];
    this.indexedFrames = 0;
    this.renderedLog = 0;
    this.renderedChat = 0;
    this.events.emit("log", { lines: [], from: 0, current: -1 } satisfies FeedEvent<LogLine>);
    this.events.emit("chat", { lines: [], from: 0, current: -1 } satisfies FeedEvent<ChatLine>);
  }

  /** Flattens the chat out of any frames that have arrived since the last pass. */
  private indexChat() {
    for (let i = this.indexedFrames; i < this.frames.length; i++) {
      for (const said of this.saidOn(i)) {
        const speaker = this.fighters.find((f) => f.id === said.fighterId);
        this.chatLines.push({
          who: speaker?.name ?? said.fighterId,
          color: hex(speaker?.color ?? 0xffffff),
          text: said.text,
        });
      }
      this.chatPrefix[i] = this.chatLines.length;
    }
    this.indexedFrames = this.frames.length;
  }

  private emitLog() {
    const count = this.currentFrame + 1;
    const lines: LogLine[] = [];
    // Growing appends what is new; stepping back just truncates to the new length
    const from = Math.min(this.renderedLog, count);
    for (let i = from; i < count; i++) {
      const entry = this.frames[i].logEntry;
      lines.push({ text: `${String(i + 1).padStart(3, " ")} ${entry.description}`, kind: entry.actionType });
    }
    this.renderedLog = count;
    this.events.emit("log", { lines, from, current: count - 1 } satisfies FeedEvent<LogLine>);
  }

  private emitChat() {
    this.indexChat();
    const count = this.chatPrefix[this.currentFrame] ?? 0;
    const from = Math.min(this.renderedChat, count);
    this.renderedChat = count;
    this.events.emit("chat", {
      lines: this.chatLines.slice(from, count),
      from,
      current: count - 1,
    } satisfies FeedEvent<ChatLine>);
  }

  private showHpChange(fighter: Fighter, change: number) {
    const { x, y } = fighter.container;
    const label = this.add
      .text(x + Phaser.Math.Between(-6, 6), y - 20, change < 0 ? `${change}` : `+${change}`, {
        fontSize: ARENA_TEXT(20),
        fontFamily: "monospace",
        fontStyle: "bold",
        color: change < 0 ? "#ff6b5e" : "#b6f25c",
        stroke: "#161c2e",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setScale(0.6);

    this.tweens.add({ targets: label, scale: 1, duration: 180, ease: "Back.easeOut" });
    this.tweens.add({ targets: label, y: label.y - 44, duration: 1100, ease: "Cubic.easeOut" });
    this.tweens.add({
      targets: label,
      alpha: 0,
      delay: 550,
      duration: 550,
      onComplete: () => label.destroy(),
    });
  }
}
