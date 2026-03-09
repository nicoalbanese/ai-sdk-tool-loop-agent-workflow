import { getRun } from "workflow/api";

type StopWorkflowRequestBody = {
  runId: string;
};

export async function POST(request: Request) {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!isStopWorkflowRequestBody(requestBody)) {
    return Response.json({ error: "runId is required" }, { status: 400 });
  }

  try {
    const run = getRun(requestBody.runId);
    await run.cancel();

    return Response.json({ status: "cancelled" });
  } catch {
    return Response.json(
      { error: "Failed to cancel workflow run" },
      { status: 500 },
    );
  }
}

function isStopWorkflowRequestBody(
  value: unknown,
): value is StopWorkflowRequestBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("runId" in value) || typeof value.runId !== "string") {
    return false;
  }

  return value.runId.length > 0;
}
