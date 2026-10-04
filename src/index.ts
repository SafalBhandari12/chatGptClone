import express from "express";
import "dotenv/config";
import { fileStorage, runAgent, type AgentEvent } from "./agent.js";
import multer from "multer";
import path from "path";
import type OpenAI from "openai";
import { Prisma } from "./generated/prisma/client.js";
import { prisma } from "./db.js";

const app = express();

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "AI API is running" });
});

const upload = multer({ dest: "uploads/", limits: { fileSize: 1024 * 1024 } });

app.post("/api/chat", upload.array("files", 5), async (req, res) => {
  try {
    const { message, conversationId } = req.body as {
      message?: string;
      conversationId?: string;
    };
    const uploadFiles = (req.files as Express.Multer.File[] | undefined) ?? [];

    if (typeof message !== "string" || !message.trim()) {
      res.status(400).json({
        error: "message must be a non-empty string",
      });
      return;
    }

    let conversation = conversationId
      ? await prisma.conversation.findUnique({
          where: { id: conversationId },
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
              include: { fileReferences: true },
            },
          },
        })
      : null;

    if (conversationId && !conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {},
        include: { messages: { include: { fileReferences: true } } },
      });
    }

    const history = conversation.messages.map(
      (m): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
        if (m.role === "tool") {
          return {
            role: "tool",
            tool_call_id: m.toolCallId ?? "",
            content: m.content,
          };
        }
        if (m.role === "assistant") {
          return {
            role: "assistant",
            content: m.content,
            ...(m.toolCalls
              ? {
                  tool_calls:
                    m.toolCalls as unknown as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
                }
              : {}),
          };
        }
        return { role: m.role as "user" | "system", content: m.content };
      },
    );

    // Files from earlier messages are re-provided to the agent's sandbox.
    const previousFiles = conversation.messages.flatMap((m) =>
      m.fileReferences.map((f) => ({
        originalName: f.originalName,
        path: path.resolve("uploads", f.storageKey),
        mimeType: f.mimeType,
      })),
    );

    const newFiles = uploadFiles.map((file) => ({
      originalName: file.originalname,
      path: path.resolve(file.path),
      mimeType: file.mimetype,
    }));

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: message,
        fileReferences: {
          create: uploadFiles.map((file) => ({
            originalName: file.originalname,
            storageKey: file.filename,
            mimeType: file.mimetype,
            fileSize: file.size,
          })),
        },
      },
    });

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendEvent = (
      event:
        | AgentEvent
        | {
            type: "conversation";
            conversationId: string;
          },
    ) => {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    sendEvent({
      type: "conversation",
      conversationId: conversation.id,
    });

    const { response, newMessages } = await runAgent(
      message,
      [...previousFiles, ...newFiles],
      history,
      (event) => {
        sendEvent(event);
      },
    );

    // Explicit increasing timestamps keep the replay order stable.
    const base = Date.now();
    await prisma.message.createMany({
      data: newMessages.map((m, i) => ({
        conversationId: conversation.id,
        role: m.role as "assistant" | "tool",
        content: typeof m.content === "string" ? m.content : "",
        toolCalls:
          m.role === "assistant" && m.tool_calls?.length
            ? (m.tool_calls as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        toolCallId: m.role === "tool" ? m.tool_call_id : null,
        createdAt: new Date(base + i),
      })),
    });

    sendEvent({ type: "done", conversationId: conversation.id, response });
    res.end();
  } catch (error) {
    console.error("AI request failed:", error);

    if (res.headersSent) {
      res.write(
        `event: error\ndata: ${JSON.stringify({
          type: "error",
          message: "Failed to generate a response",
        })}\n\n`,
      );
      res.end();
    } else {
      res.status(500).json({
        error: "Failed to generate a response",
      });
    }
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
