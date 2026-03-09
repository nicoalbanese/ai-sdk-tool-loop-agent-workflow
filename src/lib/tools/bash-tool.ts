import { tool } from "ai";
import { z } from "zod";
import { getAssistantSandbox } from "../sandbox/assistant-context";

const bashCommandSchema = z.object({
  command: z
    .string()
    .min(1)
    .regex(/^\S+$/, "command must be a single executable token without spaces")
    .describe(
      "Executable only, with no flags or spaces. Correct: command='ls'. Incorrect: command='ls -la'. For shell syntax (|, &&, redirects), use command='bash' with args=['-lc', '<script>']."
    ),
  args: z
    .array(z.string())
    .optional()
    .describe(
      "Optional argument tokens in order. Put each token in its own array item. Example: ls -la => args=['-la']; git commit -m 'msg' => args=['commit', '-m', 'msg']."
    ),
  cwd: z
    .string()
    .optional()
    .describe("Optional working directory. Defaults to /vercel/sandbox."),
});

export const bashTool = tool({
  description:
    "Run a non-interactive command in the connected Vercel Sandbox via runCommand({ cmd, args, cwd }). Always split executable and arguments: use command='ls' with args=['-la'], never command='ls -la'.",
  inputSchema: bashCommandSchema,
  execute: async ({ command, args, cwd }, { experimental_context, abortSignal }) => {
    try {
      const sandbox = getAssistantSandbox(experimental_context);
      const result = await sandbox.runCommand({
        cmd: command,
        args,
        cwd,
        signal: abortSignal,
      });

      const [stdout, stderr] = await Promise.all([
        result.stdout({ signal: abortSignal }),
        result.stderr({ signal: abortSignal }),
      ]);

      return {
        command,
        args: args ?? [],
        cwd: cwd ?? "/vercel/sandbox",
        exitCode: result.exitCode,
        stdout,
        stderr,
        error: null,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error while running command";

      return {
        command,
        args: args ?? [],
        cwd: cwd ?? "/vercel/sandbox",
        exitCode: null,
        stdout: "",
        stderr: "",
        error: errorMessage,
      };
    }
  },
});
