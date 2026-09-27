import Phaser from "phaser";
import { ARENA_TEXT, ARENA_UI } from "../utils/layout";
import { CELL_SIZE, MAX_AP, GRID_WIDTH } from "@ai-arena/shared";

import { COLORS } from "../utils/colors";

const DOT_Y = 46;

// Assembled from the Tiny Swords banner art (248x243); the bottom slice holds the scroll's curls
const PANEL_SLICE = { left: 100, right: 84, top: 68, bottom: 111 };
const PANEL_MIN_W = PANEL_SLICE.left + PANEL_SLICE.right;
const PANEL_MIN_H = PANEL_SLICE.top + PANEL_SLICE.bottom;
// The art is chunky, so the panel is built large and scaled down
const PANEL_SCALE = 0.5;
// The parchment area sits above the panel's centre because the curls hang below it
const PANEL_TEXT_OFFSET = (PANEL_SLICE.top - PANEL_MIN_H / 2) * PANEL_SCALE;
// Panel units, so the parchment keeps a margin around the text once scaled
const BUBBLE_PAD_X = 80;
const BUBBLE_PAD_Y = 70;
// Grows with the speech font so a line of chat still wraps the same way
const BUBBLE_MAX_TEXT_W = ARENA_UI(190);
const BUBBLE_GAP = 6;

export const WARRIOR_COLORS = ["red", "blue", "purple", "yellow", "black"] as const;

// Color follows the fighter slot so older saved games (e.g. green Emerald) still get the right warrior
export function warriorColor(fighterId: string): string {
  const slot = parseInt(fighterId.split("-").pop() ?? "", 10);
  return WARRIOR_COLORS[slot] ?? "black";
}

const SPRITE_SCALE = 0.6;
const SPRITE_Y = -6;

export class Fighter {
  container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private label: Phaser.GameObjects.Text;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFill: Phaser.GameObjects.Rectangle;
  private hpBarBorder: Phaser.GameObjects.Rectangle;
  private hpText: Phaser.GameObjects.Text;
  private apDots: Phaser.GameObjects.Arc[] = [];
  private activeIndicator: Phaser.GameObjects.Ellipse;
  private colorKey: string;
  readonly bubble: Phaser.GameObjects.Container;
  private bubblePanel: Phaser.GameObjects.NineSlice;
  private bubbleText: Phaser.GameObjects.Text;

  private _hp: number;
  private _maxHp: number;
  private _ap: number;
  gridX: number = 0;
  gridY: number = 0;

  constructor(
    private scene: Phaser.Scene,
    public id: string,
    public name: string,
    worldX: number,
    worldY: number,
    public color: number,
    hp: number,
    maxHp: number,
  ) {
    this._hp = hp;
    this._maxHp = maxHp;
    this._ap = MAX_AP;

    this.activeIndicator = scene.add.ellipse(0, 18, 44, 14, 0x000000, 0.25);
    this.activeIndicator.setStrokeStyle(2, 0xe8ce91, 0);

    this.colorKey = warriorColor(id);
    this.sprite = scene.add.sprite(0, SPRITE_Y, `warrior_idle_${this.colorKey}`, 0);
    this.sprite.setScale(SPRITE_SCALE);
    this.sprite.play({ key: `warrior_idle_${this.colorKey}`, startFrame: Phaser.Math.Between(0, 7) });

    this.label = scene.add.text(0, -44, name, {
      fontSize: ARENA_TEXT(11),
      color: "#ffffff",
      fontFamily: "monospace",
      fontStyle: "bold",
      align: "center",
      stroke: "#161c2e",
      strokeThickness: 3,
      // A model name would otherwise stretch across half the board
      wordWrap: { width: CELL_SIZE * 2.8 },
    });
    this.label.setOrigin(0.5);

    const barWidth = CELL_SIZE * 0.7;
    const barHeight = 5;
    const barY = 28;

    this.hpBarBg = scene.add.rectangle(0, barY, barWidth, barHeight, COLORS.HP_BAR_BG);
    this.hpBarFill = scene.add.rectangle(-barWidth / 2, barY, barWidth, barHeight, COLORS.HP_BAR_FILL).setOrigin(0, 0.5);
    this.hpBarBorder = scene.add.rectangle(0, barY, barWidth + 2, barHeight + 2);
    this.hpBarBorder.setStrokeStyle(1, 0x161c2e);

    this.hpText = scene.add.text(0, barY + ARENA_UI(8), `${hp}/${maxHp}`, {
      fontSize: ARENA_TEXT(10),
      color: "#efe1ab",
      fontFamily: "monospace",
      align: "center",
    });
    this.hpText.setOrigin(0.5);


    this.bubbleText = scene.add
      .text(0, 0, "", {
        fontSize: ARENA_TEXT(14),
        color: "#3b3323",
        fontFamily: "monospace",
        align: "center",
        wordWrap: { width: BUBBLE_MAX_TEXT_W },
      })
      .setOrigin(0.5);
    this.bubblePanel = scene.add
      .nineslice(
        0, 0, "banner_panel", undefined, PANEL_MIN_W, PANEL_MIN_H,
        PANEL_SLICE.left, PANEL_SLICE.right, PANEL_SLICE.top, PANEL_SLICE.bottom,
      )
      .setScale(PANEL_SCALE);
    // Kept out of the fighter container and given a depth, so bubbles draw over every fighter and name
    this.bubble = scene.add.container(worldX, worldY, [this.bubblePanel, this.bubbleText]).setVisible(false).setDepth(20);

    this.container = scene.add.container(worldX, worldY, [
      this.activeIndicator,
      this.sprite,
      this.label,
      this.hpBarBg,
      this.hpBarFill,
      this.hpBarBorder,
      this.hpText,
    ]);
    this.setAp(MAX_AP);
  }

  setPosition(worldX: number, worldY: number, gx: number, gy: number) {
    this.container.x = worldX;
    this.container.y = worldY;
    this.bubble.setPosition(worldX, worldY);
    this.gridX = gx;
    this.gridY = gy;
    this.sprite.setFlipX(gx >= GRID_WIDTH / 2);
  }

  /** Shows what this fighter just said, on a little scroll above their name */
  showChat(text: string | null) {
    this.bubble.setVisible(text !== null);
    if (text === null) return;

    this.bubbleText.setText(text);
    const w = Math.max(PANEL_MIN_W, this.bubbleText.width / PANEL_SCALE + BUBBLE_PAD_X);
    const h = Math.max(PANEL_MIN_H, this.bubbleText.height / PANEL_SCALE + BUBBLE_PAD_Y);
    this.bubblePanel.setSize(w, h);

    // Sits just above the name label
    const centreY = -44 - BUBBLE_GAP - (h * PANEL_SCALE) / 2;
    this.bubblePanel.setPosition(0, centreY);
    this.bubbleText.setPosition(0, centreY + PANEL_TEXT_OFFSET);
  }

  playAttack(targetGridX: number) {
    if (targetGridX !== this.gridX) this.sprite.setFlipX(targetGridX < this.gridX);
    const attack = Phaser.Math.Between(1, 2);
    this.sprite.play(`warrior_attack${attack}_${this.colorKey}`);
    this.sprite.chain(`warrior_idle_${this.colorKey}`);
  }

  setHp(hp: number) {
    this._hp = Math.max(0, Math.min(hp, this._maxHp));
    const ratio = this._hp / this._maxHp;
    const barWidth = CELL_SIZE * 0.7;

    // setSize (not .width) so Phaser recomputes the rectangle's geometry; left origin keeps it anchored to the bar start
    this.hpBarFill.setSize(barWidth * ratio, this.hpBarFill.height);
    this.hpBarFill.fillColor = ratio > 0.3 ? COLORS.HP_BAR_FILL : COLORS.HP_BAR_LOW;
    this.hpText.setText(`${this._hp}/${this._maxHp}`);
  }

  setAp(ap: number, maxAp: number = MAX_AP) {
    this._ap = ap;
    const count = Math.max(maxAp, ap);
    while (this.apDots.length < count) {
      const dot = this.scene.add.circle(0, DOT_Y, 3, 0xe8ce91);
      this.apDots.push(dot);
      this.container.add(dot);
    }
    while (this.apDots.length > count) this.apDots.pop()!.destroy();
    this.apDots.forEach((dot, i) => (dot.x = (i - (count - 1) / 2) * 10));

    for (let i = 0; i < this.apDots.length; i++) {
      this.apDots[i].fillColor = i < ap ? 0xe8ce91 : 0x455a4b;
      this.apDots[i].alpha = i < ap ? 1 : 0.4;
    }
  }

  setActive(active: boolean) {
    this.activeIndicator.setStrokeStyle(2, 0xe8ce91, active ? 0.8 : 0);
  }

  setAlive(alive: boolean) {
    this.container.alpha = alive ? 1 : 0.2;
  }

  get hp(): number {
    return this._hp;
  }

  get ap(): number {
    return this._ap;
  }

  destroy() {
    this.bubble.destroy();
    this.container.destroy();
  }
}
