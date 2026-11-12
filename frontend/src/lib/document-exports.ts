export function documentToPlainText(markdown: string): string {
  let inCode = false;
  let fence = "";
  return markdown.replace(/\r\n/g, "\n").split("\n").flatMap(line => {
    const marker = line.trim().match(/^(`{3,}|~{3,})/);
    if (marker && (!inCode || marker[1][0] === fence)) {
      inCode = !inCode;
      fence = marker[1][0];
      return [];
    }
    if (inCode) return [line];
    if (/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(line) || /^\s*(?:---+|\*\*\*+)\s*$/.test(line)) return [];
    let text = line.trim().startsWith("|")
      ? line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, "|")).join("    ")
      : line.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*>\s?/, "").replace(/^\s*[-*•]\s+/, "  ");
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "$1")
      .replace(/`([^`]+)`/g, "$1");
    return [text];
  }).join("\n").trim();
}

export function groupExportHeadings(container: HTMLElement): void {
  for (const heading of container.querySelectorAll("h1, h2, h3, h4, h5, h6, p:has(> strong:only-child)")) {
    if (heading.matches("p")) {
      const label = heading.firstElementChild?.textContent?.trim();
      if (!label || label.length > 80 || label !== heading.textContent?.trim()) continue;
      if (heading.parentElement?.style.breakInside === "avoid") continue;
    }
    let next = heading.nextElementSibling;
    const spacers: Element[] = [];
    while (next?.matches("div") && !next.textContent?.trim() && next.children.length === 0) {
      spacers.push(next);
      next = next.nextElementSibling;
    }
    if (!next?.matches("p")) continue;
    const group = document.createElement("div");
    group.style.breakInside = "avoid";
    group.style.pageBreakInside = "avoid";
    heading.before(group);
    group.append(heading, ...spacers, next);
  }
}
