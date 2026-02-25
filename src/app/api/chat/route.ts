import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { start } from "workflow/api";
import { handleChat } from "@/workflows/chat";

type ChatRequestBody = {
  messages: UIMessage[];
  sandboxId: string;
};

export async function POST(request: Request) {
  const { messages, sandboxId } = (await request.json()) as ChatRequestBody;

  if (!sandboxId) {
    return Response.json({ error: "sandboxId is required" }, { status: 400 });
  }

  // start workflow and pass only serializable data
  // non-serializable runtime data (sandbox instance) is reconstructed in prepareCall
  const run = await start(handleChat, [
    messages,
    {
      type: "durable",
      modelId: "openai/gpt-5.1-instant",
      sandboxId,
    },
  ]);

  return createUIMessageStreamResponse({
    stream: run.readable,
  });
}
