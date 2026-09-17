import Phaser from "phaser";
import { warriorColor } from "../objects/Fighter";

const STATS_URL = "http://localhost:3001/api/stats";
const REFRESH_MS = 5000;

const C = {
  navy: "#161c2e",
  gold: "#e8ce91",
  parchment: "#efe1ab",
  text: "#d8cfa8",
  muted: "#8fa39e",
  grass: "#85b156",
  red: "#e76161",
  teal: 0x315a6d,
  panel: 0x1e2b38,
  panelDark: 0x1b2531,
  moss: 0x455a4b,
};

const W = 1500;
const MARGIN = 55;
const INNER_W = W - MARGIN * 2;

const BOARD_Y = 215;
const BOARD_H = 300;
const BOARD_ROW_H = 46;
const BOARD_ROWS = Math.floor((BOARD_H - 70) / BOARD_ROW_H);

const HISTORY_Y = 535;
const HISTORY_H = 425;
const HISTORY_ROW_H = 34;
const HISTORY_ROWS = Math.floor((HISTORY_H - 76) / HISTORY_ROW_H);

interface MatchFighter {
  id: string;
  name: string;
  model: string;
  color: number;
  kills: number;
  damageDealt: number;
  placement: number | null;
}

interface MatchSummary {
  id: string;
  status: "running" | "finished" | "interrupted";
  createdAt: string;
  rounds: number;
  turns: number;
  winnerId: string | null;
  fighters: MatchFighter[];
}

interface ModelStats {
  model: string;
  fighterId: string;
  color: number;
  played: number;
  wins: number;
  winRate: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  avgPlacement: number;
}

interface Stats {
  totals: { games: number; finished: number; running: number; interrupted: number; avgRounds: number };
  models: ModelStats[];
  matches: MatchSummary[];
}

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
const shortModel = (m: string) => m.split("/").pop() ?? m;

function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  size: number,
  color: string,
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
) {
  return scene.add.text(x, y, value, { fontSize: `${size}px`, color, fontFamily: "monospace", ...extra });
}

export class MenuScene extends Phaser.Scene {
  private stats: Stats | null = null;
  private scroll = 0;
  private summaryLayer!: Phaser.GameObjects.Container;
  private boardLayer!: Phaser.GameObjects.Container;
  private historyLayer!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super("Menu");
  }

  create() {
    this.stats = null;
    this.scroll = 0;

    text(this, MARGIN, 28, "TINY AI ARENA", 36, C.gold, { fontStyle: "bold", stroke: C.navy, strokeThickness: 4 });
    text(this, MARGIN, 72, "LLM battle royale — leaderboard & match history", 13, C.text);
    this.statusText = text(this, MARGIN, 92, "Loading…", 12, C.muted);

    text(this, W - MARGIN, 44, "NEW GAME", 18, C.navy, {
      fontStyle: "bold",
      backgroundColor: C.grass,
      padding: { x: 16, y: 8 },
    })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.scene.start("Arena", { newGame: true }));

    this.summaryLayer = this.add.container();
    this.boardLayer = this.add.container();
    this.historyLayer = this.add.container();

    this.drawPanel(BOARD_Y, BOARD_H, "LEADERBOARD", C.gold, "finished matches only");
    this.drawPanel(HISTORY_Y, HISTORY_H, "MATCH HISTORY", "#93ba4f", "click a match to watch it");
    this.children.bringToTop(this.boardLayer);
    this.children.bringToTop(this.historyLayer);

    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (!this.stats) return;
      const max = Math.max(0, this.stats.matches.length - HISTORY_ROWS);
      const next = Phaser.Math.Clamp(this.scroll + Math.sign(dy) * 3, 0, max);
      if (next !== this.scroll) {
        this.scroll = next;
        this.renderHistory();
      }
    });

    this.fetchStats();
    this.time.addEvent({ delay: REFRESH_MS, loop: true, callback: () => this.fetchStats() });
  }

  private async fetchStats() {
    try {
      const resp = await fetch(STATS_URL);
      if (!resp.ok) throw new Error(String(resp.status));
      const stats: Stats = await resp.json();
      if (!this.sys.isActive()) return;
      this.stats = stats;
      this.scroll = Math.min(this.scroll, Math.max(0, stats.matches.length - HISTORY_ROWS));
      this.statusText.setText(`Updated ${new Date().toLocaleTimeString()}`).setColor(C.muted);
      this.renderSummary();
      this.renderBoard();
      this.renderHistory();
    } catch {
      if (!this.sys.isActive()) return;
      this.statusText.setText("Can't reach the server on :3001").setColor(C.red);
    }
  }

  private drawPanel(y: number, h: number, title: string, titleColor: string, hint: string) {
    this.add.rectangle(MARGIN, y, INNER_W, h, C.panel, 0.95).setOrigin(0).setStrokeStyle(2, C.teal);
    text(this, MARGIN + 16, y + 12, title, 15, titleColor, { fontStyle: "bold" });
    text(this, MARGIN + INNER_W - 16, y + 14, hint, 11, C.muted).setOrigin(1, 0);
  }

  private renderSummary() {
    const layer = this.summaryLayer;
    layer.removeAll(true);
    const t = this.stats!.totals;
    const cards: [string, string, string][] = [
      ["MATCHES", `${t.games}`, C.gold],
      ["FINISHED", `${t.finished}`, C.grass],
      ["RUNNING", `${t.running}`, C.gold],
      ["INTERRUPTED", `${t.interrupted}`, C.red],
      ["AVG ROUNDS", t.avgRounds.toFixed(1), C.parchment],
    ];
    const gap = 16;
    const w = (INNER_W - gap * (cards.length - 1)) / cards.length;
    cards.forEach(([label, value, color], i) => {
      const x = MARGIN + i * (w + gap);
      layer.add([
        this.add.rectangle(x, 120, w, 78, C.panelDark, 0.95).setOrigin(0).setStrokeStyle(2, C.teal),
        text(this, x + 16, 132, value, 30, color, { fontStyle: "bold" }),
        text(this, x + 16, 172, label, 11, C.muted),
      ]);
    });
  }

  private renderBoard() {
    const layer = this.boardLayer;
    layer.removeAll(true);
    const models = this.stats!.models;
    const x0 = MARGIN + 16;
    const cols = { rank: x0, model: x0 + 40, played: 560, wins: 650, rate: 740, kills: 950, dealt: 1040, taken: 1150, place: 1260 };
    const headY = BOARD_Y + 42;

    const head: [keyof typeof cols, string][] = [
      ["rank", "#"], ["model", "MODEL"], ["played", "PLAYED"], ["wins", "WINS"], ["rate", "WIN RATE"],
      ["kills", "KILLS"], ["dealt", "DMG DEALT"], ["taken", "DMG TAKEN"], ["place", "AVG PLACE"],
    ];
    for (const [k, label] of head) layer.add(text(this, cols[k], headY, label, 11, C.muted, { fontStyle: "bold" }));

    if (models.length === 0) {
      layer.add(text(this, x0, headY + 40, "No finished matches yet — click NEW GAME", 14, C.text));
      return;
    }

    models.slice(0, BOARD_ROWS).forEach((m, i) => {
      const y = headY + 22 + i * BOARD_ROW_H;
      const cy = y + BOARD_ROW_H / 2;
      if (i % 2 === 0) layer.add(this.add.rectangle(MARGIN + 2, y, INNER_W - 4, BOARD_ROW_H, C.panelDark, 0.8).setOrigin(0));

      const warrior = this.add.sprite(cols.model + 18, cy - 4, `warrior_idle_${warriorColor(m.fighterId)}`, 0).setScale(0.32);
      warrior.play({ key: `warrior_idle_${warriorColor(m.fighterId)}`, startFrame: i % 8 });

      const barW = 120;
      layer.add([
        text(this, cols.rank, cy, `${i + 1}`, 16, i === 0 ? C.gold : C.text, { fontStyle: "bold" }).setOrigin(0, 0.5),
        warrior,
        text(this, cols.model + 44, cy, shortModel(m.model), 14, hex(m.color), { fontStyle: "bold" }).setOrigin(0, 0.5),
        text(this, cols.played, cy, `${m.played}`, 14, C.text).setOrigin(0, 0.5),
        text(this, cols.wins, cy, `${m.wins}`, 14, C.parchment, { fontStyle: "bold" }).setOrigin(0, 0.5),
        this.add.rectangle(cols.rate, cy, barW, 10, C.moss).setOrigin(0, 0.5).setStrokeStyle(1, 0x161c2e),
        this.add.rectangle(cols.rate, cy, Math.max(0, barW * m.winRate), 10, 0x85b156).setOrigin(0, 0.5),
        text(this, cols.rate + barW + 10, cy, `${Math.round(m.winRate * 100)}%`, 14, C.parchment).setOrigin(0, 0.5),
        text(this, cols.kills, cy, `${m.kills}`, 14, C.text).setOrigin(0, 0.5),
        text(this, cols.dealt, cy, `${m.damageDealt}`, 14, C.text).setOrigin(0, 0.5),
        text(this, cols.taken, cy, `${m.damageTaken}`, 14, C.text).setOrigin(0, 0.5),
        text(this, cols.place, cy, m.avgPlacement.toFixed(2), 14, C.text).setOrigin(0, 0.5),
      ]);
    });

    if (models.length > BOARD_ROWS) {
      layer.add(text(this, MARGIN + INNER_W - 16, BOARD_Y + BOARD_H - 18, `+${models.length - BOARD_ROWS} more models`, 11, C.muted).setOrigin(1, 0));
    }
  }

  private renderHistory() {
    const layer = this.historyLayer;
    layer.removeAll(true);
    const matches = this.stats!.matches;
    const x0 = MARGIN + 16;
    const cols = { id: x0, date: x0 + 110, status: x0 + 300, winner: x0 + 440, rounds: 900, turns: 990, kills: 1080 };
    const headY = HISTORY_Y + 44;

    const head: [keyof typeof cols, string][] = [
      ["id", "MATCH"], ["date", "DATE"], ["status", "STATUS"], ["winner", "WINNER"],
      ["rounds", "ROUNDS"], ["turns", "ACTIONS"], ["kills", "KILLS  (by fighter)"],
    ];
    for (const [k, label] of head) layer.add(text(this, cols[k], headY, label, 11, C.muted, { fontStyle: "bold" }));

    if (matches.length === 0) {
      layer.add(text(this, x0, headY + 40, "No matches yet — click NEW GAME", 14, C.text));
      return;
    }

    const statusColor = { finished: C.grass, running: C.gold, interrupted: C.red };

    matches.slice(this.scroll, this.scroll + HISTORY_ROWS).forEach((m, i) => {
      const y = headY + 24 + i * HISTORY_ROW_H;
      const cy = y + HISTORY_ROW_H / 2;
      const winner = m.fighters.find((f) => f.id === m.winnerId);

      const row = this.add
        .rectangle(MARGIN + 2, y, INNER_W - 4, HISTORY_ROW_H - 2, C.panelDark, i % 2 === 0 ? 0.8 : 0.01)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on("pointerover", () => row.setFillStyle(C.teal, 0.7))
        .on("pointerout", () => row.setFillStyle(C.panelDark, i % 2 === 0 ? 0.8 : 0.01))
        .on("pointerdown", () => this.scene.start("Arena", { gameId: m.id }));

      const date = new Date(m.createdAt).toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
      const winnerLabel = winner ? winner.name : m.status === "running" ? "in progress…" : "—";

      layer.add([
        row,
        text(this, cols.id, cy, m.id, 13, C.parchment, { fontStyle: "bold" }).setOrigin(0, 0.5),
        text(this, cols.date, cy, date, 13, C.text).setOrigin(0, 0.5),
        text(this, cols.status, cy, m.status.toUpperCase(), 12, statusColor[m.status], { fontStyle: "bold" }).setOrigin(0, 0.5),
        text(this, cols.winner, cy, winnerLabel, 13, winner ? hex(winner.color) : C.muted, { fontStyle: winner ? "bold" : "normal" }).setOrigin(0, 0.5),
        text(this, cols.rounds, cy, `${m.rounds}`, 13, C.text).setOrigin(0, 0.5),
        text(this, cols.turns, cy, `${m.turns}`, 13, C.text).setOrigin(0, 0.5),
      ]);

      m.fighters.forEach((f, j) => {
        const fx = cols.kills + j * 70;
        layer.add([
          this.add.circle(fx + 5, cy, 5, f.color).setStrokeStyle(1, 0x161c2e),
          text(this, fx + 15, cy, `${f.kills}`, 13, f.id === m.winnerId ? C.parchment : C.text).setOrigin(0, 0.5),
        ]);
      });
    });

    const from = this.scroll + 1;
    const to = Math.min(this.scroll + HISTORY_ROWS, matches.length);
    const hint = matches.length > HISTORY_ROWS ? `${from}–${to} of ${matches.length} · scroll for more` : `${matches.length} matches`;
    layer.add(text(this, MARGIN + INNER_W - 16, HISTORY_Y + HISTORY_H - 22, hint, 11, C.muted).setOrigin(1, 0));
  }
}
