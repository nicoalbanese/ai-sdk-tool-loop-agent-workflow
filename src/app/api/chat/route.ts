import { createUIMessageStreamResponse } from 'ai';
import { start } from 'workflow/api';
import { handleChat } from '@/workflows/chat';

export async function POST(request: Request) {
  const { messages } = await request.json();

  const run = await start(handleChat, [messages]);

  return createUIMessageStreamResponse({
    stream: run.readable,
  });
}
