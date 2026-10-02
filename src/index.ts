import express from "express";
import "dotenv/config";
import { fileStorage, runAgent } from "./agent.js";
import fs from "fs/promises";
import multer from "multer";
import path from "path";

const app = express();

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "AI API is running" });
});

const upload = multer({ dest: "uploads/", limits: { fileSize: 1024 * 1024 } });

app.post("/api/chat", upload.array("files", 5), async (req, res) => {
  try {
    const { message } = req.body as { message?: string };
    const uploadFiles = req.files as Express.Multer.File[] | [];

    const fileInfo = uploadFiles.map((file) => ({
      originalName: file.originalname,
      path: path.resolve(file.path),
      mimeType: file.mimetype,
    }));

    if (typeof message !== "string" || !message.trim()) {
      res.status(400).json({
        error: "message must be a non-empty string",
      });
      return;
    }

    const response = await runAgent(message, fileInfo);

    for (const file of uploadFiles) {
      try {
        await fs.unlink(file.path);
      } catch (error) {
        console.error(`Failed to delete file ${file.path}:`, error);
      }
    }

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
