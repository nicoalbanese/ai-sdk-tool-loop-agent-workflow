import { resumeRunAgent } from "@/workflows/run-agent";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const startIndexResult = parseStartIndex(searchParams.get("startIndex"));

  if (startIndexResult === "invalid") {
    return Response.json(
      { error: "startIndex must be a non-negative integer" },
      { status: 400 },
    );
  }

  return resumeRunAgent({
    runId: id,
    startIndex: startIndexResult,
  });
}

function parseStartIndex(value: string | null) {
  if (value === null) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    return "invalid";
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return "invalid";
  }

  return parsed;
}
