import {
  assistantAgent,
  callOptionsSchema,
} from "@/lib/agents/assistant-agent";

// SET YOUR AGENT HERE
export const agent = assistantAgent;
export type AgentCallOptionsSchema = typeof callOptionsSchema;
