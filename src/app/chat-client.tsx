"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@workflow/ai";
import type { AssistantUIMessage } from "@/lib/agents/assistant-agent";

type SandboxResponse = {
  sandboxId: string;
};

type ChatClientProps = {
  initialMessages: AssistantUIMessage[];
};

const WORKFLOW_RUN_ID_STORAGE_KEY_PREFIX = "active-workflow-run-id";

export function ChatClient({ initialMessages }: ChatClientProps) {
  const [input, setInput] = useState("");
  const [isCreatingSandbox, setIsCreatingSandbox] = useState(false);
  const [activeWorkflowRunId, setActiveWorkflowRunId] = useState<string | null>(
    null,
  );
  const [isStoppingWorkflow, setIsStoppingWorkflow] = useState(false);
  const { containerRef, isAtBottom, scrollToBottom } =
    useScrollToBottom<HTMLDivElement>();

  const router = useRouter();
  const searchParams = useSearchParams();
  const sandboxId = searchParams.get("sandboxId");

  useEffect(() => {
    if (!sandboxId) {
      setActiveWorkflowRunId(null);
      return;
    }

    setActiveWorkflowRunId(getStoredWorkflowRunId(sandboxId));
  }, [sandboxId]);

  const transport = useMemo(
    () =>
      new WorkflowChatTransport<AssistantUIMessage>({
        api: "/api/chat",
        onChatSendMessage: (response) => {
          if (!sandboxId) {
            return;
          }

          const workflowRunId = response.headers.get("x-workflow-run-id");

          if (workflowRunId) {
            setStoredWorkflowRunId(sandboxId, workflowRunId);
            setActiveWorkflowRunId(workflowRunId);
          }
        },
        onChatEnd: () => {
          if (!sandboxId) {
            return;
          }

          clearStoredWorkflowRunId(sandboxId);
          setActiveWorkflowRunId(null);
        },
        prepareSendMessagesRequest: ({ messages }) => {
          if (!sandboxId) {
            throw new Error("sandboxId is required");
          }

          return {
            body: {
              messages,
              sandboxId,
            },
          };
        },
        prepareReconnectToStreamRequest: ({ api }) => {
          if (!sandboxId) {
            return { api };
          }

          const workflowRunId = getStoredWorkflowRunId(sandboxId);

          if (!workflowRunId) {
            return { api };
          }

          return {
            api: `/api/chat/${encodeURIComponent(workflowRunId)}/stream`,
          };
        },
      }),
    [sandboxId],
  );

  const stopTargetRunId =
    activeWorkflowRunId ?? (sandboxId ? getStoredWorkflowRunId(sandboxId) : null);

  const { messages, sendMessage, status, stop } = useChat<AssistantUIMessage>({
    resume: Boolean(stopTargetRunId),
    transport,
    messages: initialMessages,
  });

  useEffect(() => {
    if (status === "ready") {
      setIsStoppingWorkflow(false);
    }
  }, [status]);

  const createSandbox = async () => {
    setIsCreatingSandbox(true);

    try {
      const response = await fetch("/api/sandbox", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to create sandbox");
      }

      const payload = await response.json();
      if (!isSandboxResponse(payload)) {
        throw new Error("Invalid sandbox response");
      }

      const params = new URLSearchParams(searchParams.toString());
      params.set("sandboxId", payload.sandboxId);
      router.replace(`?${params.toString()}`);
    } finally {
      setIsCreatingSandbox(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || !sandboxId) {
      return;
    }

    sendMessage({ text: input });

    setInput("");
  };

  const handleStopWorkflow = async () => {
    const workflowRunId = stopTargetRunId;
    const latestAssistantMessage = getLatestAssistantMessage(messages);

    if (!workflowRunId || status === "ready") {
      return;
    }

    setIsStoppingWorkflow(true);
    stop();

    try {
      const response = await fetch("/api/chat/stop", {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          runId: workflowRunId,
          assistantMessage: latestAssistantMessage,
        }),
      });

      if (!response.ok) {
        return;
      }
    } finally {
      setIsStoppingWorkflow(false);

      if (sandboxId) {
        clearStoredWorkflowRunId(sandboxId);
      }

      setActiveWorkflowRunId(null);
    }
  };

  if (!sandboxId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 font-sans dark:bg-black">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm dark:bg-zinc-900">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Start a sandbox chat
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Create a new sandbox session to start chatting.
          </p>

          <button
            type="button"
            onClick={() => void createSandbox()}
            disabled={isCreatingSandbox}
            className="mt-4 w-full rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {isCreatingSandbox ? "Creating sandbox..." : "Create new sandbox"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col items-center overflow-hidden bg-zinc-50 py-6 font-sans dark:bg-black">
      <div className="flex h-full w-full max-w-4xl flex-col gap-4 px-4">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Assistant Agent
        </h1>

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Sandbox: {sandboxId}
        </p>

        <div className="relative min-h-0 flex-1">
          <div
            ref={containerRef}
            className="flex h-full flex-col gap-3 overflow-y-auto pr-1"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  message.role === "user"
                    ? "self-end bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "self-start bg-white text-zinc-800 shadow-sm dark:bg-zinc-900 dark:text-zinc-200"
                }`}
              >
                {message.parts.map((part, i) => {
                  switch (part.type) {
                    case "text":
                      return <span key={i}>{part.text}</span>;
                    case "tool-bash":
                      if (part.state === "output-available") {
                        const args =
                          part.output.args.length > 0
                            ? ` ${part.output.args.join(" ")}`
                            : "";
                        const stdoutPreview = getOutputPreview(part.output.stdout);
                        const stderrPreview = getOutputPreview(part.output.stderr);

                        return (
                          <div
                            key={i}
                            className="my-1 rounded-lg bg-zinc-100 px-3 py-2 text-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                          >
                            <div className="font-mono text-xs">
                              $ {part.output.command}
                              {args}
                            </div>
                            <div className="mt-1 text-xs">
                              exit {part.output.exitCode}
                            </div>
                            {stdoutPreview.preview ? (
                              <div className="mt-2">
                                <pre className="max-w-full overflow-x-auto overflow-y-hidden whitespace-pre rounded bg-white/60 p-2 text-xs dark:bg-black/40">
                                  {stdoutPreview.preview}
                                </pre>
                                {stdoutPreview.hiddenLineCount > 0 ? (
                                  <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                                    +{stdoutPreview.hiddenLineCount} more line
                                    {stdoutPreview.hiddenLineCount === 1 ? "" : "s"}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            {stderrPreview.preview ? (
                              <div className="mt-2">
                                <pre className="max-w-full overflow-x-auto overflow-y-hidden whitespace-pre rounded bg-red-100 p-2 text-xs text-red-900 dark:bg-red-950/60 dark:text-red-100">
                                  {stderrPreview.preview}
                                </pre>
                                {stderrPreview.hiddenLineCount > 0 ? (
                                  <div className="mt-1 text-[11px] text-red-700 dark:text-red-300">
                                    +{stderrPreview.hiddenLineCount} more line
                                    {stderrPreview.hiddenLineCount === 1 ? "" : "s"}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      }

                      if (
                        part.state === "input-available" ||
                        part.state === "input-streaming"
                      ) {
                        return (
                          <div key={i} className="my-1 text-zinc-400">
                            Running command
                            {part.state === "input-available"
                              ? `: ${part.input.command}`
                              : ""}
                            ...
                          </div>
                        );
                      }

                      return null;
                    default:
                      return null;
                  }
                })}
              </div>
            ))}
          </div>

          {!isAtBottom ? (
            <button
              type="button"
              onClick={scrollToBottom}
              aria-label="Jump to latest"
              className="absolute bottom-3 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-zinc-200 text-zinc-700 shadow-sm transition-colors hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600"
            >
              <span aria-hidden="true">&darr;</span>
            </button>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about weather, time, or run bash commands..."
            className="flex-1 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="submit"
            disabled={status !== "ready"}
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Send
          </button>
          <button
            type="button"
            onClick={() => void handleStopWorkflow()}
            disabled={status === "ready" || !stopTargetRunId || isStoppingWorkflow}
            className="rounded-full border border-zinc-300 bg-white px-5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {isStoppingWorkflow ? "Stopping..." : "Stop"}
          </button>
        </form>
      </div>
    </div>
  );
}

function isSandboxResponse(value: unknown): value is SandboxResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("sandboxId" in value) || typeof value.sandboxId !== "string") {
    return false;
  }

  return true;
}

function getStoredWorkflowRunId(sandboxId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(getWorkflowRunIdStorageKey(sandboxId));
}

function setStoredWorkflowRunId(sandboxId: string, runId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getWorkflowRunIdStorageKey(sandboxId), runId);
}

function clearStoredWorkflowRunId(sandboxId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(getWorkflowRunIdStorageKey(sandboxId));
}

function getWorkflowRunIdStorageKey(sandboxId: string) {
  return `${WORKFLOW_RUN_ID_STORAGE_KEY_PREFIX}:${sandboxId}`;
}

function getLatestAssistantMessage(messages: AssistantUIMessage[]) {
  const lastMessage = messages[messages.length - 1];

  if (!lastMessage || lastMessage.role !== "assistant") {
    return undefined;
  }

  return lastMessage;
}

function getOutputPreview(text: string, maxLines = 3) {
  if (!text) {
    return {
      preview: "",
      hiddenLineCount: 0,
    };
  }

  const normalizedText = text.replaceAll("\r\n", "\n");
  const lines = normalizedText.split("\n");

  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return {
    preview: lines.slice(0, maxLines).join("\n"),
    hiddenLineCount: Math.max(lines.length - maxLines, 0),
  };
}

function useScrollToBottom<T extends HTMLElement>() {
  const containerRef = useRef<T>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const threshold = 10;
      const atBottom = scrollHeight - scrollTop - clientHeight < threshold;

      if (isAtBottomRef.current !== atBottom) {
        isAtBottomRef.current = atBottom;
        setIsAtBottom(atBottom);
      }
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    container.addEventListener("scroll", handleScroll, { passive: true });
    scrollToBottom();
    handleScroll();

    const mutationObserver = new MutationObserver(() => {
      if (isAtBottomRef.current) {
        requestAnimationFrame(scrollToBottom);
      }
    });

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      mutationObserver.disconnect();
    };
  }, [handleScroll, scrollToBottom]);

  return {
    containerRef,
    isAtBottom,
    scrollToBottom,
  };
}
