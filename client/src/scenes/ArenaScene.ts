import Phaser from "phaser";
import type { GameState, TurnLogEntry, ChatMessage, FighterState } from "@ai-arena/shared";
import { FIGHTER_COLORS } from "@ai-arena/shared";
import { Arena } from "../objects/Arena";
import { Fighter } from "../objects/Fighter";

const API_BASE = "http://localhost:3001/api/game";

interface Frame {
  fighters: {
    gridX: number;
    gridY: number;
    hp: number;
    ap: number;
    alive: boolean;
  }[];
  activeFighterId: string;
  round: number;
  logEntry: TurnLogEntry;
  chatMessages: ChatMessage[];
}

// Right panel layout
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

export class ArenaScene extends Phaser.Scene {
  private arena!: Arena;
  private fighters: Fighter[] = [];
  private frames: Frame[] = [];
  private currentFrame = 0;
  private gameId: string | null = null;
  private gameFinished = false;
  private stepping = false;
  private autoPlaying = false;
  private autoPlayTimer: Phaser.Time.TimerEvent | null = null;

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
    this.startNewGame();
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
      .on("pointerdown", () => this.jumpToEnd());

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
    this.input.keyboard!.on("keydown-END", () => this.jumpToEnd());
    this.input.keyboard!.on("keydown-SPACE", () => this.toggleAutoPlay());
  }

  // ---- SERVER COMMUNICATION ----

  private async startNewGame() {
    this.stopAutoPlay();
    this.statusText.setText("Creating game...");

    try {
      const resp = await fetch(`${API_BASE}/create`, { method: "POST" });
      const data = await resp.json();
      const state: GameState = data.state;

      this.gameId = state.id;
      this.gameFinished = false;
      this.frames = [];

      // Destroy old fighters
      for (const f of this.fighters) f.destroy();
      if (this.arena) this.arena = null!;

      // Create arena + fighters from server state
      this.arena = new Arena(this, state.arena.obstacles);

      this.fighters = [];
      for (const fs of state.fighters) {
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

      // Create initial frame from the starting log entries
      this.addFrameFromState(state, state.log[0]);
      if (state.log.length > 1) {
        this.addFrameFromState(state, state.log[1]);
      }

      this.applyFrame(0);
      this.statusText.setText(`Game ${state.id} - Server connected`);
    } catch (e) {
      this.statusText.setText("Failed to connect to server!");
      this.statusText.setColor("#e74c3c");
    }
  }

  private async fetchStep(): Promise<boolean> {
    if (!this.gameId || this.gameFinished || this.stepping) return false;

    this.stepping = true;

    try {
      const resp = await fetch(`${API_BASE}/${this.gameId}/step`, { method: "POST" });
      const data = await resp.json();
      const state: GameState = data.state;

      if (data.logEntry) {
        this.addFrameFromState(state, data.logEntry);
      }
      if (data.eliminationEntry) {
        this.addFrameFromState(state, data.eliminationEntry);
      }
      if (data.victoryEntry) {
        this.addFrameFromState(state, data.victoryEntry);
      }

      // Check if new round_start entries were added
      const knownLogCount = this.frames.length;
      for (let i = knownLogCount; i < state.log.length; i++) {
        const entry = state.log[i];
        if (entry.actionType === "round_start") {
          this.addFrameFromState(state, entry);
        }
      }

      if (data.done) this.gameFinished = true;

      return true;
    } catch (e) {
      this.statusText.setText("Server error!");
      this.statusText.setColor("#e74c3c");
      return false;
    } finally {
      this.stepping = false;
    }
  }

  private addFrameFromState(state: GameState, logEntry: TurnLogEntry) {
    const chatUpToNow = [...state.chat];
    this.frames.push({
      fighters: state.fighters.map((f) => ({
        gridX: f.position.x,
        gridY: f.position.y,
        hp: f.hp,
        ap: f.ap,
        alive: f.isAlive,
      })),
      activeFighterId: logEntry.fighterId,
      round: logEntry.round,
      logEntry,
      chatMessages: chatUpToNow,
    });
  }

  // ---- NAVIGATION ----

  private async stepForward() {
    if (this.currentFrame < this.frames.length - 1) {
      this.applyFrame(this.currentFrame + 1);
    } else if (!this.gameFinished) {
      const ok = await this.fetchStep();
      if (ok && this.currentFrame < this.frames.length - 1) {
        this.applyFrame(this.currentFrame + 1);
      }
    }
  }

  private stepBackward() {
    if (this.currentFrame > 0) {
      this.applyFrame(this.currentFrame - 1);
    }
  }

  private goToFrame(index: number) {
    this.applyFrame(Math.max(0, Math.min(index, this.frames.length - 1)));
  }

  private async jumpToEnd() {
    this.stopAutoPlay();
    if (this.gameFinished) {
      this.applyFrame(this.frames.length - 1);
      return;
    }

    this.statusText.setText("Running to end...");
    try {
      const resp = await fetch(`${API_BASE}/${this.gameId}/run`, { method: "POST" });
      const data = await resp.json();
      const state: GameState = data.state;

      // Rebuild all frames from the full log
      this.frames = [];
      for (const entry of state.log) {
        this.addFrameFromState(state, entry);
      }

      this.gameFinished = state.status !== "in_progress";
      this.applyFrame(this.frames.length - 1);
      this.statusText.setText(this.gameFinished ? "Game finished!" : "Running...");
    } catch (e) {
      this.statusText.setText("Server error!");
    }
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

  private async autoStep() {
    if (!this.autoPlaying) return;

    await this.stepForward();

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

  private updateLog() {
    const endIdx = this.currentFrame + 1;
    const startIdx = Math.max(0, endIdx - VISIBLE_LOG_LINES);

    for (let i = 0; i < VISIBLE_LOG_LINES; i++) {
      const frameIdx = startIdx + i;
      const logText = this.logTexts[i];

      if (frameIdx >= endIdx) {
        logText.setText("");
        continue;
      }

      const frame = this.frames[frameIdx];
      const entry = frame.logEntry;
      const prefix = `${String(frameIdx + 1).padStart(3, " ")} `;
      logText.setText(`${prefix}${entry.description}`);

      const isCurrent = frameIdx === this.currentFrame;
      if (isCurrent) {
        logText.setColor("#ffffff");
        logText.setFontStyle("bold");
      } else if (entry.actionType === "round_start") {
        logText.setColor("#f1c40f");
        logText.setFontStyle("normal");
      } else if (entry.actionType === "attack") {
        logText.setColor("#e74c3c");
        logText.setFontStyle("normal");
      } else if (entry.actionType === "elimination") {
        logText.setColor("#ff6b6b");
        logText.setFontStyle("bold");
      } else if (entry.actionType === "victory") {
        logText.setColor("#2ecc71");
        logText.setFontStyle("bold");
      } else {
        logText.setColor("#888");
        logText.setFontStyle("normal");
      }
    }
  }

  private updateChat() {
    const frame = this.frames[this.currentFrame];
    const messages = frame.chatMessages;

    const startIdx = Math.max(0, messages.length - VISIBLE_CHAT_LINES);
    for (let i = 0; i < VISIBLE_CHAT_LINES; i++) {
      const msgIdx = startIdx + i;
      const chatText = this.chatTexts[i];

      if (msgIdx >= messages.length) {
        chatText.setText("");
        continue;
      }

      const msg = messages[msgIdx];
      chatText.setText(`${msg.fighterName}: ${msg.text}`);

      const colorHex = "#" + msg.fighterColor.toString(16).padStart(6, "0");
      chatText.setColor(colorHex);

      const isLatest = msgIdx === messages.length - 1;
      chatText.setFontStyle(isLatest ? "bold" : "normal");
    }
  }
}
