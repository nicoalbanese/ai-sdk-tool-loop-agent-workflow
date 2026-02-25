import {
  gateway,
  GatewayModelId,
  stepCountIs,
  ToolLoopAgent,
  InferAgentUIMessage,
} from "ai";
import { z } from "zod";
import { weatherTool } from "../tools/weather-tool";
import { timeTool } from "../tools/time-tool";
import { bashTool } from "../tools/bash-tool";
import { reconnectSandbox } from "../sandbox/resolve-sandbox";
import type { AssistantAgentContext } from "../sandbox/assistant-context";

const agentType = z.enum(["normal", "durable"]);

const callOptionsSchema = z.object({
  modelId: z.string<GatewayModelId>(),
  type: agentType.optional(),
  sandboxId: z.string().min(1),
});

export const assistantAgent = new ToolLoopAgent({
  model: "anthropic/claude-haiku-4-5",
  instructions:
    "You are a helpful assistant that can check the weather and the current time, and run bash commands in an isolated sandbox when requested.",
  tools: {
    weather: weatherTool,
    time: timeTool,
    bash: bashTool,
  },
  callOptionsSchema,
  prepareCall: async ({ options, ...rest }) => {
    // b/c we can't serialize functions, we need to reconstruct here
    const model = gateway(options.modelId);

    const sandbox = await reconnectSandbox(options.sandboxId);
    const sandboxContext: AssistantAgentContext = { sandbox };

    return {
      ...rest,
      model: model,
      // for durable execution, we need to manage the loop ourselves
      // therefore we need to set stopWhen to stop after 1 step
      stopWhen: options.type === "durable" ? stepCountIs(1) : undefined,
      // for things like sandbox that aren't serializable, we reconnect in prepareCall,
      // then pass the connected instance through context for tool execution.
      experimental_context: sandboxContext,
    };
  },
});

export type CallOptions = z.infer<typeof callOptionsSchema>;
export type AssistantUIMessage = InferAgentUIMessage<typeof assistantAgent>;
