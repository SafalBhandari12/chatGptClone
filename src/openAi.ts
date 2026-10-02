import OpenAI from "openai";
import "dotenv/config";

const apiKey = process.env.OPENAI_API_KEY!;
const baseURL = process.env.OPENAI_BASE_URL!;
const model = process.env.OPENAI_MODEL!;

if (!apiKey || !baseURL || !model) {
  throw new Error(
    "Missing OPENAI_API_KEY, OPENAI_BASE_URL, or OPENAI_MODEL"
  );
}

export const openai = new OpenAI({
  apiKey,
  baseURL,
});

export { model };