import {
  getDeserializeStream,
  getExternalRevivers,
} from "@workflow/core/serialization";
import { getWorld, readStream } from "@workflow/core/runtime";
import { createCancelableReadableStream } from "@/lib/chat/create-cancelable-readable-stream";

type WorkflowRunReadableStreamOptions = {
  namespace?: string;
  startIndex?: number;
};

export async function getWorkflowRunReadableStream<T>(
  runId: string,
  options: WorkflowRunReadableStreamOptions = {},
) {
  const { namespace, startIndex } = options;
  const world = getWorld();
  const source = await readStream(world, getWorkflowRunStreamId(runId, namespace), {
    startIndex,
  });
  const deserializeStream: TransformStream<Uint8Array, T> =
    getDeserializeStream(getExternalRevivers(globalThis, [], runId));

  return createCancelableReadableStream(source).pipeThrough(deserializeStream);
}

function getWorkflowRunStreamId(runId: string, namespace?: string) {
  const streamId = `${runId.replace("wrun_", "strm_")}_user`;

  if (!namespace) {
    return streamId;
  }

  const encodedNamespace = Buffer.from(namespace, "utf-8").toString("base64url");

  return `${streamId}_${encodedNamespace}`;
}
