import type { ArenaScene, ChatLine, FeedEvent, FrameEvent, LogLine, StatusEvent } from "../scenes/ArenaScene";
import { IS_STATIC } from "../utils/api";
import { isMuted, toggleMute } from "../utils/sound";
import { el, must } from "./dom";

/** Within this many pixels of the end counts as "following", so new entries keep scrolling into view. */
const TAIL_SLACK = 24;

function atBottom(box: HTMLElement) {
  return box.scrollHeight - box.scrollTop - box.clientHeight <= TAIL_SLACK;
}

/**
 * The arena's chrome. It owns no game state: it renders what ArenaScene emits and calls back into
 * the scene for playback. The board itself is the canvas inside #board, which this never touches.
 */
export class ArenaHud {
  private readonly frameLabel = must("#arena-frame");
  private readonly roundLabel = must("#arena-round");
  private readonly statusLabel = must("#arena-status");

  private readonly logBody = must("#log-body");
  private readonly logFeed = must<HTMLOListElement>("#log-feed");
  private readonly logHint = must("#log-hint");
  private readonly chatBody = must("#chat-body");
  private readonly chatFeed = must<HTMLOListElement>("#chat-feed");
  private readonly chatHint = must("#chat-hint");

  private readonly btnFirst = must<HTMLButtonElement>("#btn-first");
  private readonly btnPrev = must<HTMLButtonElement>("#btn-prev");
  private readonly btnNext = must<HTMLButtonElement>("#btn-next");
  private readonly btnLast = must<HTMLButtonElement>("#btn-last");
  private readonly btnAuto = must<HTMLButtonElement>("#btn-auto");
  private readonly btnNew = must<HTMLButtonElement>("#btn-new");
  private readonly btnMute = must<HTMLButtonElement>("#btn-mute");
  private readonly btnMenu = must<HTMLButtonElement>("#btn-menu");

  private currentLogLine: HTMLElement | null = null;

  constructor(
    private readonly scene: ArenaScene,
    private readonly onLeave: () => void,
  ) {
    this.bindButtons();
    this.bindScene();
    this.bindKeys();

    for (const [box, hint] of [
      [this.logBody, this.logHint],
      [this.chatBody, this.chatHint],
    ] as const) {
      box.addEventListener("scroll", () => {
        hint.textContent = atBottom(box) ? "" : "scrolled back";
      });
    }

    // A static export has no server to ask for a new match
    this.btnNew.hidden = IS_STATIC;
    this.syncMute();
  }

  private bindButtons() {
    this.btnFirst.addEventListener("click", () => this.scene.goToFirst());
    this.btnPrev.addEventListener("click", () => this.scene.stepBackward());
    this.btnNext.addEventListener("click", () => this.scene.stepForward());
    this.btnLast.addEventListener("click", () => this.scene.goToLast());
    this.btnAuto.addEventListener("click", () => this.scene.toggleAutoPlay());
    this.btnNew.addEventListener("click", () => this.scene.startNewGame());
    this.btnMute.addEventListener("click", () => {
      toggleMute();
      this.syncMute();
    });
    this.btnMenu.addEventListener("click", () => this.onLeave());
  }

  private bindScene() {
    const events = this.scene.events;

    events.on("frame", (e: FrameEvent) => {
      const empty = e.total === 0;
      this.frameLabel.textContent = empty ? "No frames yet" : `Frame ${e.index + 1} / ${e.total}`;
      this.roundLabel.textContent = e.round > 0 ? `Round ${e.round}` : e.round === 0 ? "Pre-game" : "Game Over";

      this.btnFirst.disabled = empty || e.index <= 0;
      this.btnPrev.disabled = empty || e.index <= 0;
      this.btnNext.disabled = empty || e.index >= e.total - 1;
      this.btnLast.disabled = empty || e.index >= e.total - 1;
      this.btnAuto.disabled = empty;
    });

    events.on("status", (e: StatusEvent) => {
      this.statusLabel.textContent = e.text;
      this.statusLabel.className = e.tone === "muted" ? "status" : `status ${e.tone}`;
    });

    events.on("autoplay", (playing: boolean) => {
      // Red only while it is running — the canvas version painted both states red, so the
      // button never actually changed
      this.btnAuto.textContent = playing ? "STOP" : "AUTO PLAY";
      this.btnAuto.classList.toggle("stop", playing);
    });

    events.on("log", (e: FeedEvent<LogLine>) => {
      this.applyFeed(this.logFeed, this.logBody, e, (line) =>
        el("li", { class: line.kind, text: line.text }),
      );
      this.currentLogLine?.classList.remove("current");
      this.currentLogLine = (this.logFeed.children[e.current] as HTMLElement) ?? null;
      this.currentLogLine?.classList.add("current");
    });

    events.on("chat", (e: FeedEvent<ChatLine>) => {
      this.applyFeed(this.chatFeed, this.chatBody, e, (line) =>
        el("li", { class: "chat-line" }, [
          el("span", { class: "who", text: `${line.who}: `, style: { color: line.color } }),
          line.text,
        ]),
      );
    });
  }

  /**
   * Drops the entries the scene says are no longer current, appends the new ones, and keeps the
   * view pinned to the end only for a reader who was already there.
   */
  private applyFeed<T>(
    feed: HTMLOListElement,
    box: HTMLElement,
    event: FeedEvent<T>,
    render: (line: T) => HTMLLIElement,
  ) {
    const following = atBottom(box);
    while (feed.children.length > event.from) feed.removeChild(feed.lastChild!);
    for (const line of event.lines) feed.appendChild(render(line));
    if (following) {
      box.scrollTop = box.scrollHeight;
      // The listener only fires on a real scroll, so clear a stale hint here too
      (box === this.logBody ? this.logHint : this.chatHint).textContent = "";
    }
  }

  private bindKeys() {
    window.addEventListener("keydown", (event) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      // Space and Enter belong to whichever button has focus, or they would fire twice
      if (tag === "BUTTON" && (event.key === " " || event.key === "Enter")) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.getElementById("arena-screen")?.hidden) return;

      switch (event.key) {
        case "ArrowRight": this.scene.stepForward(); break;
        case "ArrowLeft": this.scene.stepBackward(); break;
        case "Home": this.scene.goToFirst(); break;
        case "End": this.scene.goToLast(); break;
        case " ": this.scene.toggleAutoPlay(); break;
        case "Escape": this.onLeave(); return;
        case "m":
        case "M": toggleMute(); this.syncMute(); break;
        default: return;
      }
      event.preventDefault();
    });
  }

  private syncMute() {
    this.btnMute.textContent = isMuted() ? "SOUND: OFF" : "SOUND: ON";
  }
}
