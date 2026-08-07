import "dotenv/config";
import express from "express";
import cors from "cors";
import gameRouter from "./routes/game.js";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.use(cors());
app.use(express.json());

app.use("/api/game", gameRouter);

app.listen(PORT, () => {
  console.log(`AI Arena server running on http://localhost:${PORT}`);
});
