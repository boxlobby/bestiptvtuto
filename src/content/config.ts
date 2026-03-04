import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.string(),
    image: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    author: z.string().default('BestIPTVTuto'),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
