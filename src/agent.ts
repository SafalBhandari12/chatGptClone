import { Sandbox } from "@vercel/sandbox";
import type OpenAI from "openai";
import { model, openai } from "./openAi.js";
import tools from "./tools.js";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { saveLog } from "./logger.js";

export type AgentResult = {
  response: string;
  // Everything produced after the user message: tool calls, tool results, final reply.
  newMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
};

const fileStorage: Record<string, { path: string; name: string }> = {};

export async function runAgent(
  userMessage: string,
  uploadedFiles?: Array<{
    originalName: string;
    path: string;
    mimeType: string;
  }>,
  history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [],
): Promise<AgentResult> {
  const startedAt = new Date().toISOString();
  const sandbox = await Sandbox.create({
    runtime: "python3.13",
  });
  const sandboxFiles: Array<{
    originalName: string;
    sandboxPath: string;
    mimeType: string;
  }> = [];

  if (uploadedFiles && uploadedFiles.length > 0) {
    const results = await Promise.all(
      uploadedFiles.map(async (file) => {
        const fileContent = await fs.readFile(file.path);
        const sandboxPath = `/vercel/sandbox/${file.originalName}`;

        return {
          path: sandboxPath,
          content: fileContent,
          originalName: file.originalName,
          mimeType: file.mimeType,
        };
      }),
    );

    await sandbox.writeFiles(
      results.map(({ path, content }) => ({ path, content })),
    );

    sandboxFiles.push(
      ...results.map(({ originalName, path, mimeType }) => ({
        originalName,
        sandboxPath: path,
        mimeType,
      })),
    );
  }

  await sandbox.runCommand({
    cmd: "pip",
    args: [
      "install",
      "pandas",
      "reportlab",
      "python-pptx",
      "pypdf",
      "python-docx",
    ],
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You are a helpful assistant that can run bash commands and Python code in an isolated environment. " +
        "You can generate files like CSV (using pandas), PDF (using reportlab), and PowerPoint presentations (using python-pptx). " +
        "Users may upload files (PPT, PDF, CSV, DOCX, etc) that you can work with. " +
        "Use the list_uploaded_files tool to see what files were uploaded and their paths. " +
        "You can read files using bash (cat command), and edit them using Python. " +
        "When you edit files, save them to /vercel/sandbox/, then use attach_file to make them downloadable. " +
        "When you use attach_file and get a download link back, include that link in your response to the user." +
        "Files are in /vercel/sandbox/ directory. You can read files using bash (cat command), and edit them using Python. ",
    },
    ...history,
    {
      role: "user",
      content: userMessage,
    },
  ];

  const newMessagesStart = messages.length;
  const result = (response: string): AgentResult => ({
    response,
    newMessages: messages.slice(newMessagesStart),
  });

  try {
    for (let i = 0; i < 8; i++) {
      console.log(`Iteration ${i + 1}: Sending messages to OpenAI API...`);
      const response = await openai.chat.completions.create({
        model: model,
        messages,
        tools: tools,
        tool_choice: "auto",
      });

      const assistantMessage = response.choices[0]?.message;

      if (!assistantMessage) {
        throw new Error("No message returned from the assistant.");
      }

      messages.push(assistantMessage);

      if (!assistantMessage.tool_calls?.length) {
        return result(assistantMessage.content ?? "");
      }

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type !== "function") {
          continue;
        }
        if (toolCall.function.name === "bash") {
          try {
            const { command } = JSON.parse(toolCall.function.arguments) as {
              command: string;
            };

            if (
              typeof command !== "string" ||
              !command.trim() ||
              command.length > 4000
            ) {
              throw new Error("Invalid command");
            }
            const result = await sandbox.runCommand({
              cmd: "bash",
              args: ["-c", command],
              cwd: "/vercel/sandbox",
            });

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content:
                (await result.stdout?.()) || (await result.stderr?.()) || "",
            });
            console.log("bash command executed successfully:", command);
          } catch (error) {
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: `Error executing bash command: ${error}`,
            });
          }
        } else if (toolCall.function.name === "python") {
          try {
            const { code } = JSON.parse(toolCall.function.arguments) as {
              code: string;
            };

            console.log("Executing python code:", code);

            const result = await sandbox.runCommand({
              cmd: "python3",
              args: ["-c", code],
              cwd: "/vercel/sandbox",
            });

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content:
                (await result.stdout?.()) || (await result.stderr?.()) || "",
            });

            console.log("python code executed successfully:", code);
          } catch (error) {
            console.error("Error executing python code:", error);
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: `Error executing python code: ${error}`,
            });
          }
        } else if (toolCall.function.name === "attach_file") {
          try {
            const { file_path, display_name } = JSON.parse(
              toolCall.function.arguments,
            ) as {
              file_path: string;
              display_name: string;
            };

            const fileContent = await sandbox.readFile({ path: file_path });

            if (!fileContent) {
              throw new Error(`File not found at path: ${file_path}`);
            }
            const fileId = crypto.randomUUID();

            await fs.mkdir("./uploads", { recursive: true });
            const localFilePath = path.join("./uploads", fileId);
            await fs.writeFile(localFilePath, fileContent);
            fileStorage[fileId] = { path: localFilePath, name: display_name };

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: `File attached successfully. Download URL: http://localhost:3000/download/${fileId}`,
            });
            console.log(
              "Download url sent to agent:",
              `http://localhost:3000/download/${fileId}`,
            );
            console.log("File attached successfully:", display_name);
          } catch (error) {
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: `Error attaching file: ${error}`,
            });
          }
        } else if (toolCall.function.name === "list_uploaded_files") {
          try {
            if (!sandboxFiles || sandboxFiles.length === 0) {
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: "No files uploaded in this request.",
              });
            } else {
              const fileList = sandboxFiles
                .map(
                  (f) =>
                    `- ${f.originalName} (${f.mimeType}): ${f.sandboxPath}`,
                )
                .join("\n");
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: `Uploaded files:\n${fileList}`,
              });
            }

            console.log("DEBUG: Uploaded files for agent:", sandboxFiles);
          } catch (error) {
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: `Error listing files: ${error}`,
            });
          }
        }
      }
    }
    messages.push({
      role: "assistant",
      content: "Number of iterations exceeded. Please refine your request.",
    });
    return result("Number of iterations exceeded. Please refine your request.");
  } finally {
    await saveLog({
      startedAt,
      endedAt: new Date().toISOString(),
      userMessage,
      uploadedFiles: sandboxFiles,
      messages,
    });
    sandbox.stop();
  }
}

export { fileStorage };
