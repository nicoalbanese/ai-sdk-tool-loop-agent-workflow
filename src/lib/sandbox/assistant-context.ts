import { Sandbox } from "@vercel/sandbox";

export type AssistantAgentContext = {
  sandbox: Sandbox;
};

export function getAssistantSandbox(context: unknown): Sandbox {
  if (
    typeof context === "object" &&
    context !== null &&
    "sandbox" in context &&
    context.sandbox instanceof Sandbox
  ) {
    return context.sandbox;
  }

  throw new Error("Sandbox context is unavailable for this tool call.");
}
