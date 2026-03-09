import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type InferUIMessageChunk,
} from "ai";
import { getRun } from "workflow/api";
import type { AssistantUIMessage } from "@/lib/agents/assistant-agent";
import { persistAssistantMessage } from "@/lib/history/persist-assistant-message";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type AssistantUIMessageChunk = InferUIMessageChunk<AssistantUIMessage>;

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const startIndexResult = parseStartIndex(searchParams.get("startIndex"));

  if (startIndexResult === "invalid") {
    return Response.json(
      { error: "startIndex must be a non-negative integer" },
      { status: 400 },
    );
  }

  const run = getRun(id);
  const runStatus = await run.status;

  if (runStatus === "cancelled") {
    return createUIMessageStreamResponse({
      stream: createTerminalFinishStream("stop"),
    });
  }

  const readable =
    startIndexResult === undefined
      ? run.getReadable()
      : run.getReadable({ startIndex: startIndexResult });

  const stream = createUIMessageStream<AssistantUIMessage>({
    generateId: () => id,
    execute: ({ writer }) => {
      writer.merge(readable);
    },
    // Keep persistence consistent when a response finishes via reconnect.
    onFinish: async ({ responseMessage }) => {
      await persistAssistantMessage(responseMessage);
    },
  });

  return createUIMessageStreamResponse({ stream });
}

function parseStartIndex(value: string | null) {
  if (value === null) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    return "invalid";
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return "invalid";
  }

  return parsed;
}

function createTerminalFinishStream(finishReason: "stop") {
  return new ReadableStream<AssistantUIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: "finish", finishReason });
      controller.close();
    },
  });
}
