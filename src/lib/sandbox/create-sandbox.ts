import { Sandbox } from "@vercel/sandbox";

const SANDBOX_TIMEOUT_MS = 30 * 60 * 1000;

export async function createSandbox() {
  return Sandbox.create({
    timeout: SANDBOX_TIMEOUT_MS,
    networkPolicy: "allow-all",
  });
}
