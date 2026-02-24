import { getWritable } from 'workflow';
import { convertToModelMessages } from 'ai';
import { assistantAgent } from '@/lib/agents/assistant-agent';
import type { UIMessage, UIMessageChunk } from 'ai';

export async function handleChat(messages: UIMessage[]) {
  'use workflow';

  const writable = getWritable<UIMessageChunk>();
  await streamAgent(messages, writable);
  await closeStream(writable);
}

async function streamAgent(
  messages: UIMessage[],
  writable: WritableStream<UIMessageChunk>
) {
  'use step';

  const modelMessages = await convertToModelMessages(messages);
  const result = assistantAgent.stream({
    messages: modelMessages,
  });

  const stream = (await result).toUIMessageStream();
  const reader = stream.getReader();
  const writer = writable.getWriter();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writer.write(value);
    }
  } finally {
    reader.releaseLock();
    writer.releaseLock();
  }
}

async function closeStream(writable: WritableStream<UIMessageChunk>) {
  'use step';

  await writable.close();
}
