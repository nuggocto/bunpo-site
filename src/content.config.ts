import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const guides = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/guides" }),
	schema: z.object({
		title: z.string(),
		order: z.number(),
		reportFormat: z.string(),
		selection: z.string(),
		summary: z.string(),
	}),
});

export const collections = { guides };
