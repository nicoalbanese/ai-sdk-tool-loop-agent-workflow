import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { UIMessage } from "ai";

const assistantResponsesPath = join(
  process.cwd(),
  ".workflow-data",
  "assistant-responses.jsonl",
);

let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(serializedMessage: string) {
  const operation = async () => {
    await mkdir(dirname(assistantResponsesPath), { recursive: true });
    await appendFile(assistantResponsesPath, `${serializedMessage}\n`, "utf8");
  };

  // Chain writes so they never run concurrently
  writeQueue = writeQueue.then(operation, operation);
  return writeQueue;
}

export async function appendHistoryMessage(message: UIMessage) {
  const serializedMessage = JSON.stringify(message);
  await enqueueWrite(serializedMessage);
}

export async function persistAssistantMessage(message: UIMessage) {
  "use step";

  await appendHistoryMessage(message);
}

export async function persistUserMessage(message: UIMessage) {
  "use step";

  return appendHistoryMessage(message);
}
