import type { MatchSummary, ModelStats, Stats } from "@ai-arena/shared";
import { warriorColor } from "../objects/Fighter";
import { IS_STATIC, STATS_URL } from "../utils/api";
import { isMuted, toggleMute } from "../utils/sound";
import { append, clear, el, must } from "./dom";
import { hex } from "./theme";

const REFRESH_MS = 5000;

const shortModel = (m: string) => m.split("/").pop() ?? m;

// `num` marks a column whose values are right-aligned, so its heading follows them
const BOARD_COLUMNS = ["#", "", "MODEL", "ELO num", "PLAYED num", "WINS num", "WIN RATE", "KILLS num", "DMG DEALT num", "DMG TAKEN num", "AVG PLACE num"];
const HISTORY_COLUMNS = ["MATCH", "DATE", "STATUS", "WINNER", "ROUNDS num", "ACTIONS num", "KILLS  (by fighter)"];

/**
 * The leaderboard and match history. Rebuilt from a stats poll; the panels keep their scroll
 * position across refreshes so a reader partway down a list is not thrown back to the top.
 */
export class MenuView {
  private readonly root = must("#menu-screen");
  private status!: HTMLElement;
  private cards!: HTMLElement;
  private boardBody!: HTMLElement;
  private boardRows!: HTMLTableSectionElement;
  private historyBody!: HTMLElement;
  private historyRows!: HTMLTableSectionElement;
  private muteButton!: HTMLButtonElement;

  private timer: number | null = null;
  private stats: Stats | null = null;

  constructor(
    private readonly onWatch: (gameId: string) => void,
    private readonly onNewGame: () => void,
  ) {
    this.build();
  }

  /** Renders the last stats we have, then starts refreshing while the menu is on screen. */
  show() {
    this.root.hidden = false;
    // Built before BootScene loads the stored preference, so the label can start out stale
    this.syncMute();
    this.fetchStats();
    if (!IS_STATIC && this.timer === null) {
      this.timer = window.setInterval(() => this.fetchStats(), REFRESH_MS);
    }
  }

  hide() {
    this.root.hidden = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private build() {
    this.status = el("p", { class: "status", text: "Loading…" });
    this.cards = el("div", { class: "cards" });

    this.muteButton = el("button", {
      class: "alt",
      attrs: { type: "button" },
      on: { click: () => { toggleMute(); this.syncMute(); } },
    });
    this.syncMute();

    const play = el("button", {
      class: "go",
      text: IS_STATIC ? "REPLAYS" : "NEW GAME",
      attrs: { type: "button", disabled: IS_STATIC },
      title: IS_STATIC ? "This is a replay site — matches are run on the live server" : "",
      on: { click: () => this.onNewGame() },
    });

    this.boardRows = el("tbody");
    this.historyRows = el("tbody");

    const board = this.panel(
      "LEADERBOARD",
      "Elo from finished matches; everyone starts at 1000",
      "board-panel",
      el("table", { class: "board-table" }, [headRow(BOARD_COLUMNS), this.boardRows]),
    );
    const history = this.panel(
      "MATCH HISTORY",
      "click a match to watch it",
      "history-panel leaf",
      el("table", { class: "history-table" }, [headRow(HISTORY_COLUMNS), this.historyRows]),
    );
    this.boardBody = board.querySelector(".body") as HTMLElement;
    this.historyBody = history.querySelector(".body") as HTMLElement;

    append(this.root, [
      el("div", { class: "page-head" }, [
        el("div", { class: "titles" }, [
          el("h1", { text: "TINY AI ARENA" }),
          el("p", { class: "sub", text: "leaderboard & match history" }),
          this.status,
        ]),
        el("div", { class: "actions" }, [this.muteButton, play]),
      ]),
      this.cards,
      board,
      history,
    ]);
  }

  private panel(title: string, hint: string, className: string, table: HTMLElement) {
    return el("section", { class: `panel ${className}` }, [
      el("header", {}, [el("h2", { text: title }), el("span", { class: "hint", text: hint })]),
      el("div", { class: "body" }, [table]),
    ]);
  }

  private async fetchStats() {
    try {
      const resp = await fetch(STATS_URL);
      if (!resp.ok) throw new Error(String(resp.status));
      const stats: Stats = await resp.json();
      this.stats = stats;

      const time = new Date().toLocaleTimeString();
      const live = stats.matches.filter((m) => m.status === "running").length;
      this.status.className = "status";
      this.status.textContent = !IS_STATIC && live ? `Updated ${time} · ${live} running` : `Updated ${time}`;

      this.render(stats);
    } catch {
      this.status.className = "status error";
      this.status.textContent = IS_STATIC ? "Replay data missing" : "Can't reach the server on :3001";
    }
  }

  private render(stats: Stats) {
    this.renderCards(stats);
    // Refreshing under a reader's finger should not scroll the list back to the top
    const scrolls = [this.boardBody.scrollTop, this.historyBody.scrollTop];
    this.renderBoard(stats.models);
    this.renderHistory(stats.matches);
    this.boardBody.scrollTop = scrolls[0];
    this.historyBody.scrollTop = scrolls[1];
  }

  private renderCards({ totals }: Stats) {
    clear(this.cards);
    const cards: [string, string, string][] = [
      ["MATCHES", `${totals.games}`, "var(--gold)"],
      ["FINISHED", `${totals.finished}`, "var(--grass)"],
      ["RUNNING", `${totals.running}`, "var(--gold)"],
      ["INTERRUPTED", `${totals.interrupted}`, "var(--red)"],
      ["AVG ROUNDS", totals.avgRounds.toFixed(1), "var(--parchment)"],
    ];
    for (const [label, value, color] of cards) {
      this.cards.appendChild(
        el("div", { class: "card" }, [
          el("div", { class: "value", text: value, style: { color } }),
          el("div", { class: "label", text: label }),
        ]),
      );
    }
  }

  private renderBoard(models: ModelStats[]) {
    clear(this.boardRows);
    if (models.length === 0) {
      this.boardRows.appendChild(
        el("tr", { class: "empty-row" }, [
          el("td", {
            class: "empty",
            text: IS_STATIC ? "No finished matches yet" : "No finished matches yet — click NEW GAME",
            attrs: { colspan: BOARD_COLUMNS.length },
          }),
        ]),
      );
      return;
    }

    models.forEach((m, i) => {
      const pct = Math.round(m.winRate * 100);
      this.boardRows.appendChild(
        el("tr", { class: i === 0 ? "top" : "" }, [
          el("td", { class: "rank", text: i + 1 }),
          el("td", { class: "icon" }, [warriorIcon(m.fighterId, i)]),
          el("td", { class: "model", text: shortModel(m.model), style: { color: hex(m.color) } }),
          el("td", { class: "elo num", text: m.elo }),
          el("td", { class: "num wide-only", text: m.played }),
          el("td", { class: "num wide-only", text: m.wins }),
          el("td", { class: "wide-only" }, [
            el("div", { class: "bar-cell" }, [
              el("span", { class: "bar" }, [el("div", { style: { width: `${pct}%` } })]),
              el("span", { text: `${pct}%` }),
            ]),
          ]),
          el("td", { class: "num wide-only", text: m.kills }),
          el("td", { class: "num wide-only", text: m.damageDealt }),
          el("td", { class: "num wide-only", text: m.damageTaken }),
          el("td", { class: "num wide-only", text: m.avgPlacement.toFixed(2) }),
          // Folded-up version of the columns above, shown only on a narrow screen
          el("td", {
            class: "detail",
            text: `${m.played} played · ${m.wins}W · ${pct}% · ${m.kills}K · place ${m.avgPlacement.toFixed(2)}`,
          }),
        ]),
      );
    });
  }

  private renderHistory(matches: MatchSummary[]) {
    clear(this.historyRows);
    if (matches.length === 0) {
      this.historyRows.appendChild(
        el("tr", { class: "empty-row" }, [
          el("td", {
            class: "empty",
            text: IS_STATIC ? "No matches yet" : "No matches yet — click NEW GAME",
            attrs: { colspan: HISTORY_COLUMNS.length },
          }),
        ]),
      );
      return;
    }

    for (const match of matches) {
      const winner = match.fighters.find((f) => f.id === match.winnerId);
      const winnerLabel = winner ? winner.name : match.status === "running" ? "in progress…" : "—";
      const date = new Date(match.createdAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      this.historyRows.appendChild(
        el("tr", { class: "match", on: { click: () => this.onWatch(match.id) } }, [
          el("td", { class: "match-id", text: match.id }),
          el("td", { class: "date", text: date }),
          el("td", { class: `status-cell st-${match.status}`, text: match.status.toUpperCase() }),
          el("td", {
            class: winner ? "winner" : "winner none",
            text: winnerLabel,
            style: winner ? { color: hex(winner.color) } : {},
          }),
          el("td", { class: "num wide-only", text: match.rounds }),
          el("td", { class: "num wide-only", text: match.turns }),
          el("td", { class: "wide-only" }, [
            el(
              "div",
              { class: "kills" },
              match.fighters.map((f) =>
                el("span", {}, [
                  el("span", { class: "dot", style: { background: hex(f.color) } }),
                  el("span", { text: f.kills }),
                ]),
              ),
            ),
          ]),
          el("td", { class: "counts", text: `${match.rounds} rounds · ${match.turns} actions` }),
        ]),
      );
    }
  }

  private syncMute() {
    this.muteButton.textContent = isMuted() ? "SOUND: OFF" : "SOUND: ON";
  }
}

// The head is hidden entirely on narrow screens, where rows stack into two lines instead.
function headRow(labels: string[]) {
  return el("thead", {}, [
    el("tr", {}, labels.map((label) => {
      const num = label.endsWith(" num");
      return el("th", { class: num ? "num" : "", text: num ? label.slice(0, -4) : label });
    })),
  ]);
}

/** The same idle warrior the board draws, as a CSS sprite so the menu needs no canvas. */
function warriorIcon(fighterId: string, seed: number) {
  const color = warriorColor(fighterId);
  return el("span", {
    class: "warrior",
    style: {
      backgroundImage: `url(assets/units/${color}/Warrior_Idle.png)`,
      // Staggered so a column of warriors does not march in lockstep
      animationDelay: `${(seed % 8) * -0.125}s`,
    },
  });
}
