export function createCancelableReadableStream<T>(source: ReadableStream<T>) {
  const reader = source.getReader();
  let isCancelled = false;

  const closeController = (controller: ReadableStreamDefaultController<T>) => {
    try {
      controller.close();
    } catch {
      // Ignore close races after cancellation.
    }
  };

  const releaseReader = () => {
    try {
      reader.releaseLock();
    } catch {
      // Ignore release races after stream completion.
    }
  };

  const cancelReader = async () => {
    if (isCancelled) {
      return;
    }

    isCancelled = true;

    try {
      await reader.cancel();
    } catch {
      // Ignore cancellation races during client disconnect cleanup.
    } finally {
      releaseReader();
    }
  };

  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();

        if (done) {
          releaseReader();
          closeController(controller);
          return;
        }

        controller.enqueue(value);
      } catch (error) {
        if (isCancelled || isAbortLikeError(error)) {
          releaseReader();
          closeController(controller);
          return;
        }

        controller.error(error);
      }
    },
    async cancel() {
      await cancelReader();
    },
  });
}

function isAbortLikeError(error: unknown) {
  if (error === undefined) {
    return true;
  }

  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "ResponseAborted")
  );
}
