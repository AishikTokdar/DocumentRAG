import assert from "node:assert/strict";
import {build} from "esbuild";
import {createRequire} from "node:module";
import test from "node:test";
const require=createRequire(import.meta.url);
async function load(entry) {
 const result=await build({entryPoints:[entry],bundle:true,write:false,platform:"node",format:"cjs",jsx:"automatic",define:{"import.meta.env":JSON.stringify({DEV:false})},alias:{"@":"./src"}});
 const module={exports:{}};
 new Function("require","module","exports",result.outputFiles[0].text)(require,module,module.exports);
 return module.exports;
}
const {renderDocumentHtml}=await load("src/lib/document-rendering.tsx");
const {documentToPlainText}=await load("src/lib/document-exports.ts");
test("TXT export preserves headings, table cells and source URLs without Markdown decoration",()=>{
 const text=documentToPlainText("## Policy summary\n\n**Notice** is `12 days`.\n\n| Clause | Value |\n|---|---|\n| Notice | 12 days |\n\n[Source](https://example.org/policy_name)");
 for(const expected of ["Policy summary","Notice is 12 days.","Clause    Value","Notice    12 days","Source (https://example.org/policy_name)"]) assert.ok(text.includes(expected),expected);
 assert.ok(!/##|\*\*|`|\|---/.test(text));
});
test("TXT export leaves fenced document code intact",()=>{
 assert.equal(documentToPlainText("```python\n# keep this comment\nvalue = a | b\n```"),"# keep this comment\nvalue = a | b");
});
const {readServerEvents}=await load("src/lib/sse.ts");
test("export renders hostile document text as escaped content",async()=>{
 const html=await renderDocumentHtml('<img src="https://attacker.invalid/x" onerror="alert(1)"><script>alert(2)</script>');
 assert.ok(!html.includes("<img")); assert.ok(!html.includes("<script")); assert.ok(html.includes("&lt;"));
});
test("table line breaks render while HTML with attributes stays escaped", async () => {
 const html = await renderDocumentHtml('| Name | Value |\n|---|---|\n| Policy | A<br />B<br onclick="alert(1)">C |');
 assert.ok(html.includes("A<br/>B"));
 assert.ok(html.includes("&lt;br onclick="));
 assert.ok(!html.includes('<br onclick='));
});
test("answers preserve numbered lists across blank lines and nested structure",async()=>{
 const html=await renderDocumentHtml('3. **Notice**: 12 days.\n\n4. **Fee**: 45 USD.\n   - First detail\n   - Second detail\n\n5. Final item.');
 assert.equal((html.match(/<ol\b/g)||[]).length,1);
 assert.ok(html.includes('start="3"'));
 assert.equal((html.match(/<li\b/g)||[]).length,5);
 assert.ok(html.includes('<ul>'));
 assert.ok(html.includes('<strong>Notice</strong>'));
});
test("answer tables, quotes and code render semantically without losing content",async()=>{
 const html=await renderDocumentHtml('## Comparison\n\n| Policy | Notice |\n|---|---|\n| Alpha | 12 days [policy-alpha.pdf - Page 1] |\n\n> Read the notice.\n\n```js\nconst x = "<tag>";\n  keepIndent();\n```');
 for(const expected of ['<h3>Comparison</h3>','<table>','scope="col"','<td>Alpha</td>','answer-citation','<blockquote>','<pre','  keepIndent();','&lt;tag&gt;'])assert.ok(html.includes(expected),expected);
 assert.ok(!html.includes('|---|'));
});
test("answer links cannot execute scripts or load remote document images",async()=>{
 const html=await renderDocumentHtml('[Unsafe](javascript:alert%281%29) ![Preview](https://attacker.invalid/track.png) [Safe](https://example.org/policy)\n\n<iframe src="https://attacker.invalid"></iframe>');
 assert.ok(!html.includes('href="javascript:'));
 assert.ok(!html.includes('<img'));
 assert.ok(!html.includes('<iframe'));
 assert.ok(html.includes('href="https://example.org/policy"'));
 assert.ok(html.includes('rel="noopener noreferrer"'));
 assert.ok(html.includes('Unsafe'));
});
test("unfinished streaming Markdown preserves the latest received text",async()=>{
 for(const partial of ['1. **Review in progress', '| Policy | Notice |\n|---|---|\n| Alpha | 12 days', '```text\nLast received fragment', 'Evidence [policy-alpha.pdf - Page 1']) {
  const html=await renderDocumentHtml(partial);
  assert.ok(html.includes(partial.includes('fragment') ? 'Last received fragment' : partial.includes('12 days') ? '12 days' : partial.includes('Evidence') ? 'Evidence' : 'Review in progress'));
 }
});
test("SSE retains event names across byte boundaries and UTF-8",async()=>{
 const bytes=new TextEncoder().encode('event: token\r\ndata: {"content":"Résumé"}\r\n\r\nevent: done\ndata: {"answer":"Final"}\n\n');
 const stream=new ReadableStream({start(c){for(const byte of bytes)c.enqueue(new Uint8Array([byte]));c.close();}});
 const events=[];for await(const event of readServerEvents(stream))events.push(event);
 assert.equal(events.length,2);assert.equal(events[0].data.content,"Résumé");assert.equal(events[1].event,"done");
});
test("large final SSE answers retain every character across network chunks",async()=>{
 const answer="Cited passage — résumé. ".repeat(5000)+"FINAL ANSWER TAIL";
 const bytes=new TextEncoder().encode(`event: token\ndata: ${JSON.stringify({content:"Preview"})}\n\nevent: done\ndata: ${JSON.stringify({answer})}\n\n`);
 const stream=new ReadableStream({start(controller){for(let offset=0;offset<bytes.length;offset+=313)controller.enqueue(bytes.slice(offset,offset+313));controller.close();}});
 const events=[];for await(const event of readServerEvents(stream))events.push(event);
 assert.equal(events.at(-1).event,"done");assert.equal(events.at(-1).data.answer,answer);
});

const {createHistoryTransition}=await load("src/lib/history-transition.ts");
test("clear invalidates a pending history restore",async()=>{
 const transition=createHistoryTransition();
 let resolve; const pending=new Promise(r=>{resolve=r;}); const applied=[];
 const restore=transition.restore(transition.begin(),()=>pending,value=>applied.push(value));
 transition.begin(); resolve(["old saved answer"]); await restore;
 assert.deepEqual(applied,[]);
});
test("document change discards stale loads while current restore succeeds",async()=>{
 const transition=createHistoryTransition();let resolve;const pending=new Promise(r=>{resolve=r;});const applied=[];
 const old=transition.restore(transition.begin(),()=>pending,v=>applied.push(v));
 await transition.restore(transition.begin(),async()=>["new documents"],v=>applied.push(v));
 resolve(["old documents"]);await old;
 assert.deepEqual(applied,[["new documents"]]);
});

const {errorDetail,requestSignal}=await load("src/lib/request-errors.ts");
test("API validation arrays and unexpected details render as bounded text",()=>{
 assert.equal(errorDetail([{msg:"Invalid session"},{msg:"File required"}],"Failed"),"Invalid session; File required");
 assert.equal(errorDetail({secret:"hidden"},"Failed"),"Failed");
 assert.equal(errorDetail("x".repeat(1000),"Failed").length,500);
});
test("request cancellation propagates through the timeout signal",()=>{
 const controller=new AbortController();const signal=requestSignal(controller.signal);
 controller.abort();assert.equal(signal.aborted,true);
});
const {api}=await load("src/lib/api.ts");
test("JSON API retains abort semantics and safely normalizes validation errors",async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async()=>new Response(JSON.stringify({detail:[{msg:"Invalid question"}]}),{status:422,headers:{"content-type":"application/json"}});
  await assert.rejects(api.askQuestion("Question"),error=>error.detail==="Invalid question");
  globalThis.fetch=async(_url,options)=>{options.signal.throwIfAborted();throw new Error("should be aborted");};
  const controller=new AbortController();controller.abort();
  await assert.rejects(api.askQuestion("Question",undefined,true,false,controller.signal),{name:"AbortError"});
 } finally {globalThis.fetch=original;}
});
