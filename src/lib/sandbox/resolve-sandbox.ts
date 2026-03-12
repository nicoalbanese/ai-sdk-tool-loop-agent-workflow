import { Sandbox } from "@vercel/sandbox";

const SANDBOX_TIMEOUT_MS = 30 * 60 * 1000;
const SANDBOX_TIMEOUT_EXTENSION_MS = 15 * 60 * 1000;

const nonReusableStatuses = new Set([
  "aborted",
  "failed",
  "stopped",
  "stopping",
]);

export async function reconnectSandbox(sandboxId: string) {
  "use step";

  const sandbox = await Sandbox.get({ sandboxId });

  if (nonReusableStatuses.has(sandbox.status)) {
    throw new Error(
      `Sandbox ${sandboxId} is not reusable (status: ${sandbox.status}).`,
    );
  }

  if (sandbox.timeout < SANDBOX_TIMEOUT_EXTENSION_MS) {
    await sandbox.extendTimeout(SANDBOX_TIMEOUT_MS);
  }

  return sandbox;
}
