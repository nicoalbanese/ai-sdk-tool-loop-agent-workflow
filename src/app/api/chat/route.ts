import { createUIMessageStreamResponse } from "ai";
import { start } from "workflow/api";
import { runAgent } from "@/workflows/run-agent";
import { AssistantUIMessage } from "@/lib/agents/assistant-agent";

type ChatRequestBody = {
  messages: AssistantUIMessage[];
  sandboxId: string;
};

export async function POST(request: Request) {
  const { messages, sandboxId } = (await request.json()) as ChatRequestBody;

  if (!sandboxId) {
    return Response.json({ error: "sandboxId is required" }, { status: 400 });
  }

  // start workflow and pass only serializable data
  // non-serializable runtime data (sandbox instance) is reconstructed in prepareCall
  const run = await start(runAgent, [
    messages,
    {
      type: "durable",
      modelId: "anthropic/claude-haiku-4.5",
      sandboxId,
    },
  ]);

  return createUIMessageStreamResponse({
    stream: run.readable,
  });
}
