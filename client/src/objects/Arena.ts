import Phaser from "phaser";
import { GRID_WIDTH, GRID_HEIGHT, CELL_SIZE } from "@ai-arena/shared";
import { COLORS } from "../utils/colors";

export const ARENA_OFFSET_X = 40;
export const ARENA_OFFSET_Y = 60;

export class Arena {
  private graphics: Phaser.GameObjects.Graphics;
  private obstacles: Set<string>;

  constructor(
    private scene: Phaser.Scene,
    obstaclePositions: { x: number; y: number }[],
  ) {
    this.obstacles = new Set(obstaclePositions.map((p) => `${p.x},${p.y}`));
    this.graphics = scene.add.graphics();
    this.draw();
  }

  private draw() {
    const g = this.graphics;

    for (let col = 0; col < GRID_WIDTH; col++) {
      for (let row = 0; row < GRID_HEIGHT; row++) {
        const x = ARENA_OFFSET_X + col * CELL_SIZE;
        const y = ARENA_OFFSET_Y + row * CELL_SIZE;
        const isObstacle = this.obstacles.has(`${col},${row}`);

        g.fillStyle(isObstacle ? COLORS.OBSTACLE : COLORS.GRID_FLOOR);
        g.fillRect(x, y, CELL_SIZE, CELL_SIZE);

        g.lineStyle(1, COLORS.GRID_LINE, 0.6);
        g.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
      }
    }

    // Grid coordinate labels
    for (let col = 0; col < GRID_WIDTH; col++) {
      this.scene.add
        .text(ARENA_OFFSET_X + col * CELL_SIZE + CELL_SIZE / 2, ARENA_OFFSET_Y - 10, `${col}`, {
          fontSize: "9px",
          color: "#555",
          fontFamily: "monospace",
        })
        .setOrigin(0.5);
    }
    for (let row = 0; row < GRID_HEIGHT; row++) {
      this.scene.add
        .text(ARENA_OFFSET_X - 14, ARENA_OFFSET_Y + row * CELL_SIZE + CELL_SIZE / 2, `${row}`, {
          fontSize: "9px",
          color: "#555",
          fontFamily: "monospace",
        })
        .setOrigin(0.5);
    }
  }

  gridToWorld(gridX: number, gridY: number): { x: number; y: number } {
    return {
      x: ARENA_OFFSET_X + gridX * CELL_SIZE + CELL_SIZE / 2,
      y: ARENA_OFFSET_Y + gridY * CELL_SIZE + CELL_SIZE / 2,
    };
  }

  isObstacle(gridX: number, gridY: number): boolean {
    return this.obstacles.has(`${gridX},${gridY}`);
  }
}
