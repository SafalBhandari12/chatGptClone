import type OpenAI from "openai";

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "bash",
      description: "Run bash commands on the isolated environment",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The bash command to run",
          },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "python",
      description: "Run python code on the isolated environment",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "The python code to run",
          },
        },
        required: ["code"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "attach_file",
      description:
        "When you create files, use the attach_file tool to attach the file to the response. The file will be stored in a temporary storage and can be accessed using the provided file path.",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Full path of file to attach",
          },
          display_name: {
            type: "string",
            description: "Display name for the file",
          },
        },
        required: ["file_path", "display_name"],
        additionalProperties: false,
      },
    },
  },
];

export default tools;
