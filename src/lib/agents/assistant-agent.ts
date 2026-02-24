import { stepCountIs, ToolLoopAgent, InferAgentUIMessage } from 'ai';
import { weatherTool } from '../tools/weather-tool';
import { timeTool } from '../tools/time-tool';

export const assistantAgent = new ToolLoopAgent({
  model: 'anthropic/claude-haiku-4-5',
  instructions:
    'You are a helpful assistant that can check the weather and the current time. Use the available tools when the user asks about weather or time.',
  tools: {
    weather: weatherTool,
    time: timeTool,
  },
  stopWhen: stepCountIs(1),
});

export type AssistantUIMessage = InferAgentUIMessage<typeof assistantAgent>;
