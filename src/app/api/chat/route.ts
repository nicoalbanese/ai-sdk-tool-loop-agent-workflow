import { startRunAgent } from "@/workflows/run-agent";
import type { AssistantUIMessage } from "@/lib/agents/assistant-agent";

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

  return startRunAgent({
    messages,
    options: {
      type: "durable",
      modelId: "anthropic/claude-haiku-4.5",
      sandboxId,
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
