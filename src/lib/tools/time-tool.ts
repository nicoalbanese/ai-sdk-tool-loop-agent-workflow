import { tool } from 'ai';
import { z } from 'zod';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const timeTool = tool({
  description: 'Get the current time in a given timezone',
  inputSchema: z.object({
    timezone: z
      .string()
      .describe('IANA timezone, e.g. "America/New_York"'),
  }),
  execute: async ({ timezone }) => {
    await delay(1000);

    const now = new Date();
    const formatted = now.toLocaleString('en-US', { timeZone: timezone });

    return { timezone, currentTime: formatted };
  },
});
