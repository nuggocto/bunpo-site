/* Wires every [data-tabs] group: click, arrow keys, Home and End. */
for (const root of document.querySelectorAll<HTMLElement>("[data-tabs]")) {
	const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];

	const select = (tab: HTMLButtonElement) => {
		for (const t of tabs) {
			const selected = t === tab;
			t.setAttribute("aria-selected", String(selected));
			t.tabIndex = selected ? 0 : -1;
			const panel = document.getElementById(t.getAttribute("aria-controls") ?? "");
			if (panel) panel.hidden = !selected;
		}
	};

	for (const [i, tab] of tabs.entries()) {
		tab.addEventListener("click", () => select(tab));
		tab.addEventListener("keydown", (e) => {
			const last = tabs.length - 1;
			const target: Record<string, number> = {
				ArrowRight: i === last ? 0 : i + 1,
				ArrowLeft: i === 0 ? last : i - 1,
				Home: 0,
				End: last,
			};
			const next = tabs[target[e.key] ?? -1];
			if (!next) return;
			e.preventDefault();
			select(next);
			next.focus();
		});
	}
}
