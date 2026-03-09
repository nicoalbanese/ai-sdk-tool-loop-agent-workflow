import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AssistantUIMessage } from "@/lib/agents/assistant-agent";
import type { UIMessage } from "ai";

const assistantResponsesPath = join(
  process.cwd(),
  ".workflow-data",
  "assistant-responses.jsonl",
);

let writeQueue: Promise<void> = Promise.resolve();
const persistedAssistantIds = new Set<string>();

function enqueueWrite(message: UIMessage) {
  const operation = async () => {
    await mkdir(dirname(assistantResponsesPath), { recursive: true });
    await appendFile(
      assistantResponsesPath,
      `${JSON.stringify(message)}\n`,
      "utf8",
    );
  };

  // Chain writes so they never run concurrently
  writeQueue = writeQueue.then(operation, operation);
  return writeQueue;
}

export async function persistAssistantMessage(message: AssistantUIMessage) {
  if (persistedAssistantIds.has(message.id)) {
    return;
  }
  persistedAssistantIds.add(message.id);
  return enqueueWrite(message);
}

export async function persistUserMessage(message: UIMessage) {
  return enqueueWrite(message);
}
