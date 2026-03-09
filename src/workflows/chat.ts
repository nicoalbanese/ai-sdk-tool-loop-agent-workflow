import { getWritable } from "workflow";
import { convertToModelMessages } from "ai";
import { assistantAgent, CallOptions } from "@/lib/agents/assistant-agent";
import type {
  UIMessage,
  UIMessageChunk,
  ModelMessage,
} from "ai";

type Writable = WritableStream<UIMessageChunk>;

export async function handleChat(messages: UIMessage[], options: CallOptions) {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();

  let modelMessages = await toModelMessages(messages);
  await sendStart(writable);

  const maxIterations = 10;

  for (let i = 0; i < maxIterations; i++) {
    const { responseMessages, finishReason } = await runAgentStep(
      modelMessages,
      messages,
      writable,
      options,
    );
    modelMessages = [...modelMessages, ...responseMessages];
    if (finishReason !== "tool-calls") {
      await sendFinish(writable);
      break;
    }
  }

  await closeStream(writable);
}

async function toModelMessages(messages: UIMessage[]) {
  "use step";
  return convertToModelMessages(messages);
}

async function runAgentStep(
  messages: ModelMessage[],
  originalMessages: UIMessage[],
  writable: Writable,
  callOptions: CallOptions,
) {
  "use step";

  const result = await assistantAgent.stream({
    messages,
    options: callOptions,
  });
  const stream = result.toUIMessageStream({
    sendStart: false,
    sendFinish: false,
    originalMessages,
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
}

async function sendStart(writable: Writable) {
  "use step";

  const writer = writable.getWriter();
  await writer.write({ type: "start" });
}

async function sendFinish(writable: Writable) {
  "use step";
  const writer = writable.getWriter();
  await writer.write({ type: "finish", finishReason: "stop" });
}

async function closeStream(writable: Writable) {
  "use step";

  await writable.close();
}
