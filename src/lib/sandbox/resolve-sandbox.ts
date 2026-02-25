import { Sandbox } from "@vercel/sandbox";

const SANDBOX_RUNTIME = "node22";
const SANDBOX_TIMEOUT_MS = 30 * 60 * 1000;
const SANDBOX_TIMEOUT_EXTENSION_MS = 15 * 60 * 1000;

const nonReusableStatuses = new Set(["aborted", "failed", "stopped", "stopping"]);

async function createSandbox() {
  return Sandbox.create({
    runtime: SANDBOX_RUNTIME,
    timeout: SANDBOX_TIMEOUT_MS,
  });
}

export async function resolveSandbox(sandboxId?: string | null) {
  if (!sandboxId) {
    const sandbox = await createSandbox();
    return { sandbox, reused: false };
  }

  try {
    const sandbox = await Sandbox.get({ sandboxId });

    if (nonReusableStatuses.has(sandbox.status)) {
      const freshSandbox = await createSandbox();
      return { sandbox: freshSandbox, reused: false };
    }

    if (sandbox.timeout < SANDBOX_TIMEOUT_EXTENSION_MS) {
      await sandbox.extendTimeout(SANDBOX_TIMEOUT_MS);
    }

    return { sandbox, reused: true };
  } catch {
    const sandbox = await createSandbox();
    return { sandbox, reused: false };
  }
}
