import type { Sandbox } from "@vercel/sandbox";

export type AssistantAgentContext = {
  sandbox: Sandbox;
};

export function getAssistantSandbox(context: unknown): Sandbox {
  if (hasSandbox(context)) {
    return context.sandbox;
  }

  throw new Error("Sandbox context is unavailable for this tool call.");
}

function hasSandbox(
  context: unknown,
): context is { sandbox: Sandbox } {
  if (typeof context !== "object" || context === null || !("sandbox" in context)) {
    return false;
  }

  const sandbox = context.sandbox;

  return (
    typeof sandbox === "object" &&
    sandbox !== null &&
    "runCommand" in sandbox &&
    typeof sandbox.runCommand === "function"
  );
}
