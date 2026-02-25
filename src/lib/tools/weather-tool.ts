import { tool } from 'ai';
import { z } from 'zod';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const weatherTool = tool({
  description: 'Get the current weather for a given location',
  inputSchema: z.object({
    location: z.string().describe('City name, e.g. "San Francisco"'),
  }),
  execute: async ({ location }) => {
    await delay(1000);

    // Fake weather data
    const conditions = ['sunny', 'cloudy', 'rainy', 'windy', 'snowy'] as const;
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    const temperature = Math.floor(Math.random() * 40) + 40; // 40-80°F

    return { location, temperature, condition };
  },
});
