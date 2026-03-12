import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type FinishReason,
  type InferAgentUIMessage,
  type InferUIMessageChunk,
  type ModelMessage,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { getWritable, getWorkflowMetadata } from "workflow";
import { getRun, start as startWorkflow } from "workflow/api";

type AgentShape = {
  version: "agent-v1";
  tools: ToolSet;
  stream: unknown;
};

type AgentCallOptions<TAgent> = TAgent extends {
  stream: (options: infer TStreamInput) => PromiseLike<unknown>;
}
  ? TStreamInput extends { options: infer TOptions }
    ? TOptions
    : never
  : never;

export type DurableMessage<TAgent extends AgentShape> = InferAgentUIMessage<TAgent>;

export type DurableCallOptions<TAgent extends AgentShape> =
  AgentCallOptions<TAgent>;

type WorkflowDefinition<TMessage extends UIMessage, TOptions> = (
  messages: TMessage[],
  options: TOptions,
  maxIterations?: number,
) => Promise<void>;

type StartArgs<TMessage extends UIMessage, TOptions> = {
  messages: TMessage[];
  options: TOptions;
  maxIterations?: number;
  response?: ResponseInit;
};

type ResumeArgs = {
  runId: string;
  startIndex?: number;
  response?: ResponseInit;
};

export type StepHandlerInput<TMessage extends UIMessage, TOptions> = {
  messages: ModelMessage[];
  originalMessages: TMessage[];
  latestAssistantMessage: TMessage | undefined;
  writable: WritableStream<UIMessageChunk>;
  options: TOptions;
  workflowRunId: string;
};

export type DurableStepHandlerInput<TAgent extends AgentShape> = StepHandlerInput<
  DurableMessage<TAgent>,
  DurableCallOptions<TAgent>
>;

export type StepHandlerResult<TMessage extends UIMessage> = {
  responseMessages: ModelMessage[];
  finishReason: FinishReason;
  assistantMessage: TMessage | undefined;
  stepWasAborted: boolean;
};

export type DurableStepHandlerResult<TAgent extends AgentShape> =
  StepHandlerResult<DurableMessage<TAgent>>;

type DurableStreamResult<TMessage extends UIMessage> = {
  toUIMessageStream(options: {
    sendStart: false;
    sendFinish: false;
    originalMessages: TMessage[];
    generateMessageId: () => string;
    onFinish: (event: { responseMessage: TMessage }) => void;
  }): ReadableStream<InferUIMessageChunk<TMessage>>;
  response: PromiseLike<{ messages: ModelMessage[] }>;
  finishReason: PromiseLike<FinishReason>;
};

export type OnMessageStepInput<TMessage extends UIMessage> = {
  message: TMessage;
  wasAborted: boolean;
};

export type DurableOnMessageStepInput<TAgent extends AgentShape> =
  OnMessageStepInput<DurableMessage<TAgent>>;

type DurableConfig<TMessage extends UIMessage, TOptions> = {
  maxIterations?: number;
  stepHandler: (
    input: StepHandlerInput<TMessage, TOptions>,
  ) => PromiseLike<StepHandlerResult<TMessage>>;
  onMessage?: (input: OnMessageStepInput<TMessage>) => PromiseLike<void> | void;
};

type DurableBinding<TMessage extends UIMessage, TOptions> = {
  run(
    messages: TMessage[],
    options: TOptions,
    maxIterations?: number,
  ): Promise<void>;
  bind(
    workflow: WorkflowDefinition<TMessage, TOptions>,
  ): BoundDurableBinding<TMessage, TOptions>;
  start(
    workflow: WorkflowDefinition<TMessage, TOptions>,
    args: StartArgs<TMessage, TOptions>,
  ): Promise<Response>;
  resume(args: ResumeArgs): Promise<Response>;
};

type BoundDurableBinding<TMessage extends UIMessage, TOptions> = {
  start(args: StartArgs<TMessage, TOptions>): Promise<Response>;
  resume(args: ResumeArgs): Promise<Response>;
};

type WorkflowRun<TMessage extends UIMessage> = {
  runId: string;
  readable: ReadableStream<InferUIMessageChunk<TMessage>>;
};

export function makeDurable<TAgent extends AgentShape>(
  agent: TAgent,
  config: DurableConfig<
    InferAgentUIMessage<TAgent>,
    AgentCallOptions<TAgent>
  >,
): DurableBinding<InferAgentUIMessage<TAgent>, AgentCallOptions<TAgent>> {
  type TMessage = InferAgentUIMessage<TAgent>;
  type TOptions = AgentCallOptions<TAgent>;

  const defaultMaxIterations = config.maxIterations ?? 20;

  async function run(
    messages: TMessage[],
    options: TOptions,
    maxIterations = defaultMaxIterations,
  ) {
    const { workflowRunId } = getWorkflowMetadata();
    const writable = getWritable<UIMessageChunk>();
    let modelMessages = await convertToModelMessages(messages, {
      ignoreIncompleteToolCalls: true,
      tools: agent.tools,
    });
    let latestAssistantMessage: TMessage | undefined;
    let didFinish = false;
    let wasAborted = false;

    const latestMessage = messages[messages.length - 1];
    if (latestMessage?.role === "user") {
      await config.onMessage?.({ message: latestMessage, wasAborted: false });
    }

    await sendStart(writable, workflowRunId);

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const result = await config.stepHandler({
        messages: modelMessages,
        originalMessages: messages,
        latestAssistantMessage,
        writable,
        options,
        workflowRunId,
      });

      latestAssistantMessage = result.assistantMessage ?? latestAssistantMessage;
      wasAborted = wasAborted || result.stepWasAborted;
      modelMessages = [...modelMessages, ...result.responseMessages];

      if (result.finishReason !== "tool-calls") {
        didFinish = true;
        await sendFinish(writable);
        break;
      }
    }

    if (!didFinish) {
      await sendFinish(writable);
    }

    if (latestAssistantMessage) {
      await config.onMessage?.({
        message: latestAssistantMessage,
        wasAborted,
      });
    }

    await closeWritable(writable);
  }

  async function start(
    workflow: WorkflowDefinition<TMessage, TOptions>,
    args: StartArgs<TMessage, TOptions>,
  ) {
    const { messages, options, maxIterations, response } = args;
    const workflowRun = await startWorkflow(workflow, [
      messages,
      options,
      maxIterations,
    ]);

    return createStartResponse(workflowRun, messages, response);
  }

  async function resume({ runId, startIndex, response }: ResumeArgs) {
    const run = getRun(runId);
    const runStatus = await run.status;

    if (runStatus === "cancelled") {
      return createUIMessageStreamResponse({
        stream: createTerminalFinishStream<TMessage>("stop"),
        ...response,
      });
    }

    const readable =
      startIndex === undefined
        ? run.getReadable<InferUIMessageChunk<TMessage>>()
        : run.getReadable<InferUIMessageChunk<TMessage>>({ startIndex });

    const stream = createUIMessageStream<TMessage>({
      generateId: () => runId,
      execute: ({ writer }) => {
        writer.merge(readable);
      },
    });

    return createUIMessageStreamResponse({
      stream,
      ...response,
    });
  }

  function bind(workflow: WorkflowDefinition<TMessage, TOptions>) {
    return {
      start(args: StartArgs<TMessage, TOptions>) {
        return start(workflow, args);
      },
      resume,
    };
  }

  return {
    run,
    bind,
    start,
    resume,
  };
}

export function runAgentStepHandler<TAgent extends AgentShape>(
  agent: TAgent,
  input: DurableStepHandlerInput<TAgent>,
): Promise<DurableStepHandlerResult<TAgent>>;
export async function runAgentStepHandler<TMessage extends UIMessage, TOptions>(
  agent: {
    stream(options: {
      messages: ModelMessage[];
      options: TOptions;
      abortSignal?: AbortSignal;
    }): PromiseLike<DurableStreamResult<TMessage>>;
  },
  input: StepHandlerInput<TMessage, TOptions>,
): Promise<StepHandlerResult<TMessage>> {
  const abortController = new AbortController();
  const stopMonitor = startRunCancellationMonitor(
    input.workflowRunId,
    abortController,
  );

  try {
    const result = await agent.stream({
      messages: input.messages,
      options: input.options,
      abortSignal: abortController.signal,
    });

    const streamOriginalMessages = withLatestAssistantMessage(
      input.originalMessages,
      input.latestAssistantMessage,
    );
    let assistantMessage: TMessage | undefined;

    const stream = result.toUIMessageStream({
      sendStart: false,
      sendFinish: false,
      originalMessages: streamOriginalMessages,
      generateMessageId: () => input.workflowRunId,
      onFinish: ({ responseMessage }) => {
        assistantMessage = responseMessage;
      },
    });

    const reader = stream.getReader();
    const writer = input.writable.getWriter();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        await writer.write(value);
      }
    } finally {
      reader.releaseLock();
      writer.releaseLock();
    }

    const response = await result.response;
    const finishReason = await result.finishReason;

    return {
      responseMessages: response.messages,
      finishReason,
      assistantMessage,
      stepWasAborted: false,
    };
  } catch (error) {
    if (isAbortError(error)) {
      const finishReason: FinishReason = "stop";

      return {
        responseMessages: [],
        finishReason,
        assistantMessage: undefined,
        stepWasAborted: true,
      };
    }

    throw error;
  } finally {
    stopMonitor.stop();
    await stopMonitor.done;
  }
}

export function withLatestAssistantMessage<TMessage extends UIMessage>(
  messages: TMessage[],
  latestAssistantMessage: TMessage | undefined,
) {
  if (!latestAssistantMessage) {
    return messages;
  }

  const lastMessage = messages[messages.length - 1];

  if (lastMessage?.role === "assistant") {
    return [...messages.slice(0, -1), latestAssistantMessage];
  }

  return [...messages, latestAssistantMessage];
}

export async function sendStart(
  writable: WritableStream<UIMessageChunk>,
  messageId: string,
) {
  "use step";

  const writer = writable.getWriter();
  try {
    await writer.write({ type: "start", messageId });
  } finally {
    writer.releaseLock();
  }
}

export async function sendFinish(writable: WritableStream<UIMessageChunk>) {
  "use step";

  const writer = writable.getWriter();
  try {
    await writer.write({ type: "finish", finishReason: "stop" });
  } finally {
    writer.releaseLock();
  }
}

export async function closeWritable(writable: WritableStream<UIMessageChunk>) {
  "use step";

  await writable.close();
}

export function startRunCancellationMonitor(
  runId: string,
  abortController: AbortController,
) {
  let shouldStop = false;

  const done = (async () => {
    const run = getRun(runId);

    while (!shouldStop && !abortController.signal.aborted) {
      let runStatus: "pending" | "running" | "completed" | "failed" | "cancelled";

      try {
        runStatus = await run.status;
      } catch {
        await delay(150);
        continue;
      }

      if (runStatus === "cancelled") {
        abortController.abort();
        return;
      }

      await delay(150);
    }
  })();

  return {
    stop() {
      shouldStop = true;
    },
    done,
  };
}

function createStartResponse<TMessage extends UIMessage>(
  workflowRun: WorkflowRun<TMessage>,
  messages: TMessage[],
  response: ResponseInit | undefined,
) {
  const stream = createUIMessageStream<TMessage>({
    originalMessages: messages,
    generateId: () => workflowRun.runId,
    execute: ({ writer }) => {
      writer.merge(workflowRun.readable);
    },
  });

  return createUIMessageStreamResponse({
    stream,
    ...response,
    headers: withWorkflowRunIdHeader(response?.headers, workflowRun.runId),
  });
}

function createTerminalFinishStream<TMessage extends UIMessage>(
  finishReason: "stop",
) {
  return new ReadableStream<InferUIMessageChunk<TMessage>>({
    start(controller) {
      controller.enqueue({ type: "finish", finishReason });
      controller.close();
    },
  });
}

function withWorkflowRunIdHeader(headers: HeadersInit | undefined, runId: string) {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("x-workflow-run-id", runId);
  return nextHeaders;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
