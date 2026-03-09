import { getWritable } from "workflow";
import { convertToModelMessages, generateId } from "ai";
import {
  assistantAgent,
  AssistantUIMessage,
  CallOptions,
} from "@/lib/agents/assistant-agent";
import type { UIMessageChunk, ModelMessage } from "ai";

type Writable = WritableStream<UIMessageChunk>;

export async function runAgent(
  messages: AssistantUIMessage[],
  options: CallOptions,
  maxIterations = 20,
) {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();

  let modelMessages = await toModelMessages(messages);
  const messageId = await sendStart(writable);

  const collectedUIMessage: AssistantUIMessage = {
    id: messageId,
    role: "assistant",
    parts: [],
  };
  for (let i = 0; i < maxIterations; i++) {
    const { responseMessages, finishReason, generatedParts } =
      await runAgentStep(modelMessages, messages, writable, options, messageId);
    modelMessages = [...modelMessages, ...responseMessages];
    collectedUIMessage.parts.push(...generatedParts);
    if (finishReason !== "tool-calls") {
      await sendFinish(writable);
      await persistRun(collectedUIMessage);
      break;
    }
  }

  await closeStream(writable);
}

async function toModelMessages(messages: AssistantUIMessage[]) {
  "use step";
  return convertToModelMessages(messages);
}

async function persistRun(uiMessage: AssistantUIMessage | undefined) {
  "use step";
  // persist the final message to a database, or trigger some other side effect
  console.dir(uiMessage, { depth: null });
}

async function runAgentStep(
  messages: ModelMessage[],
  originalMessages: AssistantUIMessage[],
  writable: Writable,
  callOptions: CallOptions,
  messageId: string,
) {
  "use step";

  let generatedParts: AssistantUIMessage["parts"] = [];

  const result = await assistantAgent.stream({
    messages,
    options: callOptions,
  });
  const stream = result.toUIMessageStream({
    sendStart: false,
    sendFinish: false,
    originalMessages,
    generateMessageId: () => messageId,
    onFinish: ({ responseMessage }) => {
      generatedParts = responseMessage.parts;
    },
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
    generatedParts,
    finishReason,
  };
}

async function sendStart(writable: Writable) {
  "use step";

  const writer = writable.getWriter();
  await writer.write({ type: "start" });
  return generateId();
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
