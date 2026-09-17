import Phaser from "phaser";
import { CELL_SIZE, MAX_AP, GRID_WIDTH } from "@ai-arena/shared";

const DOT_Y = 46;
import { COLORS } from "../utils/colors";

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
      fontSize: "11px",
      color: "#ffffff",
      fontFamily: "monospace",
      fontStyle: "bold",
      align: "center",
      stroke: "#161c2e",
      strokeThickness: 3,
    });
    this.label.setOrigin(0.5);

    const barWidth = CELL_SIZE * 0.7;
    const barHeight = 5;
    const barY = 28;

    this.hpBarBg = scene.add.rectangle(0, barY, barWidth, barHeight, COLORS.HP_BAR_BG);
    this.hpBarFill = scene.add.rectangle(-barWidth / 2, barY, barWidth, barHeight, COLORS.HP_BAR_FILL).setOrigin(0, 0.5);
    this.hpBarBorder = scene.add.rectangle(0, barY, barWidth + 2, barHeight + 2);
    this.hpBarBorder.setStrokeStyle(1, 0x161c2e);

    this.hpText = scene.add.text(0, barY + 8, `${hp}/${maxHp}`, {
      fontSize: "8px",
      color: "#efe1ab",
      fontFamily: "monospace",
      align: "center",
    });
    this.hpText.setOrigin(0.5);


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
    this.gridX = gx;
    this.gridY = gy;
    this.sprite.setFlipX(gx >= GRID_WIDTH / 2);
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
    this.container.destroy();
  }
}
