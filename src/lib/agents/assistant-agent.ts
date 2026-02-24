import {
  gateway,
  GatewayModelId,
  LanguageModel,
  stepCountIs,
  ToolLoopAgent,
  InferAgentUIMessage,
} from "ai";
import { weatherTool } from "../tools/weather-tool";
import { timeTool } from "../tools/time-tool";
import { z } from "zod";

const agentType = z.enum(["normal", "durable"]);

const callOptionsSchema = z.object({
  modelId: z.string<GatewayModelId>(),
  type: agentType.optional(),
});

export const assistantAgent = new ToolLoopAgent({
  model: "anthropic/claude-haiku-4-5",
  instructions:
    "You are a helpful assistant that can check the weather and the current time. Use the available tools when the user asks about weather or time.",
  tools: {
    weather: weatherTool,
    time: timeTool,
  },
  callOptionsSchema,
  prepareCall: async ({ options, ...rest }) => {
    // b/c we can't serialize functions, we need to reconstruct here
    const model = gateway(options.modelId);
    return {
      ...rest,
      model: model,
      // for durable execution, we need to manage the loop ourselves
      // therefore we need to set stopWhen to stop after 1 step
      stopWhen: options.type === "durable" ? stepCountIs(1) : undefined,
      // for things like sandbox that aren't serializable, we would need to reconnect in prepareCall,
      // then pass them in here
      experimental_context: undefined
    };
  },
});

export type CallOptions = z.infer<typeof callOptionsSchema>;
export type AssistantUIMessage = InferAgentUIMessage<typeof assistantAgent>;
