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
const persistedAssistantSnapshots = new Map<string, string>();

function enqueueWrite(serializedMessage: string) {
  const operation = async () => {
    await mkdir(dirname(assistantResponsesPath), { recursive: true });
    await appendFile(assistantResponsesPath, `${serializedMessage}\n`, "utf8");
  };

  // Chain writes so they never run concurrently
  writeQueue = writeQueue.then(operation, operation);
  return writeQueue;
}

export async function persistAssistantMessage(message: AssistantUIMessage) {
  const serializedMessage = JSON.stringify(message);
  const lastSnapshot = persistedAssistantSnapshots.get(message.id);

  if (lastSnapshot === serializedMessage) {
    return;
  }

  await enqueueWrite(serializedMessage);
  persistedAssistantSnapshots.set(message.id, serializedMessage);
}

export async function persistUserMessage(message: UIMessage) {
  return enqueueWrite(JSON.stringify(message));
}
