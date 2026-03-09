import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AssistantUIMessage } from "@/lib/agents/assistant-agent";
import { ChatClient } from "./chat-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    const initialMessagesById = new Map<string, AssistantUIMessage>();
    const messageIdsInOrder: string[] = [];

    for (const line of fileContents.split("\n")) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }

      const parsedMessage = parseAssistantUIMessage(trimmedLine);

      if (!parsedMessage) {
        continue;
      }

      if (!initialMessagesById.has(parsedMessage.id)) {
        messageIdsInOrder.push(parsedMessage.id);
      }

      initialMessagesById.set(parsedMessage.id, parsedMessage);
    }

    const initialMessages: AssistantUIMessage[] = [];

    for (const messageId of messageIdsInOrder) {
      const message = initialMessagesById.get(messageId);

      if (!message) {
        continue;
      }

      initialMessages.push(message);
    }

    return initialMessages;
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}

function parseAssistantUIMessage(line: string) {
  try {
    const parsedValue: unknown = JSON.parse(line);

    if (!isAssistantUIMessage(parsedValue)) {
      return null;
    }

    return parsedValue;
  } catch {
    return null;
  }
}

function isAssistantUIMessage(value: unknown): value is AssistantUIMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("id" in value) || typeof value.id !== "string") {
    return false;
  }

  if (
    !("role" in value) ||
    (value.role !== "assistant" && value.role !== "user" && value.role !== "system")
  ) {
    return false;
  }

  if (!("parts" in value) || !Array.isArray(value.parts)) {
    return false;
  }

  return true;
}

function isMissingFileError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
