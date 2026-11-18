/* Actual document frontend -> Vite proxy -> FastAPI. Use the local integration fixture only. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const origin = process.env.FRONTEND_URL || "http://127.0.0.1:5188";
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.qaConnections = { opened: 0, closed: 0 };
      const open = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (...args) {
        const request = open.apply(this, args);
        request.addEventListener("success", () => window.qaConnections.opened++);
        return request;
      };
      const close = IDBDatabase.prototype.close;
      IDBDatabase.prototype.close = function () { window.qaConnections.closed++; return close.call(this); };
    });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin}/chat`);
    const bytes = await fetch("http://127.0.0.1:8999/__test__/pdf").then(response => response.arrayBuffer());
    const uploaded = page.waitForResponse(response => response.url().endsWith("/upload"));
    await page.locator('input[type="file"]').setInputFiles({ name: "policy.pdf", mimeType: "application/pdf", buffer: Buffer.from(bytes) });
    assert.equal((await uploaded).status(), 200);
    const question = page.locator("textarea");
    await page.waitForFunction(() => !document.querySelector("textarea")?.disabled);
    await question.fill("Draft still being composed");
    await question.dispatchEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229, isComposing: true, bubbles: true });
    assert.equal(await question.inputValue(), "Draft still being composed", "IME confirmation must not submit the draft");
    await question.fill("");
    await page.getByText("Answer preferences", { exact: true }).click();
    await page.getByLabel("Include Citation Sources", { exact: true }).uncheck();
    await page.reload();
    await page.getByText("Answer preferences", { exact: true }).click();
    assert.equal(await page.getByLabel("Include Citation Sources", { exact: true }).isChecked(), false, "Citation preference survives reload");
    await page.getByLabel("Include Citation Sources", { exact: true }).check();
    const selected = await page.getByLabel("Model", { exact: true }).inputValue();
    await page.getByLabel("Provider", { exact: true }).selectOption("groq");
    assert.equal(await page.getByLabel("Model", { exact: true }).inputValue(), selected, "Filtering providers must not select another model");
    await page.getByLabel("Provider", { exact: true }).selectOption("all");
    await page.getByText("Answer preferences", { exact: true }).click();
    await page.route("**/ask/stream", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Temporary streaming failure" }) }));
    await question.fill("Keep this failed streaming draft");
    await question.press("Enter");
    await page.getByRole("alert").filter({ hasText: "Temporary streaming failure" }).waitFor();
    await page.waitForFunction(() => document.querySelector("textarea")?.value === "Keep this failed streaming draft");
    await page.unroute("**/ask/stream");
    const stoppedDraft = "Stop this answer during generation";
    await question.fill(stoppedDraft);
    await question.press("Enter");
    await page.getByRole("status").filter({ hasText: "Writing the answer" }).waitFor();
    await page.getByText("The policy notice period", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "The displayed response is incomplete" }).waitFor();
    await page.getByText("The policy notice period", { exact: true }).waitFor();
    await page.waitForFunction(draft => document.querySelector("textarea")?.value === draft, stoppedDraft);
    assert.equal(await page.getByRole("button", { name: "Export Chat", exact: true }).count(), 0);
    await question.fill("What is the notice period?");
    await question.press("Enter");
    await page.getByText(/The policy notice period is 12 days/).first().waitFor({ timeout: 60_000 });
    await page.getByRole("button", { name: "Export Chat", exact: true }).waitFor();
    await page.reload();
    await question.waitFor();
    await page.getByText(/policy.pdf/).first().waitFor();
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    for (const format of ["Text (.txt)", "Markdown (.md)", "PDF (.pdf)"]) {
      await page.getByRole("button", { name: "Export Chat", exact: true }).click();
      const pending = page.waitForEvent("download", { timeout: 60_000 });
      await page.getByRole("button", { name: `Export as ${format}`, exact: true }).click();
      const download = await pending;
      const content = await fs.readFile(await download.path());
      if (format.startsWith("PDF")) assert.equal(content.subarray(0, 4).toString(), "%PDF");
      else assert.ok(content.toString().includes("12 days"));
      if (format.startsWith("Text")) {
        assert.ok(content.toString().startsWith("DocumentRAG conversation\n"));
        assert.ok(!/={3,}|-{10,}/.test(content.toString()));
      }
    }
    const cleared = page.waitForResponse(response => response.url().endsWith("/chat/history") && response.request().method() === "DELETE");
    await page.getByRole("button", { name: "Clear conversation", exact: true }).click();
    assert.equal((await cleared).status(), 200);
    await page.getByText("Answer preferences", { exact: true }).click();
    await page.getByLabel("Stream Token Responses", { exact: true }).uncheck();
    await page.route("**/ask", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Temporary JSON failure" }) }));
    await question.fill("Keep this failed JSON draft");
    await question.press("Enter");
    await page.getByRole("alert").filter({ hasText: "Temporary JSON failure" }).waitFor();
    await page.waitForFunction(() => document.querySelector("textarea")?.value === "Keep this failed JSON draft");
    await page.unroute("**/ask");
    const answered = page.waitForResponse(response => response.url().endsWith("/ask") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    const retryResponse = await answered;
    assert.equal(retryResponse.status(), 200);
    assert.equal(retryResponse.request().postDataJSON().question, "Keep this failed JSON draft");
    await page.waitForFunction(() => {
      const input = document.querySelector("textarea");
      return input && !input.disabled && input.value === "";
    });
    await page.getByText(/The policy notice period is 12 days/).first().waitFor();
    await page.route("**/session", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Temporary reset failure" }) }));
    await page.getByRole("button", { name: "Remove documents and start again", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Could not remove the server documents" }).waitFor();
    assert.ok(await page.getByText("policy.pdf", { exact: true }).count(), "A failed reset must retain the active document state");
    await page.unroute("**/session");
    const deleted = page.waitForResponse(response => response.url().endsWith("/session") && response.request().method() === "DELETE");
    await page.getByRole("button", { name: "Remove documents and start again", exact: true }).click();
    assert.equal((await deleted).status(), 200);
    await page.getByRole("button", { name: "Choose PDFs", exact: true }).waitFor();
    await page.getByRole("button", { name: /Saved conversations/ }).click();
    const archive = page.getByRole("button", { name: /^policy\.pdf \[/ }).first();
    const archiveName = await archive.getAttribute("title");
    await archive.click();
    await page.getByText(/Saved conversation.*Re-upload/).waitFor();
    assert.equal(await question.isDisabled(), true, "Archived transcript must be read-only");
    await page.getByRole("button", { name: `Delete saved conversation ${archiveName}`, exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Export Chat", exact: true }).waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("alert").count(), 0, "Deleting local archive must not call its retired backend session");
    await page.waitForFunction(() => window.qaConnections.opened > 0 && window.qaConnections.opened === window.qaConnections.closed);
    await page.goto(`${origin}/api-status`);
    await page.getByRole("heading", { name: "API status", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log("Document upload, grounded JSON/SSE, matching-corpus restore, TXT/MD/PDF exports, clear/reset and SPA status passed");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
