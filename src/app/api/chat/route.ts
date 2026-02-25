import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { start } from "workflow/api";
import { handleChat } from "@/workflows/chat";
import { resolveSandbox } from "@/lib/sandbox/resolve-sandbox";

type ChatRequestBody = {
  messages: UIMessage[];
  sandboxId?: string;
};

export async function POST(request: Request) {
  const { messages, sandboxId } = (await request.json()) as ChatRequestBody;

  const { sandbox } = await resolveSandbox(sandboxId);

  // start workflow and and pass only serializable data
  // for functions or other non-serializable data, we can reconstruct
  // them in the workflow's prepareCall
  const run = await start(handleChat, [
    messages,
    {
      type: "durable",
      modelId: "openai/gpt-5.1-instant",
      sandboxId: sandbox.sandboxId,
    },
  ]);

  return createUIMessageStreamResponse({
    stream: run.readable,
  });
}
