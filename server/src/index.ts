import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import gameRouter from "./routes/game.js";
import { initDb } from "./db/database.js";
import { computeStats } from "./stats.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(here, "../../.env") });

initDb();

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

if (!process.env.OR_KEY) {
  console.warn("WARNING: OR_KEY is not set — every fighter will just wait each turn.");
}

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ name: "Tiny AI Arena", status: "ok", endpoints: ["/api/games", "/api/stats"] });
});

app.use("/api/games", gameRouter);

app.get("/api/stats", (_req, res) => {
  res.json(computeStats());
});

app.listen(PORT, () => {
  console.log(`Tiny AI Arena server running on http://localhost:${PORT}`);
});
