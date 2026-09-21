import Phaser from "phaser";
import { warriorColor } from "../objects/Fighter";
import { addMuteButton } from "../utils/sound";
import { LAYOUT } from "../utils/layout";

import { STATS_URL, IS_STATIC } from "../utils/api";
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

const W = LAYOUT.width;
const MARGIN = LAYOUT.margin;
const INNER_W = W - MARGIN * 2;
const PORTRAIT = LAYOUT.portrait;
// Portrait metrics below are drawn against text at 1.35x, so they follow the layout's text scale
const S = PORTRAIT ? LAYOUT.textScale / 1.35 : 1;
/** Scales a hand-tuned portrait offset; a no-op in landscape */
const P = (n: number) => Math.round(n * S);
const trunc = (v: string, max: number) => (v.length > max ? v.slice(0, max - 1) + "\u2026" : v);

// Portrait stacks the cards two per row, so the panels below start lower
const SUMMARY_Y = PORTRAIT ? P(170) : 120;
const SUMMARY_H = PORTRAIT ? P(190) : 78;

const BOARD_Y = SUMMARY_Y + SUMMARY_H + P(20);
const BOARD_H = PORTRAIT ? P(340) : 300;
const BOARD_ROW_H = PORTRAIT ? P(64) : 46;
const BOARD_ROWS = Math.floor((BOARD_H - P(70)) / BOARD_ROW_H);

const HISTORY_Y = BOARD_Y + BOARD_H + P(20);
const HISTORY_H = PORTRAIT ? LAYOUT.height - HISTORY_Y - P(30) : 425;
const HISTORY_ROW_H = PORTRAIT ? P(46) : 34;
const HISTORY_ROWS = Math.floor((HISTORY_H - P(76)) / HISTORY_ROW_H);

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
  elo: number;
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
  // Portrait gets larger text throughout; headings start big enough already
  const px = Math.round(size * (PORTRAIT ? (size < 26 ? 1.35 : 1) * S : 1));
  return scene.add.text(x, y, value, { fontSize: `${px}px`, color, fontFamily: "monospace", ...extra });
}

export class MenuScene extends Phaser.Scene {
  private stats: Stats | null = null;
  private scroll = 0;
  private boardScroll = 0;
  // A drag that moved this far scrolled the list, so the finger that lifts is not picking a match
  private dragFromY = 0;
  private dragFromScroll = 0;
  private dragDistance = 0;
  private dragPanel: "board" | "history" | null = null;
  private summaryLayer!: Phaser.GameObjects.Container;
  private boardLayer!: Phaser.GameObjects.Container;
  private historyLayer!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;
  private playButton!: Phaser.GameObjects.Text;

  constructor() {
    super("Menu");
  }

  create() {
    this.stats = null;
    this.scroll = 0;
    this.boardScroll = 0;

    text(this, MARGIN, P(28), "TINY AI ARENA", PORTRAIT ? 30 : 36, C.gold, { fontStyle: "bold", stroke: C.navy, strokeThickness: 4 });
    text(this, MARGIN, PORTRAIT ? P(66) : 72, "leaderboard & match history", 13, C.text);
    this.statusText = text(this, MARGIN, PORTRAIT ? P(86) : 92, "Loading…", 12, C.muted);

    this.playButton = text(this, W - MARGIN, PORTRAIT ? P(110) : 44, IS_STATIC ? "REPLAYS" : "NEW GAME", 18, C.navy, {
      fontStyle: "bold",
      backgroundColor: C.grass,
      padding: { x: P(16), y: P(8) },
    })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        if (IS_STATIC) return;
        this.scene.start("Arena", { newGame: true });
      });
    if (IS_STATIC) this.playButton.disableInteractive().setBackgroundColor(C.teal as unknown as string);

    addMuteButton(this, PORTRAIT ? MARGIN : W - MARGIN, PORTRAIT ? P(112) : 90, PORTRAIT ? 0 : 1);

    this.summaryLayer = this.add.container();
    this.boardLayer = this.add.container();
    this.historyLayer = this.add.container();

    this.drawPanel(BOARD_Y, BOARD_H, "LEADERBOARD", C.gold, "Elo from finished matches; everyone starts at 1000", "Elo · everyone starts at 1000");
    this.drawPanel(HISTORY_Y, HISTORY_H, "MATCH HISTORY", "#93ba4f", "click a match to watch it", "tap a match to watch");
    this.children.bringToTop(this.boardLayer);
    this.children.bringToTop(this.historyLayer);

    this.input.on("wheel", (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const panel = this.panelAt(p.y);
      if (panel) this.scrollTo(panel, this.scrollOf(panel) + Math.sign(dy) * 3);
    });

    // A phone has no wheel, so both lists are dragged with a finger instead
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.dragPanel = this.panelAt(p.y);
      this.dragFromY = p.y;
      this.dragFromScroll = this.dragPanel ? this.scrollOf(this.dragPanel) : 0;
      this.dragDistance = 0;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.dragPanel || !p.isDown) return;
      const dy = p.y - this.dragFromY;
      this.dragDistance = Math.max(this.dragDistance, Math.abs(dy));
      const rowHeight = this.dragPanel === "board" ? BOARD_ROW_H : HISTORY_ROW_H;
      this.scrollTo(this.dragPanel, this.dragFromScroll - Math.round(dy / rowHeight));
    });

    this.fetchStats();
    if (!IS_STATIC) this.time.addEvent({ delay: REFRESH_MS, loop: true, callback: () => this.fetchStats() });
  }

  /** Which list, if any, the pointer is over */
  private panelAt(y: number): "board" | "history" | null {
    if (y >= BOARD_Y && y <= BOARD_Y + BOARD_H) return "board";
    if (y >= HISTORY_Y && y <= HISTORY_Y + HISTORY_H) return "history";
    return null;
  }

  private scrollOf(panel: "board" | "history") {
    return panel === "board" ? this.boardScroll : this.scroll;
  }

  private scrollTo(panel: "board" | "history", to: number) {
    if (!this.stats) return;
    const board = panel === "board";
    const total = board ? this.stats.models.length : this.stats.matches.length;
    const next = Phaser.Math.Clamp(to, 0, Math.max(0, total - (board ? BOARD_ROWS : HISTORY_ROWS)));
    if (next === this.scrollOf(panel)) return;
    if (board) {
      this.boardScroll = next;
      this.renderBoard();
    } else {
      this.scroll = next;
      this.renderHistory();
    }
  }

  private async fetchStats() {
    try {
      const resp = await fetch(STATS_URL);
      if (!resp.ok) throw new Error(String(resp.status));
      const stats: Stats = await resp.json();
      if (!this.sys.isActive()) return;
      this.stats = stats;
      this.scroll = Math.min(this.scroll, Math.max(0, stats.matches.length - HISTORY_ROWS));
      this.boardScroll = Math.min(this.boardScroll, Math.max(0, stats.models.length - BOARD_ROWS));
      this.statusText.setText(`Updated ${new Date().toLocaleTimeString()}`).setColor(C.muted);
      if (!IS_STATIC) {
        const live = stats.matches.filter((m) => m.status === "running").length;
        this.statusText.setText(live ? `Updated ${new Date().toLocaleTimeString()} · ${live} running` : `Updated ${new Date().toLocaleTimeString()}`);
      }
      this.renderSummary();
      this.renderBoard();
      this.renderHistory();
    } catch {
      if (!this.sys.isActive()) return;
      this.statusText.setText(IS_STATIC ? "Replay data missing" : "Can't reach the server on :3001").setColor(C.red);
    }
  }

  // Phone text is wide enough that the hint needs a shorter wording to clear the title
  private drawPanel(y: number, h: number, title: string, titleColor: string, hint: string, shortHint: string) {
    this.add.rectangle(MARGIN, y, INNER_W, h, C.panel, 0.95).setOrigin(0).setStrokeStyle(2, C.teal);
    text(this, MARGIN + P(16), y + P(12), title, 15, titleColor, { fontStyle: "bold" });
    text(this, MARGIN + INNER_W - P(16), y + P(14), PORTRAIT ? shortHint : hint, 11, C.muted).setOrigin(1, 0);
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
    const gap = P(16);
    // One row of five in landscape; portrait wraps to three per row
    const perRow = PORTRAIT ? 3 : cards.length;
    const w = (INNER_W - gap * (perRow - 1)) / perRow;
    const h = PORTRAIT ? P(86) : 78;
    cards.forEach(([label, value, color], i) => {
      const x = MARGIN + (i % perRow) * (w + gap);
      const y = SUMMARY_Y + Math.floor(i / perRow) * (h + gap);
      layer.add([
        this.add.rectangle(x, y, w, h, C.panelDark, 0.95).setOrigin(0).setStrokeStyle(2, C.teal),
        text(this, x + P(14), y + P(12), value, PORTRAIT ? 26 : 30, color, { fontStyle: "bold" }),
        text(this, x + P(14), y + (PORTRAIT ? P(56) : 52), label, 11, C.muted),
      ]);
    });
  }

  private renderBoard() {
    const layer = this.boardLayer;
    layer.removeAll(true);
    const models = this.stats!.models;
    const x0 = MARGIN + P(16);
    const headY = BOARD_Y + P(42);

    if (!PORTRAIT) {
      const cols = { rank: x0, model: x0 + 40, elo: 500, played: 590, wins: 670, rate: 750, kills: 970, dealt: 1055, taken: 1165, place: 1280 };
      const head: [keyof typeof cols, string][] = [
        ["rank", "#"], ["model", "MODEL"], ["elo", "ELO"], ["played", "PLAYED"], ["wins", "WINS"], ["rate", "WIN RATE"],
        ["kills", "KILLS"], ["dealt", "DMG DEALT"], ["taken", "DMG TAKEN"], ["place", "AVG PLACE"],
      ];
      for (const [k, label] of head) layer.add(text(this, cols[k], headY, label, 11, C.muted, { fontStyle: "bold" }));

      if (models.length === 0) {
        layer.add(text(this, x0, headY + 40, "No finished matches yet — click NEW GAME", 14, C.text));
        return;
      }

      models.slice(this.boardScroll, this.boardScroll + BOARD_ROWS).forEach((m, i) => {
        const rank = this.boardScroll + i;
        const y = headY + 22 + i * BOARD_ROW_H;
        const cy = y + BOARD_ROW_H / 2;
        if (i % 2 === 0) layer.add(this.add.rectangle(MARGIN + 2, y, INNER_W - 4, BOARD_ROW_H, C.panelDark, 0.8).setOrigin(0));

        const warrior = this.warriorIcon(cols.model + 18, cy - 4, m.fighterId, i, 0.32);
        const barW = 120;
        layer.add([
          text(this, cols.rank, cy, `${rank + 1}`, 16, rank === 0 ? C.gold : C.text, { fontStyle: "bold" }).setOrigin(0, 0.5),
          warrior,
          text(this, cols.model + 44, cy, shortModel(m.model), 14, hex(m.color), { fontStyle: "bold" }).setOrigin(0, 0.5),
          text(this, cols.elo, cy, `${m.elo}`, 15, rank === 0 ? C.gold : C.parchment, { fontStyle: "bold" }).setOrigin(0, 0.5),
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
    } else {
      // Too narrow for ten columns: model and Elo on top, the rest underneath
      if (models.length === 0) {
        layer.add(text(this, x0, headY, "No finished matches yet", 14, C.text));
        return;
      }
      models.slice(this.boardScroll, this.boardScroll + BOARD_ROWS).forEach((m, i) => {
        const rank = this.boardScroll + i;
        const y = headY + i * BOARD_ROW_H;
        if (i % 2 === 0) layer.add(this.add.rectangle(MARGIN + 2, y - P(6), INNER_W - 4, BOARD_ROW_H, C.panelDark, 0.8).setOrigin(0));
        // Abbreviated: at this text size the spelled-out stats line runs past the panel
        const stats = `${m.played} played · ${m.wins}W · ${Math.round(m.winRate * 100)}% · ${m.kills}K · place ${m.avgPlacement.toFixed(2)}`;
        layer.add([
          text(this, x0, y + P(6), `${rank + 1}`, 16, rank === 0 ? C.gold : C.text, { fontStyle: "bold" }).setOrigin(0, 0.5),
          this.warriorIcon(x0 + P(40), y + P(2), m.fighterId, i, 0.3 * S),
          text(this, x0 + P(64), y + P(6), shortModel(m.model), 15, hex(m.color), { fontStyle: "bold" }).setOrigin(0, 0.5),
          text(this, MARGIN + INNER_W - P(16), y + P(6), `${m.elo}`, 17, rank === 0 ? C.gold : C.parchment, { fontStyle: "bold" }).setOrigin(1, 0.5),
          text(this, x0 + P(40), y + P(28), stats, 12, C.muted).setOrigin(0, 0.5),
        ]);
      });
    }

    const below = models.length - BOARD_ROWS - this.boardScroll;
    if (below > 0) {
      layer.add(text(this, MARGIN + INNER_W - P(16), BOARD_Y + BOARD_H - P(18), `+${below} more models — scroll`, 11, C.muted).setOrigin(1, 0));
    }
  }

  private warriorIcon(x: number, y: number, fighterId: string, seed: number, scale: number) {
    const key = `warrior_idle_${warriorColor(fighterId)}`;
    return this.add.sprite(x, y, key, 0).setScale(scale).play({ key, startFrame: seed % 8 });
  }

  private renderHistory() {
    const layer = this.historyLayer;
    layer.removeAll(true);
    const matches = this.stats!.matches;
    const x0 = MARGIN + P(16);
    const cols = { id: x0, date: x0 + 110, status: x0 + 300, winner: x0 + 440, rounds: 900, turns: 990, kills: 1080 };
    const headY = HISTORY_Y + P(44);

    const head: [keyof typeof cols, string][] = [
      ["id", "MATCH"], ["date", "DATE"], ["status", "STATUS"], ["winner", "WINNER"],
      ["rounds", "ROUNDS"], ["turns", "ACTIONS"], ["kills", "KILLS  (by fighter)"],
    ];
    if (!PORTRAIT) for (const [k, label] of head) layer.add(text(this, cols[k], headY, label, 11, C.muted, { fontStyle: "bold" }));

    if (matches.length === 0) {
      layer.add(text(this, x0, headY + 40, "No matches yet — click NEW GAME", 14, C.text));
      return;
    }

    const statusColor = { finished: C.grass, running: C.gold, interrupted: C.red };

    matches.slice(this.scroll, this.scroll + HISTORY_ROWS).forEach((m, i) => {
      const y = headY + P(24) + i * HISTORY_ROW_H;
      const cy = y + HISTORY_ROW_H / 2;
      const winner = m.fighters.find((f) => f.id === m.winnerId);

      const row = this.add
        .rectangle(MARGIN + 2, y, INNER_W - 4, HISTORY_ROW_H - 2, C.panelDark, i % 2 === 0 ? 0.8 : 0.01)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on("pointerover", () => row.setFillStyle(C.teal, 0.7))
        .on("pointerout", () => row.setFillStyle(C.panelDark, i % 2 === 0 ? 0.8 : 0.01))
        // Opens on release, so a finger dragging the list past a row doesn't open it
        .on("pointerup", () => {
          if (this.dragDistance < 12) this.scene.start("Arena", { gameId: m.id });
        });

      const date = new Date(m.createdAt).toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
      const winnerLabel = winner ? winner.name : m.status === "running" ? "in progress…" : "—";

      if (PORTRAIT) {
        // Two lines per match: id and status on top, winner and counts underneath
        layer.add([
          row,
          text(this, cols.id, cy - P(10), m.id, 14, C.parchment, { fontStyle: "bold" }).setOrigin(0, 0.5),
          text(this, cols.id + P(90), cy - P(10), m.status.toUpperCase(), 11, statusColor[m.status], { fontStyle: "bold" }).setOrigin(0, 0.5),
          text(this, MARGIN + INNER_W - P(16), cy - P(10), date, 12, C.muted).setOrigin(1, 0.5),
          // The winner carries its model name, which has to give way to the counts on its right
          text(this, cols.id, cy + P(10), trunc(winnerLabel, 24), 12, winner ? hex(winner.color) : C.muted, { fontStyle: winner ? "bold" : "normal" }).setOrigin(0, 0.5),
          text(this, MARGIN + INNER_W - P(16), cy + P(10), `${m.rounds} rounds · ${m.turns} actions`, 11, C.text).setOrigin(1, 0.5),
        ]);
        return;
      }

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
