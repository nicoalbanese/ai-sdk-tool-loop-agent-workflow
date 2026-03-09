import { getWritable, getWorkflowMetadata } from "workflow";
import { getRun } from "workflow/api";
import { convertToModelMessages } from "ai";
import type { UIMessageChunk, ModelMessage, InferAgentUIMessage, FinishReason } from "ai";
import z from "zod";
import { agent, AgentCallOptionsSchema } from "./setup";
import { persistUserMessage } from "@/lib/history/persist-assistant-message";

type AgentMessage = InferAgentUIMessage<typeof agent>;
type CallOptions = z.infer<AgentCallOptionsSchema>;

type Writable = WritableStream<UIMessageChunk>;

export async function runAgent(
  messages: AgentMessage[],
  options: CallOptions,
  maxIterations = 20,
) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const writable = getWritable<UIMessageChunk>();

  await persistLatestUserMessage(messages);

  let modelMessages = await toModelMessages(messages);
  await sendStart(writable, workflowRunId);

  let didFinish = false;

  for (let i = 0; i < maxIterations; i++) {
    const { responseMessages, finishReason } = await runAgentStep(
      modelMessages,
      messages,
      writable,
      options,
      workflowRunId,
    );
    // Assistant persistence is intentionally handled by API stream onFinish.
    modelMessages = [...modelMessages, ...responseMessages];
    if (finishReason !== "tool-calls") {
      didFinish = true;
      await sendFinish(writable);
      break;
    }
  }

  if (!didFinish) {
    await sendFinish(writable);
  }

  await closeStream(writable);
}

async function toModelMessages(messages: AgentMessage[]) {
  "use step";
  return convertToModelMessages(messages, {
    ignoreIncompleteToolCalls: true,
    tools: agent.tools,
  });
}

async function persistLatestUserMessage(messages: AgentMessage[]) {
  "use step";

  const latestMessage = messages[messages.length - 1];

  if (!latestMessage || latestMessage.role !== "user") {
    return;
  }

  await persistUserMessage(latestMessage);
}

async function runAgentStep(
  messages: ModelMessage[],
  originalMessages: AgentMessage[],
  writable: Writable,
  callOptions: CallOptions,
  workflowRunId: string,
) {
  "use step";

  const abortController = new AbortController();
  const stopMonitor = startStopMonitor(workflowRunId, abortController);

  try {
    const result = await agent.stream({
      messages,
      options: callOptions,
      abortSignal: abortController.signal,
    });
    const stream = result.toUIMessageStream({
      sendStart: false,
      sendFinish: false,
      originalMessages,
      generateMessageId: () => workflowRunId,
    });
    const reader = stream.getReader();
    const writer = writable.getWriter();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
    } finally {
      reader.releaseLock();
      writer.releaseLock();
    }

    const response = await result.response;
    const finishReason = await result.finishReason;

    return {
      responseMessages: response.messages,
      finishReason,
    };
  } catch (error) {
    if (isAbortError(error)) {
      const finishReason: FinishReason = "stop";
      return {
        responseMessages: [],
        finishReason,
      };
    }

    throw error;
  } finally {
    stopMonitor.stop();
    await stopMonitor.done;
  }
}

async function sendStart(writable: Writable, messageId: string) {
  "use step";

  const writer = writable.getWriter();
  try {
    await writer.write({ type: "start", messageId });
  } finally {
    writer.releaseLock();
  }
}

async function sendFinish(writable: Writable) {
  "use step";
  const writer = writable.getWriter();
  try {
    await writer.write({ type: "finish", finishReason: "stop" });
  } finally {
    writer.releaseLock();
  }
}

async function closeStream(writable: Writable) {
  "use step";

  await writable.close();
}

function startStopMonitor(runId: string, abortController: AbortController) {
  let shouldStop = false;

  const done = (async () => {
    const run = getRun(runId);

    while (!shouldStop && !abortController.signal.aborted) {
      let runStatus: "pending" | "running" | "completed" | "failed" | "cancelled";

      try {
        runStatus = await run.status;
      } catch {
        await delay(150);
        continue;
      }

      if (runStatus === "cancelled") {
        abortController.abort();
        return;
      }

      await delay(150);
    }
  })();

  return {
    stop() {
      shouldStop = true;
    },
    done,
  };
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
