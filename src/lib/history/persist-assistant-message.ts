import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AssistantUIMessage } from "@/lib/agents/assistant-agent";

export async function persistAssistantMessage(message: AssistantUIMessage) {
  const assistantResponsesPath = join(
    process.cwd(),
    ".workflow-data",
    "assistant-responses.jsonl",
  );

  await mkdir(dirname(assistantResponsesPath), { recursive: true });

  await appendFile(assistantResponsesPath, `${JSON.stringify(message)}\n`, "utf8");
}
