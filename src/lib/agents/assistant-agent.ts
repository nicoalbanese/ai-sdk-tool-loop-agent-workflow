import {
  ToolLoopAgent,
  InferAgentUIMessage,
  stepCountIs,
  LanguageModel,
} from "ai";
import { z } from "zod";
import { bashTool } from "../tools/bash-tool";
import type { AssistantAgentContext } from "../sandbox/assistant-context";
import { Sandbox } from "@vercel/sandbox";

const agentType = z.enum(["normal", "durable"]);

export const callOptionsSchema = z.object({
  model: z.custom<LanguageModel>(),
  type: agentType.optional(),
  sandbox: z.custom<Sandbox>(),
});

export const assistantAgent = new ToolLoopAgent({
  model: "anthropic/claude-haiku-4-5",
  instructions:
    "You are a persistent, resourceful coding assistant that helps developers build things in an isolated sandbox environment. You have access to a bash tool for running commands in the sandbox. When a task fails, don't give up — try alternative approaches, debug errors, and keep iterating until you find a solution. Users can already see raw command output, so DO NOT repeat full command output in your response. Instead, briefly confirm what you ran and the outcome.",
  tools: {
    bash: bashTool,
  },
  callOptionsSchema,
  prepareCall: async ({ options, ...rest }) => {
    const sandboxContext: AssistantAgentContext = { sandbox: options.sandbox };

    return {
      ...rest,
      model: options.model,
      // for things like sandbox that aren't serializable, we reconnect in prepareCall,
      // then pass the connected instance through context for tool execution.
      experimental_context: sandboxContext,
      stopWhen: options.type === "durable" ? stepCountIs(1) : stepCountIs(20),
    };
  },
});

export type CallOptions = z.infer<typeof callOptionsSchema>;
export type AssistantUIMessage = InferAgentUIMessage<typeof assistantAgent>;
