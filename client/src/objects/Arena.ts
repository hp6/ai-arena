import Phaser from "phaser";
import { GRID_WIDTH, GRID_HEIGHT, CELL_SIZE, DISPLAY_COLS, DISPLAY_ROWS, GAME_OFFSET } from "@ai-arena/shared";

export const ARENA_OFFSET_X = 55;
export const ARENA_OFFSET_Y = 60;

// Render extra tiles beyond the visible area so edge objects/foam look correct
const RENDER_PAD = 3;
const RENDER_COLS = DISPLAY_COLS + RENDER_PAD * 2;
const RENDER_ROWS = DISPLAY_ROWS + RENDER_PAD * 2;

// Tiled tile coordinates for the top-left of the VISIBLE area
const VIEW_TX = -8;
const VIEW_TY = -9;

// Render origin is shifted back by the padding
const RENDER_TX = VIEW_TX - RENDER_PAD;
const RENDER_TY = VIEW_TY - RENDER_PAD;

interface TiledTileset {
  firstgid: number;
  name: string;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  columns: number;
  tiles?: { id: number; animation: { tileid: number; duration: number }[] }[];
}

interface TiledChunk {
  data: number[];
  width: number;
  height: number;
  x: number;
  y: number;
}

interface TiledLayer {
  name: string;
  type: string;
  chunks?: TiledChunk[];
  draworder?: string;
  objects?: {
    gid: number;
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
  }[];
}

interface TiledMap {
  tilesets: TiledTileset[];
  layers: TiledLayer[];
}

// Smooth 0..1 phase over map pixels: nearby trees sway together, distant ones drift apart
function windPhase(x: number, y: number): number {
  const v =
    Math.sin(x * 0.0009) +
    Math.sin(y * 0.001 + 1.3) +
    Math.sin((x + y) * 0.0006 + 2.1);
  const p = (v * 2) % 1;
  return p < 0 ? p + 1 : p;
}

// Cloud art is 576x256 with a grey shadow baked below the cloud; these rects keep only the cloud itself
const CLOUD_FRAME_W = 576;
const CLOUD_FRAME_H = 256;
const CLOUD_CROPS = [
  { x: 38, y: 42, width: 495, height: 86 },
  { x: 133, y: 85, width: 307, height: 66 },
  { x: 205, y: 102, width: 165, height: 33 },
  { x: 234, y: 115, width: 106, height: 31 },
];

function textureKey(name: string): string {
  return name.replace(/\s+/g, "_");
}

export class Arena {
  private gameObjects: Phaser.GameObjects.GameObject[] = [];
  private obstacles: Set<string>;
  private labels: Phaser.GameObjects.Text[] = [];
  private gold!: Phaser.GameObjects.Sprite;
  readonly layer: Phaser.GameObjects.Layer;
  private cloudTweens: Phaser.Tweens.Tween[] = [];

  constructor(
    private scene: Phaser.Scene,
    obstaclePositions: { x: number; y: number }[],
    gold: { x: number; y: number } | null = null,
  ) {
    this.obstacles = new Set(obstaclePositions.map((p) => `${p.x},${p.y}`));
    this.layer = scene.add.layer();
    this.draw();
    this.layer.add([...this.gameObjects, ...this.labels]);
    this.addClouds();
    this.setGold(gold);
  }

  private draw() {
    const map: TiledMap = this.scene.cache.json.get("mapdata");

    // Water background fill
    const waterFill = this.scene.add.tileSprite(
      ARENA_OFFSET_X, ARENA_OFFSET_Y,
      DISPLAY_COLS * CELL_SIZE, DISPLAY_ROWS * CELL_SIZE,
      "Water_Background_color",
    ).setOrigin(0);
    this.gameObjects.push(waterFill);

    // Render tile layers (full render area including padding)
    const tileLayerOrder = ["Water", "Foam", "Foam2", "Foam3", "Ground", "Mountains"];
    for (const layerName of tileLayerOrder) {
      const layer = map.layers.find(l => l.name === layerName && l.type === "tilelayer");
      if (!layer?.chunks) continue;
      this.renderTileLayer(map, layer);
    }

    // Render object layers (full render area; the arena camera clips to the visible window)
    const objLayerOrder = ["Bushes", "Trees"];
    for (const layerName of objLayerOrder) {
      const layer = map.layers.find(l => l.name === layerName && l.type === "objectgroup");
      if (!layer?.objects) continue;
      this.renderObjectLayer(map, layer);
    }

    // Rocks mark impassable cells; the variant is derived from position so replays look identical
    for (const key of this.obstacles) {
      const [x, y] = key.split(",").map(Number);
      const { x: wx, y: wy } = this.gridToWorld(x, y);
      this.gameObjects.push(this.scene.add.image(wx, wy, `rock${((x * 7 + y * 3) % 4) + 1}`));
    }

    this.gold = this.scene.add.sprite(0, 0, "gold", 0).play("gold_shine");
    this.gameObjects.push(this.gold);

    // Grid lines on 8x8 gameplay area
    const g = this.scene.add.graphics();
    const gx = ARENA_OFFSET_X + GAME_OFFSET * CELL_SIZE;
    const gy = ARENA_OFFSET_Y + GAME_OFFSET * CELL_SIZE;
    const gw = GRID_WIDTH * CELL_SIZE;
    const gh = GRID_HEIGHT * CELL_SIZE;

    g.lineStyle(1, 0x000000, 0.12);
    for (let c = 0; c <= GRID_WIDTH; c++) {
      g.lineBetween(gx + c * CELL_SIZE, gy, gx + c * CELL_SIZE, gy + gh);
    }
    for (let r = 0; r <= GRID_HEIGHT; r++) {
      g.lineBetween(gx, gy + r * CELL_SIZE, gx + gw, gy + r * CELL_SIZE);
    }
    g.lineStyle(2, 0xffffff, 0.25);
    g.strokeRect(gx, gy, gw, gh);
    this.gameObjects.push(g);

    // Coordinate labels
    for (let c = 0; c < GRID_WIDTH; c++) {
      this.labels.push(
        this.scene.add
          .text(gx + c * CELL_SIZE + CELL_SIZE / 2, gy - 10, `${c}`, {
            fontSize: "9px", color: "#161c2e", fontFamily: "monospace",
          })
          .setOrigin(0.5),
      );
    }
    for (let r = 0; r < GRID_HEIGHT; r++) {
      this.labels.push(
        this.scene.add
          .text(gx - 14, gy + r * CELL_SIZE + CELL_SIZE / 2, `${r}`, {
            fontSize: "9px", color: "#161c2e", fontFamily: "monospace",
          })
          .setOrigin(0.5),
      );
    }
  }

  private renderTileLayer(map: TiledMap, layer: TiledLayer) {
    for (let row = 0; row < RENDER_ROWS; row++) {
      for (let col = 0; col < RENDER_COLS; col++) {
        const tileX = RENDER_TX + col;
        const tileY = RENDER_TY + row;
        const gid = this.getGid(layer.chunks!, tileX, tileY);
        if (gid === 0) continue;

        const ts = this.findTileset(map.tilesets, gid);
        if (!ts) continue;

        const localId = gid - ts.firstgid;
        const key = textureKey(ts.name);
        // Position relative to the visible area origin, offset by -RENDER_PAD
        const screenX = ARENA_OFFSET_X + (col - RENDER_PAD) * CELL_SIZE + CELL_SIZE / 2;
        const screenY = ARENA_OFFSET_Y + (row - RENDER_PAD) * CELL_SIZE + CELL_SIZE / 2;

        const animDef = ts.tiles?.find(t => t.id === localId);
        if (animDef?.animation) {
          const sprite = this.scene.add.sprite(screenX, screenY, key, localId);
          sprite.setDisplaySize(CELL_SIZE, CELL_SIZE);
          this.setupAnim(sprite, key, localId, animDef.animation);
          this.gameObjects.push(sprite);
        } else {
          const img = this.scene.add.image(screenX, screenY, key, localId);
          img.setDisplaySize(CELL_SIZE, CELL_SIZE);
          this.gameObjects.push(img);
        }
      }
    }
  }

  private renderObjectLayer(map: TiledMap, layer: TiledLayer) {
    // Pixel offset: Tiled pixel (0,0) → screen position (relative to visible origin)
    const pxOffX = ARENA_OFFSET_X - VIEW_TX * CELL_SIZE;
    const pxOffY = ARENA_OFFSET_Y - VIEW_TY * CELL_SIZE;

    const objects = layer.draworder === "index"
      ? layer.objects!
      : [...layer.objects!].sort((a, b) => a.y - b.y);

    for (const obj of objects) {
      if (!obj.visible || !obj.gid) continue;

      const ts = this.findTileset(map.tilesets, obj.gid);
      if (!ts) continue;

      const localId = obj.gid - ts.firstgid;
      const key = textureKey(ts.name);

      const screenX = obj.x + pxOffX + obj.width / 2;
      const screenY = obj.y + pxOffY - obj.height / 2;

      const sprite = this.scene.add.sprite(screenX, screenY, key, localId);
      sprite.setDisplaySize(obj.width, obj.height);

      const animDef = ts.tiles?.find(t => t.id === localId);
      if (animDef?.animation) {
        const phase = windPhase(obj.x + obj.width / 2, obj.y);
        this.setupAnim(sprite, key, localId, animDef.animation, Math.floor(phase * animDef.animation.length));
      }

      this.gameObjects.push(sprite);
    }
  }

  private setupAnim(
    sprite: Phaser.GameObjects.Sprite,
    key: string,
    localId: number,
    frames: { tileid: number; duration: number }[],
    startFrame = 0,
  ) {
    const animKey = `${key}_${localId}`;
    if (!this.scene.anims.exists(animKey)) {
      this.scene.anims.create({
        key: animKey,
        frames: frames.map(f => ({ key, frame: f.tileid })),
        frameRate: 1000 / frames[0].duration,
        repeat: -1,
      });
    }
    sprite.play({ key: animKey, startFrame });
  }

  private getGid(chunks: TiledChunk[], tx: number, ty: number): number {
    for (const c of chunks) {
      if (tx >= c.x && tx < c.x + c.width && ty >= c.y && ty < c.y + c.height) {
        return c.data[(ty - c.y) * c.width + (tx - c.x)];
      }
    }
    return 0;
  }

  private findTileset(tilesets: TiledTileset[], gid: number): TiledTileset | null {
    let result: TiledTileset | null = null;
    for (const ts of tilesets) {
      if (gid >= ts.firstgid) result = ts;
    }
    return result;
  }

  destroy() {
    for (const t of this.cloudTweens) t.destroy();
    this.cloudTweens = [];
    for (const obj of this.gameObjects) obj.destroy();
    for (const l of this.labels) l.destroy();
    this.layer.destroy();
    this.gameObjects = [];
    this.labels = [];
  }

  private addClouds() {
    const viewW = DISPLAY_COLS * CELL_SIZE;
    const viewH = DISPLAY_ROWS * CELL_SIZE;

    for (let i = 0; i < 3; i++) {
      const variant = Phaser.Math.Between(1, 4);
      const key = `cloud${variant}`;
      const crop = CLOUD_CROPS[variant - 1];
      // Scaled up from the crop so even the small variants read as big clouds
      const scale = Phaser.Math.FloatBetween(1.6, 2.6) * (200 / crop.width);
      // Keep clouds in the upper part of the view so they don't sit on top of the fighters
      const y = ARENA_OFFSET_Y + Phaser.Math.Between(-30, Math.round(viewH * 0.3));
      const width = crop.width * scale;
      // Each cloud waits out an extra screen-width off to the left, so clouds are on screen about half the time
      const endX = ARENA_OFFSET_X + viewW + width;
      const startX = ARENA_OFFSET_X - width - (endX - (ARENA_OFFSET_X - width));

      // Cropping keeps the frame size, so the visible piece renders off-centre by this much
      const offX = (crop.x + crop.width / 2 - CLOUD_FRAME_W / 2) * scale;
      const offY = (crop.y + crop.height / 2 - CLOUD_FRAME_H / 2) * scale;

      // Only the shadows are drawn — the clouds themselves are above the camera's view
      const shadow = this.scene.add.image(0, 0, key).setScale(scale).setTint(0x0a1a12).setAlpha(0.2);
      // The art has a grey shadow baked under each cloud; crop to the cloud shape and tint that
      shadow.setCrop(crop.x, crop.y, crop.width, crop.height);
      this.layer.add(shadow);
      this.gameObjects.push(shadow);

      const drift = { x: startX + ((endX - startX) * i) / 3 };
      const place = () => shadow.setPosition(drift.x - offX, y - offY);
      place();

      this.cloudTweens.push(this.scene.tweens.add({
        targets: drift,
        x: endX,
        duration: (endX - drift.x) * Phaser.Math.Between(70, 110),
        ease: "Linear",
        repeat: -1,
        onUpdate: place,
        onRepeat: () => {
          drift.x = startX;
        },
      }));
    }
  }

  setGold(pos: { x: number; y: number } | null) {
    this.gold.setVisible(pos !== null);
    if (!pos) return;
    const { x, y } = this.gridToWorld(pos.x, pos.y);
    this.gold.setPosition(x, y);
  }

  gridToWorld(gridX: number, gridY: number): { x: number; y: number } {
    return {
      x: ARENA_OFFSET_X + (gridX + GAME_OFFSET) * CELL_SIZE + CELL_SIZE / 2,
      y: ARENA_OFFSET_Y + (gridY + GAME_OFFSET) * CELL_SIZE + CELL_SIZE / 2,
    };
  }

  isObstacle(gridX: number, gridY: number): boolean {
    return this.obstacles.has(`${gridX},${gridY}`);
  }
}
