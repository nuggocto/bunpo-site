import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://bunpo.org",
	output: "static",
	markdown: {
		shikiConfig: {
			theme: "github-light",
		},
	},
});
