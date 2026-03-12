import {
  type DurableOnMessageStepInput,
  type DurableStepHandlerInput,
  type DurableStepHandlerResult,
  makeDurable,
  runAgentStepHandler,
} from "@/lib/durable/make-durable";
import { assistantAgent } from "@/lib/agents/assistant-agent";
import {
  persistAssistantMessage,
  persistUserMessage,
} from "@/lib/history/persist-assistant-message";

async function runAssistantStepHandler(
  input: DurableStepHandlerInput<typeof assistantAgent>,
): Promise<DurableStepHandlerResult<typeof assistantAgent>> {
  "use step";

  return runAgentStepHandler(assistantAgent, input);
}

async function persistMessageStep({
  message,
  wasAborted,
}: DurableOnMessageStepInput<typeof assistantAgent>) {
  "use step";

  if (message.role === "user") {
    await persistUserMessage(message);
    return;
  }

  if (message.role !== "assistant" || wasAborted) {
    return;
  }

  await persistAssistantMessage(message);
}

const durableAssistant = makeDurable(assistantAgent, {
  maxIterations: 20,
  stepHandler: runAssistantStepHandler,
  onMessage: persistMessageStep,
});

export async function runAgent(...args: Parameters<typeof durableAssistant.run>) {
  "use workflow";

  await durableAssistant.run(...args);
}

const boundDurableAssistant = durableAssistant.bind(runAgent);

export const { start: startRunAgent, resume: resumeRunAgent } =
  boundDurableAssistant;
