import { tool } from "ai";
import { z } from "zod";
import { getAssistantSandbox } from "../sandbox/assistant-context";

const bashCommandSchema = z.object({
  command: z.string().min(1).describe("Command to execute inside the sandbox"),
  args: z.array(z.string()).optional().describe("Optional command arguments"),
  cwd: z.string().optional().describe("Optional working directory"),
});

export const bashTool = tool({
  description: "Run a bash command inside the connected Vercel Sandbox",
  inputSchema: bashCommandSchema,
  execute: async ({ command, args, cwd }, { experimental_context }) => {
    "use step";

    const sandbox = getAssistantSandbox(experimental_context);
    const result = await sandbox.runCommand({
      cmd: command,
      args,
      cwd,
    });

    const [stdout, stderr] = await Promise.all([
      result.stdout(),
      result.stderr(),
    ]);

    return {
      command,
      args: args ?? [],
      cwd: cwd ?? "/vercel/sandbox",
      exitCode: result.exitCode,
      stdout,
      stderr,
    };
  },
});
