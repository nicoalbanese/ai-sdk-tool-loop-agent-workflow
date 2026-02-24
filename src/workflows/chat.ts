import { getWritable } from "workflow";
import { convertToModelMessages, gateway } from "ai";
import { assistantAgent, CallOptions } from "@/lib/agents/assistant-agent";
import type {
  GatewayModelId,
  LanguageModel,
  UIMessage,
  UIMessageChunk,
  ModelMessage,
} from "ai";

export async function handleChat(messages: UIMessage[]) {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();
  let modelMessages = await toModelMessages(messages);

  // can't pass because not serializable
  // const model: LanguageModel = gateway("anthropic/claude-haiku-4-5");
  const modelId: GatewayModelId = "anthropic/claude-haiku-4-5";

  const maxIterations = 10;

  for (let i = 0; i < maxIterations; i++) {
    const { responseMessages, finishReason } = await runAgentStep(
      modelMessages,
      writable,
      { modelId, type: "durable" },
    );
    modelMessages = [...modelMessages, ...responseMessages];
    if (finishReason !== "tool-calls") break;
  }

  await closeStream(writable);
}

async function toModelMessages(messages: UIMessage[]) {
  "use step";
  return convertToModelMessages(messages);
}

async function runAgentStep(
  messages: ModelMessage[],
  writable: WritableStream<UIMessageChunk>,
  callOptions: CallOptions,
) {
  "use step";

  const result = await assistantAgent.stream({
    messages,
    options: callOptions,
  });
  const stream = result.toUIMessageStream();
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

async function closeStream(writable: WritableStream<UIMessageChunk>) {
  "use step";

  await writable.close();
}
