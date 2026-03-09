import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { start } from "workflow/api";
import { runAgent } from "@/workflows/run-agent";
import type { AssistantUIMessage } from "@/lib/agents/assistant-agent";
import { persistAssistantMessage } from "@/lib/history/persist-assistant-message";

type ChatRequestBody = {
  messages: AssistantUIMessage[];
  sandboxId: string;
};

export async function POST(request: Request) {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!isChatRequestBody(requestBody)) {
    return Response.json(
      { error: "messages and sandboxId are required" },
      { status: 400 },
    );
  }

  const { messages, sandboxId } = requestBody;

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

  const stream = createUIMessageStream<AssistantUIMessage>({
    originalMessages: messages,
    generateId: () => run.runId,
    execute: ({ writer }) => {
      writer.merge(run.readable);
    },
    // Assistant persistence is owned by API stream onFinish.
    onFinish: async ({ responseMessage }) => {
      await persistAssistantMessage(responseMessage);
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "x-workflow-run-id": run.runId,
    },
  });
}

function isChatRequestBody(value: unknown): value is ChatRequestBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("sandboxId" in value) || typeof value.sandboxId !== "string") {
    return false;
  }

  if (!("messages" in value) || !Array.isArray(value.messages)) {
    return false;
  }

  return true;
}
