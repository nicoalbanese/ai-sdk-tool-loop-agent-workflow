import { NextResponse } from "next/server";
import { createSandbox } from "@/lib/sandbox/create-sandbox";

export async function GET() {
  const sandbox = await createSandbox();

  return NextResponse.json(
    {
      sandboxId: sandbox.sandboxId,
      status: sandbox.status,
      timeout: sandbox.timeout,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
