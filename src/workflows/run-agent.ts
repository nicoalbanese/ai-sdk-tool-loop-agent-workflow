import { getWritable } from "workflow";
import { convertToModelMessages, generateId } from "ai";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { UIMessageChunk, ModelMessage, InferAgentUIMessage } from "ai";
import z from "zod";
import { agent, AgentCallOptionsSchema } from "./setup";

type AgentMessage = InferAgentUIMessage<typeof agent>;
type CallOptions = z.infer<AgentCallOptionsSchema>;

type Writable = WritableStream<UIMessageChunk>;

export async function runAgent(
  messages: AgentMessage[],
  options: CallOptions,
  maxIterations = 20,
) {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();

  await persistLatestUserMessage(messages);

  let modelMessages = await toModelMessages(messages);
  const messageId = await sendStart(writable);

  const collectedUIMessage: AgentMessage = {
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

async function toModelMessages(messages: AgentMessage[]) {
  "use step";
  return convertToModelMessages(messages);
}

async function persistRun(uiMessage: AgentMessage | undefined) {
  "use step";

  if (!uiMessage) {
    return;
  }

  const assistantResponsesPath = join(
    process.cwd(),
    ".workflow-data",
    "assistant-responses.jsonl",
  );

  await mkdir(dirname(assistantResponsesPath), { recursive: true });
  await appendFile(
    assistantResponsesPath,
    `${JSON.stringify(uiMessage)}\n`,
    "utf8",
  );
}

async function persistLatestUserMessage(messages: AgentMessage[]) {
  "use step";

  const latestMessage = messages[messages.length - 1];

  if (!latestMessage || latestMessage.role !== "user") {
    return;
  }

  const assistantResponsesPath = join(
    process.cwd(),
    ".workflow-data",
    "assistant-responses.jsonl",
  );

  await mkdir(dirname(assistantResponsesPath), { recursive: true });
  await appendFile(
    assistantResponsesPath,
    `${JSON.stringify(latestMessage)}\n`,
    "utf8",
  );
}

async function runAgentStep(
  messages: ModelMessage[],
  originalMessages: AgentMessage[],
  writable: Writable,
  callOptions: CallOptions,
  messageId: string,
) {
  "use step";

  let generatedParts: AgentMessage["parts"] = [];

  const result = await agent.stream({
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
