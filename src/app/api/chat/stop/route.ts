import { getRun } from "workflow/api";
import type { AssistantUIMessage } from "@/lib/agents/assistant-agent";
import { persistAssistantMessage } from "@/lib/history/persist-assistant-message";

type StopWorkflowRequestBody = {
  runId: string;
  assistantMessage?: AssistantUIMessage;
};

export async function POST(request: Request) {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!isStopWorkflowRequestBody(requestBody)) {
    return Response.json({ error: "runId is required" }, { status: 400 });
  }

  try {
    // Stop can beat stream onFinish during refresh/unload, so persist
    // the latest client snapshot before cancelling the run.
    if (requestBody.assistantMessage) {
      await persistAssistantMessage(requestBody.assistantMessage);
    }

    const run = getRun(requestBody.runId);
    await run.cancel();

    return Response.json({ status: "cancelled" });
  } catch {
    return Response.json(
      { error: "Failed to cancel workflow run" },
      { status: 500 },
    );
  }
}

function isStopWorkflowRequestBody(
  value: unknown,
): value is StopWorkflowRequestBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("runId" in value) || typeof value.runId !== "string") {
    return false;
  }

  if (
    "assistantMessage" in value &&
    value.assistantMessage !== undefined &&
    !isAssistantMessage(value.assistantMessage)
  ) {
    return false;
  }

  return value.runId.length > 0;
}

function isAssistantMessage(value: unknown): value is AssistantUIMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("id" in value) || typeof value.id !== "string") {
    return false;
  }

  if (!("role" in value) || value.role !== "assistant") {
    return false;
  }

  if (!("parts" in value) || !Array.isArray(value.parts)) {
    return false;
  }

  return true;
}
