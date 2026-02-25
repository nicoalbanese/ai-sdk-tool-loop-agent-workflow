import { NextRequest, NextResponse } from "next/server";
import { resolveSandbox } from "@/lib/sandbox/resolve-sandbox";

export async function GET(request: NextRequest) {
  const sandboxId = request.nextUrl.searchParams.get("sandboxId");
  const { sandbox, reused } = await resolveSandbox(sandboxId);

  return NextResponse.json(
    {
      sandboxId: sandbox.sandboxId,
      reused,
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
