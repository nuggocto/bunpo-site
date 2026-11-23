/* Wires every [data-copy] button. The label resets so it can be used again. */
for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
	const label = btn.textContent;
	let timer = 0;

	btn.addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(btn.dataset.copy ?? "");
			btn.textContent = "copied";
		} catch {
			btn.textContent = "select to copy";
		}
		window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			btn.textContent = label;
		}, 1400);
	});
}
