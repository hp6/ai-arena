import Phaser from "phaser";
import type { GameFrame, FighterState, ArenaConfig } from "@ai-arena/shared";
import { Arena } from "../objects/Arena";
import { Fighter } from "../objects/Fighter";

const API_BASE = "http://localhost:3001/api/games";

const PANEL_X = 830;
const PANEL_WIDTH = 555;

const LOG_Y = 10;
const LOG_HEIGHT = 380;
const LOG_LINE_HEIGHT = 16;
const VISIBLE_LOG_LINES = Math.floor((LOG_HEIGHT - 40) / LOG_LINE_HEIGHT);

const CHAT_Y = 400;
const CHAT_HEIGHT = 380;
const CHAT_LINE_HEIGHT = 18;
const VISIBLE_CHAT_LINES = Math.floor((CHAT_HEIGHT - 40) / CHAT_LINE_HEIGHT);

const POLL_INTERVAL = 1500;

export class ArenaScene extends Phaser.Scene {
  private arena!: Arena;
  private fighters: Fighter[] = [];
  private frames: GameFrame[] = [];
  private currentFrame = 0;
  private gameId: string | null = null;
  private gameFinished = false;
  private autoPlaying = false;
  private autoPlayTimer: Phaser.Time.TimerEvent | null = null;
  private pollTimer: Phaser.Time.TimerEvent | null = null;

  private frameCounterText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private detailText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  private logTexts: Phaser.GameObjects.Text[] = [];
  private chatTexts: Phaser.GameObjects.Text[] = [];
  private btnAuto!: Phaser.GameObjects.Text;

  constructor() {
    super("Arena");
  }

  create() {
    this.createUI();
    this.setupInput();
    this.loadLatestGame();
  }

  private createUI() {
    // --- LOG PANEL ---
    this.add
      .rectangle(PANEL_X + PANEL_WIDTH / 2, LOG_Y + LOG_HEIGHT / 2, PANEL_WIDTH, LOG_HEIGHT, 0x111122, 0.9)
      .setStrokeStyle(1, 0x333355);

    this.add.text(PANEL_X + 10, LOG_Y + 8, "GAME LOG", {
      fontSize: "13px",
      color: "#f1c40f",
      fontFamily: "monospace",
      fontStyle: "bold",
    });

    for (let i = 0; i < VISIBLE_LOG_LINES; i++) {
      this.logTexts.push(
        this.add.text(PANEL_X + 10, LOG_Y + 30 + i * LOG_LINE_HEIGHT, "", {
          fontSize: "11px",
          color: "#999",
          fontFamily: "monospace",
          wordWrap: { width: PANEL_WIDTH - 20 },
        }),
      );
    }

    // --- CHAT PANEL ---
    this.add
      .rectangle(PANEL_X + PANEL_WIDTH / 2, CHAT_Y + CHAT_HEIGHT / 2, PANEL_WIDTH, CHAT_HEIGHT, 0x0d0d1a, 0.9)
      .setStrokeStyle(1, 0x333355);

    this.add.text(PANEL_X + 10, CHAT_Y + 8, "GLOBAL CHAT", {
      fontSize: "13px",
      color: "#3498db",
      fontFamily: "monospace",
      fontStyle: "bold",
    });

    for (let i = 0; i < VISIBLE_CHAT_LINES; i++) {
      this.chatTexts.push(
        this.add.text(PANEL_X + 10, CHAT_Y + 30 + i * CHAT_LINE_HEIGHT, "", {
          fontSize: "11px",
          color: "#999",
          fontFamily: "monospace",
          wordWrap: { width: PANEL_WIDTH - 20 },
        }),
      );
    }

    // --- DETAIL PANE ---
    this.detailText = this.add.text(40, 650, "", {
      fontSize: "11px",
      color: "#8be9fd",
      fontFamily: "monospace",
      wordWrap: { width: 760 },
    });

    // --- FRAME COUNTER ---
    this.frameCounterText = this.add.text(40, 10, "", {
      fontSize: "13px",
      color: "#f1c40f",
      fontFamily: "monospace",
      fontStyle: "bold",
    });

    this.roundText = this.add.text(40, 28, "", {
      fontSize: "12px",
      color: "#aaa",
      fontFamily: "monospace",
    });

    this.statusText = this.add.text(250, 10, "", {
      fontSize: "12px",
      color: "#2ecc71",
      fontFamily: "monospace",
    });

    // --- CONTROLS ---
    const btnY = 860;
    const btnStyle = {
      fontSize: "16px",
      color: "#1a1a2e",
      fontFamily: "monospace",
      fontStyle: "bold",
      backgroundColor: "#f1c40f",
      padding: { x: 12, y: 4 },
    };
    const btnStyleAlt = { ...btnStyle, backgroundColor: "#555", color: "#eee" };

    this.add.text(40, btnY, "|<", btnStyleAlt)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.goToFrame(0));

    this.add.text(100, btnY, "< PREV", btnStyle)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.stepBackward());

    this.add.text(210, btnY, "NEXT >", btnStyle)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.stepForward());

    this.add.text(320, btnY, ">|", btnStyleAlt)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.goToFrame(this.frames.length - 1));

    this.btnAuto = this.add.text(380, btnY, "AUTO PLAY", { ...btnStyleAlt, backgroundColor: "#e67e22", color: "#111" })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.toggleAutoPlay());

    this.add.text(530, btnY, "NEW GAME", { ...btnStyleAlt, backgroundColor: "#2ecc71", color: "#111" })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.startNewGame());

    this.add.text(680, btnY + 2, "Arrow keys: Left/Right | Home/End | Space: auto", {
      fontSize: "10px",
      color: "#666",
      fontFamily: "monospace",
    });
  }

  private setupInput() {
    this.input.keyboard!.on("keydown-RIGHT", () => this.stepForward());
    this.input.keyboard!.on("keydown-LEFT", () => this.stepBackward());
    this.input.keyboard!.on("keydown-HOME", () => this.goToFrame(0));
    this.input.keyboard!.on("keydown-END", () => this.goToFrame(this.frames.length - 1));
    this.input.keyboard!.on("keydown-SPACE", () => this.toggleAutoPlay());
  }

  // ---- SERVER COMMUNICATION ----

  private async loadLatestGame() {
    try {
      const resp = await fetch(API_BASE);
      if (!resp.ok) return;
      const games = await resp.json();
      if (games.length > 0) {
        await this.loadGame(games[0].id);
        return;
      }
    } catch {}
    this.statusText.setText("No games yet — click NEW GAME");
    this.statusText.setColor("#f1c40f");
  }

  private async loadGame(gameId: string) {
    this.stopAutoPlay();
    this.stopPolling();

    try {
      const metaResp = await fetch(`${API_BASE}/${gameId}`);
      if (!metaResp.ok) return;
      const meta = await metaResp.json();

      const framesResp = await fetch(`${API_BASE}/${gameId}/frames?after=-1`);
      if (!framesResp.ok) return;
      const framesData = await framesResp.json();

      this.setupGame(meta, framesData.frames);

      this.gameFinished = meta.status !== "running";
      if (!this.gameFinished) this.startPolling();
    } catch {
      this.statusText.setText("Failed to load game!");
      this.statusText.setColor("#e74c3c");
    }
  }

  private async startNewGame() {
    this.stopAutoPlay();
    this.stopPolling();
    this.statusText.setText("Creating game...");

    try {
      const resp = await fetch(`${API_BASE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await resp.json();

      this.setupGame(data, []);

      this.statusText.setText(`Game ${data.id} - AI running...`);
      this.statusText.setColor("#2ecc71");

      await this.pollFrames();
      this.startPolling();
    } catch {
      this.statusText.setText("Failed to connect to server!");
      this.statusText.setColor("#e74c3c");
    }
  }

  private setupGame(data: { id: string; fighters: FighterState[]; arena: ArenaConfig; status?: string }, frames: GameFrame[]) {
    this.gameId = data.id;
    this.gameFinished = data.status === "finished" || data.status === "interrupted";
    this.frames = frames;

    for (const f of this.fighters) f.destroy();
    if (this.arena) this.arena.destroy();

    this.arena = new Arena(this, data.arena.obstacles);

    this.fighters = [];
    for (const fs of data.fighters) {
      const worldPos = this.arena.gridToWorld(fs.position.x, fs.position.y);
      const fighter = new Fighter(
        this,
        fs.id,
        fs.name,
        worldPos.x,
        worldPos.y,
        fs.color,
        fs.hp,
        fs.maxHp,
      );
      fighter.setPosition(worldPos.x, worldPos.y, fs.position.x, fs.position.y);
      this.fighters.push(fighter);
    }

    if (this.frames.length > 0) {
      this.applyFrame(0);
    }

    const label = this.gameFinished ? "Game finished" : "AI running...";
    this.statusText.setText(`Game ${data.id} - ${label}`);
    this.statusText.setColor(this.gameFinished ? "#2ecc71" : "#e67e22");
  }

  private async pollFrames() {
    if (!this.gameId) return;

    try {
      const after = this.frames.length - 1;
      const resp = await fetch(`${API_BASE}/${this.gameId}/frames?after=${after}`);
      if (!resp.ok) return;

      const data = await resp.json();
      if (data.frames.length > 0) {
        this.frames.push(...data.frames);

        // If we're at the end (watching live), auto-advance to show new frames
        if (this.currentFrame >= this.frames.length - data.frames.length - 1) {
          this.applyFrame(this.frames.length - 1);
        }
      }

      if (data.status === "finished" || data.status === "interrupted") {
        this.gameFinished = true;
        this.stopPolling();
        this.statusText.setText(data.status === "finished" ? "Game finished!" : "Game interrupted");
        this.statusText.setColor(data.status === "finished" ? "#2ecc71" : "#e74c3c");
      } else {
        this.statusText.setText(`Game ${this.gameId} - AI running... (${data.totalFrames} frames)`);
      }
    } catch {
      // Polling failures are silent — we'll retry on next tick
    }
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

  private stepForward() {
    if (this.currentFrame < this.frames.length - 1) {
      this.applyFrame(this.currentFrame + 1);
    }
  }

  private stepBackward() {
    if (this.currentFrame > 0) {
      this.applyFrame(this.currentFrame - 1);
    }
  }

  private goToFrame(index: number) {
    if (this.frames.length === 0) return;
    this.applyFrame(Math.max(0, Math.min(index, this.frames.length - 1)));
  }

  private toggleAutoPlay() {
    if (this.autoPlaying) {
      this.stopAutoPlay();
    } else {
      this.autoPlaying = true;
      this.btnAuto.setText("STOP");
      this.btnAuto.setBackgroundColor("#e74c3c");
      this.autoStep();
    }
  }

  private stopAutoPlay() {
    this.autoPlaying = false;
    this.btnAuto.setText("AUTO PLAY");
    this.btnAuto.setBackgroundColor("#e67e22");
    if (this.autoPlayTimer) {
      this.autoPlayTimer.destroy();
      this.autoPlayTimer = null;
    }
  }

  private autoStep() {
    if (!this.autoPlaying) return;

    if (this.currentFrame < this.frames.length - 1) {
      this.applyFrame(this.currentFrame + 1);
    }

    if (this.gameFinished && this.currentFrame >= this.frames.length - 1) {
      this.stopAutoPlay();
      return;
    }

    this.autoPlayTimer = this.time.delayedCall(400, () => this.autoStep());
  }

  // ---- DISPLAY ----

  private applyFrame(index: number) {
    if (this.frames.length === 0) return;

    this.currentFrame = Math.max(0, Math.min(index, this.frames.length - 1));
    const frame = this.frames[this.currentFrame];

    for (let i = 0; i < this.fighters.length; i++) {
      const fs = frame.fighters[i];
      const worldPos = this.arena.gridToWorld(fs.gridX, fs.gridY);
      this.fighters[i].setPosition(worldPos.x, worldPos.y, fs.gridX, fs.gridY);
      this.fighters[i].setHp(fs.hp);
      this.fighters[i].setAp(fs.ap);
      this.fighters[i].setAlive(fs.alive);
      this.fighters[i].setActive(this.fighters[i].id === frame.activeFighterId);
    }

    this.frameCounterText.setText(`Frame ${this.currentFrame + 1} / ${this.frames.length}`);
    this.roundText.setText(
      frame.round > 0 ? `Round ${frame.round}` : frame.round === 0 ? "Pre-game" : "Game Over",
    );
    this.detailText.setText(frame.logEntry.details);

    this.updateLog();
    this.updateChat();
  }

  private layoutPanel(
    textObjects: Phaser.GameObjects.Text[],
    panelY: number,
    panelHeight: number,
    items: { text: string; color: string; bold: boolean }[],
  ) {
    for (const t of textObjects) {
      t.setText("");
      t.setVisible(false);
    }

    if (items.length === 0) return;

    const availableHeight = panelHeight - 40;
    const gap = 3;

    // Measure backwards to find which items fit, newest always visible
    const fitting: number[] = [];
    let totalHeight = 0;
    const measure = textObjects[0];

    for (let i = items.length - 1; i >= 0; i--) {
      measure.setText(items[i].text);
      const h = measure.height + gap;
      if (totalHeight + h > availableHeight && fitting.length > 0) break;
      totalHeight += h;
      fitting.push(i);
      if (fitting.length >= textObjects.length) break;
    }

    measure.setText("");
    fitting.reverse();

    let y = panelY + 30;
    for (let slot = 0; slot < fitting.length; slot++) {
      const item = items[fitting[slot]];
      const obj = textObjects[slot];
      obj.setText(item.text);
      obj.setColor(item.color);
      obj.setFontStyle(item.bold ? "bold" : "normal");
      obj.setY(y);
      obj.setVisible(true);
      y += obj.height + gap;
    }
  }

  private updateLog() {
    if (this.frames.length === 0) {
      this.layoutPanel(this.logTexts, LOG_Y, LOG_HEIGHT, []);
      return;
    }

    const endIdx = this.currentFrame + 1;
    const items: { text: string; color: string; bold: boolean }[] = [];

    for (let fi = 0; fi < endIdx; fi++) {
      const entry = this.frames[fi].logEntry;
      const prefix = `${String(fi + 1).padStart(3, " ")} `;
      const isCurrent = fi === this.currentFrame;

      let color: string;
      let bold: boolean;
      if (isCurrent) {
        color = "#ffffff"; bold = true;
      } else if (entry.actionType === "round_start") {
        color = "#f1c40f"; bold = false;
      } else if (entry.actionType === "attack") {
        color = "#e74c3c"; bold = false;
      } else if (entry.actionType === "elimination") {
        color = "#ff6b6b"; bold = true;
      } else if (entry.actionType === "victory") {
        color = "#2ecc71"; bold = true;
      } else {
        color = "#888"; bold = false;
      }

      items.push({ text: `${prefix}${entry.description}`, color, bold });
    }

    this.layoutPanel(this.logTexts, LOG_Y, LOG_HEIGHT, items);
  }

  private updateChat() {
    if (this.frames.length === 0) {
      this.layoutPanel(this.chatTexts, CHAT_Y, CHAT_HEIGHT, []);
      return;
    }

    const messages = this.frames[this.currentFrame].chatMessages;
    const items = messages.map((msg, i) => ({
      text: `${msg.fighterName}: ${msg.text}`,
      color: "#" + msg.fighterColor.toString(16).padStart(6, "0"),
      bold: i === messages.length - 1,
    }));

    this.layoutPanel(this.chatTexts, CHAT_Y, CHAT_HEIGHT, items);
  }
}
