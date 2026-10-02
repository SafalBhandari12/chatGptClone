import express from "express";
import "dotenv/config";
import { openai, model } from "./openAi.js";

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

    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: message,
        },  
      ],
    });

    res.json({
      reply: response.choices[0]?.message?.content ?? "",
    });
  } catch (error) {
    console.error("AI request failed:", error);

    res.status(500).json({
      error: "Failed to generate a response",
    });
  }
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});