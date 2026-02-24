import { createUIMessageStreamResponse } from "ai";
import { start } from "workflow/api";
import { handleChat } from "@/workflows/chat";

export async function POST(request: Request) {
  const { messages } = await request.json();

  // start workflow and and pass only serializable data
  // for functions or other non-serializable data, we can reconstruct
  // them in the workflow's prepareCall
  const run = await start(handleChat, [
    messages,
    { type: "durable", modelId: "openai/gpt-5.1-instant" },
  ]);

  return createUIMessageStreamResponse({
    stream: run.readable,
  });
}
