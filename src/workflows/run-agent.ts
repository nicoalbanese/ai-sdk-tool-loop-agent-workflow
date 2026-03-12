import {
  makeDurable,
  streamAgentStep,
  type OnMessageStepInput,
  type StreamStepInput,
  type StreamStepResult,
} from "@/lib/durable/make-durable";
import {
  assistantAgent,
  type AssistantUIMessage,
  type CallOptions,
} from "@/lib/agents/assistant-agent";
import {
  persistAssistantMessage,
  persistUserMessage,
} from "@/lib/history/persist-assistant-message";

async function streamAssistantStep(
  input: StreamStepInput<AssistantUIMessage, CallOptions>,
): Promise<StreamStepResult<AssistantUIMessage>> {
  "use step";

  return streamAgentStep<AssistantUIMessage, CallOptions>(assistantAgent, input);
}

async function persistMessageStep({
  message,
  wasAborted,
}: OnMessageStepInput<AssistantUIMessage>) {
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
  stream: streamAssistantStep,
  onMessage: persistMessageStep,
});

export async function runAgent(
  messages: AssistantUIMessage[],
  options: CallOptions,
  maxIterations?: number,
) {
  "use workflow";

  await durableAssistant.run(messages, options, maxIterations);
}

export function startRunAgent(args: {
  messages: AssistantUIMessage[];
  options: CallOptions;
  maxIterations?: number;
  response?: ResponseInit;
}) {
  return durableAssistant.start(runAgent, args);
}

export function resumeRunAgent(args: {
  runId: string;
  startIndex?: number;
  response?: ResponseInit;
}) {
  return durableAssistant.resume(args);
}
