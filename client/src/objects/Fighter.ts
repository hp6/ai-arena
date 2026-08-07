import Phaser from "phaser";
import { CELL_SIZE, MAX_AP } from "@ai-arena/shared";
import { COLORS } from "../utils/colors";

export class Fighter {
  container: Phaser.GameObjects.Container;
  private circle: Phaser.GameObjects.Arc;
  private label: Phaser.GameObjects.Text;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFill: Phaser.GameObjects.Rectangle;
  private hpText: Phaser.GameObjects.Text;
  private apDots: Phaser.GameObjects.Arc[] = [];
  private coordsText: Phaser.GameObjects.Text;
  private activeIndicator: Phaser.GameObjects.Arc;

  private _hp: number;
  private _maxHp: number;
  private _ap: number;
  private radius: number;
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
    this.radius = CELL_SIZE * 0.35;

    this.activeIndicator = scene.add.circle(0, 0, this.radius + 4, 0xffffff, 0);
    this.activeIndicator.setStrokeStyle(2, 0xffff00, 0);

    this.circle = scene.add.circle(0, 0, this.radius, color);
    this.circle.setStrokeStyle(2, 0xffffff, 0.3);

    this.label = scene.add.text(0, -this.radius - 16, name, {
      fontSize: "11px",
      color: COLORS.TEXT,
      fontFamily: "monospace",
      fontStyle: "bold",
      align: "center",
    });
    this.label.setOrigin(0.5);

    const barWidth = CELL_SIZE * 0.7;
    const barHeight = 4;
    const barY = this.radius + 8;

    this.hpBarBg = scene.add.rectangle(0, barY, barWidth, barHeight, COLORS.HP_BAR_BG);
    this.hpBarFill = scene.add.rectangle(0, barY, barWidth, barHeight, COLORS.HP_BAR_FILL);

    this.hpText = scene.add.text(0, barY + 8, `${hp}/${maxHp}`, {
      fontSize: "8px",
      color: "#aaa",
      fontFamily: "monospace",
      align: "center",
    });
    this.hpText.setOrigin(0.5);

    // AP dots below HP
    const dotY = barY + 18;
    for (let i = 0; i < MAX_AP; i++) {
      const dotX = (i - (MAX_AP - 1) / 2) * 10;
      const dot = scene.add.circle(dotX, dotY, 3, 0xf1c40f);
      this.apDots.push(dot);
    }

    this.coordsText = scene.add.text(0, dotY + 10, "", {
      fontSize: "7px",
      color: "#666",
      fontFamily: "monospace",
      align: "center",
    });
    this.coordsText.setOrigin(0.5);

    this.container = scene.add.container(worldX, worldY, [
      this.activeIndicator,
      this.circle,
      this.label,
      this.hpBarBg,
      this.hpBarFill,
      this.hpText,
      ...this.apDots,
      this.coordsText,
    ]);
  }

  setPosition(worldX: number, worldY: number, gx: number, gy: number) {
    this.container.x = worldX;
    this.container.y = worldY;
    this.gridX = gx;
    this.gridY = gy;
    this.coordsText.setText(`(${gx},${gy})`);
  }

  setHp(hp: number) {
    this._hp = Math.max(0, Math.min(hp, this._maxHp));
    const ratio = this._hp / this._maxHp;
    const barWidth = CELL_SIZE * 0.7;

    this.hpBarFill.width = barWidth * ratio;
    this.hpBarFill.x = -(barWidth * (1 - ratio)) / 2;
    this.hpBarFill.fillColor = ratio > 0.3 ? COLORS.HP_BAR_FILL : COLORS.HP_BAR_LOW;
    this.hpText.setText(`${this._hp}/${this._maxHp}`);
  }

  setAp(ap: number) {
    this._ap = ap;
    for (let i = 0; i < this.apDots.length; i++) {
      this.apDots[i].fillColor = i < ap ? 0xf1c40f : 0x444444;
      this.apDots[i].alpha = i < ap ? 1 : 0.4;
    }
  }

  setActive(active: boolean) {
    this.activeIndicator.setStrokeStyle(2, 0xffff00, active ? 0.8 : 0);
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
