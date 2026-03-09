import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AssistantUIMessage } from "@/lib/agents/assistant-agent";
import { ChatClient } from "./chat-client";

export default async function Home() {
  const initialMessages = await loadInitialMessages();

  return <ChatClient initialMessages={initialMessages} />;
}

async function loadInitialMessages() {
  const assistantResponsesPath = join(
    process.cwd(),
    ".workflow-data",
    "assistant-responses.jsonl",
  );

  try {
    const fileContents = await readFile(assistantResponsesPath, "utf8");
    const initialMessages: AssistantUIMessage[] = [];

    for (const line of fileContents.split("\n")) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }

      try {
        initialMessages.push(JSON.parse(trimmedLine));
      } catch {
        continue;
      }
    }

    return initialMessages;
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}

function isMissingFileError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
