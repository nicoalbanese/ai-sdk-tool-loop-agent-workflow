'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { AssistantUIMessage } from '@/lib/agents/assistant-agent';

type SandboxResponse = {
  sandboxId: string;
};

const transport = new DefaultChatTransport({ api: '/api/chat' });

export default function Home() {
  const [input, setInput] = useState('');
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [isSandboxLoading, setIsSandboxLoading] = useState(true);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const sandboxIdFromQuery = searchParams.get('sandboxId');
  const searchParamString = searchParams.toString();

  const { messages, sendMessage, status } = useChat<AssistantUIMessage>({
    transport,
  });

  useEffect(() => {
    let canceled = false;

    const connectSandbox = async () => {
      setIsSandboxLoading(true);
      setSandboxError(null);

      const params = new URLSearchParams();
      if (sandboxIdFromQuery) {
        params.set('sandboxId', sandboxIdFromQuery);
      }

      const url = params.size > 0 ? `/api/sandbox?${params.toString()}` : '/api/sandbox';

      try {
        const response = await fetch(url, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to initialize sandbox.');
        }

        const payload = (await response.json()) as SandboxResponse;

        if (canceled) {
          return;
        }

        setSandboxId(payload.sandboxId);
        setIsSandboxLoading(false);

        if (payload.sandboxId !== sandboxIdFromQuery) {
          const updatedParams = new URLSearchParams(searchParamString);
          updatedParams.set('sandboxId', payload.sandboxId);
          router.replace(`?${updatedParams.toString()}`);
        }
      } catch {
        if (canceled) {
          return;
        }

        setSandboxError('Unable to connect to the sandbox.');
        setIsSandboxLoading(false);
      }
    };

    void connectSandbox();

    return () => {
      canceled = true;
    };
  }, [router, sandboxIdFromQuery, searchParamString]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || !sandboxId || isSandboxLoading) {
      return;
    }

    sendMessage(
      { text: input },
      {
        body: {
          sandboxId,
        },
      },
    );

    setInput('');
  };

  const isSendDisabled = status !== 'ready' || isSandboxLoading || !sandboxId;

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 py-12 font-sans dark:bg-black">
      <div className="w-full max-w-2xl flex flex-col gap-4 px-4">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Assistant Agent</h1>

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {isSandboxLoading
            ? 'Preparing sandbox...'
            : sandboxError
              ? sandboxError
              : `Sandbox: ${sandboxId}`}
        </p>

        <div className="flex flex-col gap-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                message.role === 'user'
                  ? 'self-end bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'self-start bg-white text-zinc-800 shadow-sm dark:bg-zinc-900 dark:text-zinc-200'
              }`}
            >
              {message.parts.map((part, i) => {
                switch (part.type) {
                  case 'text':
                    return <span key={i}>{part.text}</span>;
                  case 'tool-weather':
                    if (part.state === 'output-available') {
                      return (
                        <div
                          key={i}
                          className="my-1 rounded-lg bg-blue-50 px-3 py-2 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                        >
                          🌤 {part.output.location}: {part.output.temperature}°F, {part.output.condition}
                        </div>
                      );
                    }
                    if (part.state === 'input-available' || part.state === 'input-streaming') {
                      return (
                        <div key={i} className="my-1 text-zinc-400">
                          Checking weather{part.state === 'input-available' ? ` for ${part.input.location}` : ''}…
                        </div>
                      );
                    }
                    return null;
                  case 'tool-time':
                    if (part.state === 'output-available') {
                      return (
                        <div
                          key={i}
                          className="my-1 rounded-lg bg-green-50 px-3 py-2 text-green-800 dark:bg-green-950 dark:text-green-200"
                        >
                          🕐 {part.output.timezone}: {part.output.currentTime}
                        </div>
                      );
                    }
                    if (part.state === 'input-available' || part.state === 'input-streaming') {
                      return (
                        <div key={i} className="my-1 text-zinc-400">
                          Checking time{part.state === 'input-available' ? ` for ${part.input.timezone}` : ''}…
                        </div>
                      );
                    }
                    return null;
                  case 'tool-bash':
                    if (part.state === 'output-available') {
                      const args = part.output.args.length > 0 ? ` ${part.output.args.join(' ')}` : '';

                      return (
                        <div
                          key={i}
                          className="my-1 rounded-lg bg-zinc-100 px-3 py-2 text-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                        >
                          <div className="font-mono text-xs">$ {part.output.command}{args}</div>
                          <div className="mt-1 text-xs">exit {part.output.exitCode}</div>
                          {part.output.stdout ? (
                            <pre className="mt-2 overflow-x-auto rounded bg-white/60 p-2 text-xs dark:bg-black/40">
                              {part.output.stdout}
                            </pre>
                          ) : null}
                          {part.output.stderr ? (
                            <pre className="mt-2 overflow-x-auto rounded bg-red-100 p-2 text-xs text-red-900 dark:bg-red-950/60 dark:text-red-100">
                              {part.output.stderr}
                            </pre>
                          ) : null}
                        </div>
                      );
                    }

                    if (part.state === 'input-available' || part.state === 'input-streaming') {
                      return (
                        <div key={i} className="my-1 text-zinc-400">
                          Running command
                          {part.state === 'input-available' ? `: ${part.input.command}` : ''}…
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

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isSandboxLoading ? 'Waiting for sandbox...' : 'Ask about weather, time, or run bash commands...'}
            className="flex-1 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="submit"
            disabled={isSendDisabled}
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
