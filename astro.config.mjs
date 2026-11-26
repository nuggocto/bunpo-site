import { defineConfig } from "astro/config";

/**
 * Wraps Markdown tables in a keyboard-focusable horizontal scroll container
 * and prevents short single-token inline code (like flags) from breaking across lines.
 */
function rehypeWrapTables() {
	const textOf = (node) => {
		if (!node) return "";
		if (node.type === "text") return node.value || "";
		if (Array.isArray(node.children)) return node.children.map(textOf).join("");
		return "";
	};
	return function transform(tree) {
		const walk = (node, inPre) => {
			if (!node || !Array.isArray(node.children)) return;
			for (let i = 0; i < node.children.length; i++) {
				const child = node.children[i];
				if (child?.type !== "element") continue;
				if (child.tagName === "table") {
					walk(child, inPre);
					node.children[i] = {
						type: "element",
						tagName: "div",
						properties: {
							className: ["table-wrap"],
							tabIndex: 0,
							role: "region",
							"aria-label": "Scrollable table",
						},
						children: [child],
					};
					continue;
				}
				if (child.tagName === "code" && !inPre) {
					const text = textOf(child).trim();
					if (text.length > 0 && text.length <= 18 && !/\s/.test(text)) {
						child.properties = child.properties || {};
						const prev = Array.isArray(child.properties.className)
							? child.properties.className
							: [];
						child.properties.className = [...prev, "nowrap"];
					}
				}
				walk(child, inPre || child.tagName === "pre");
			}
		};
		walk(tree, false);
	};
}

export default defineConfig({
	site: "https://bunpo.org",
	output: "static",
	markdown: {
		rehypePlugins: [rehypeWrapTables],
		shikiConfig: {
			theme: "github-light",
		},
	},
});
