import express from "express";
import "dotenv/config";
import { openai, model } from "./openAi.js";
import { fileStorage, runAgent } from "./agent.js";

const app = express();

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "AI API is running" });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body as { message?: string };

    if (typeof message !== "string" || !message.trim()) {
      res.status(400).json({
        error: "message must be a non-empty string",
      });
      return;
    }

    const response = await runAgent(message);

    res.status(200).json({
      response,
    });
  } catch (error) {
    console.error("AI request failed:", error);

    res.status(500).json({
      error: "Failed to generate a response",
    });
  }
});

app.get("/download/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    const fileInfo = fileStorage[fileId];

    if (!fileInfo) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.download(fileInfo.path, fileInfo.name);
  } catch (error) {
    console.error("File download failed:", error);
    res.status(500).json({ error: "Failed to download the file" });
  }
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
