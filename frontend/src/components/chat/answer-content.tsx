import * as React from "react";
import { marked, type MarkedToken, type Token, type Tokens } from "marked";
import { Check, FileText } from "lucide-react";
import { parsePageCitation } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import type { SourceDetail } from "@/types";

function safeHref(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

type SourceNumbers = ReadonlyMap<string, number>;
type SourceDetailsMap = ReadonlyMap<string, SourceDetail>;

function citedText(text: string, sourceNumbers?: SourceNumbers, sourceDetails?: SourceDetailsMap): React.ReactNode {
  return text.split(/(\[[^\u005b\u005d\n]*Page\s+\d+\])/gi).map((part, index) => {
    if (!part.startsWith("[") || !part.endsWith("]")) return part;
    const label = part.slice(1, -1);
    const citation = parsePageCitation(label);
    if (!citation) return part;
    const number = citation.document.length > 28 ? sourceNumbers?.get(citation.document) : undefined;
    const detail = sourceDetails?.get(label) || sourceDetails?.get(part) || (citation ? sourceDetails?.get(citation.document) : undefined);
    const pill = (
      <span className="answer-citation inline-flex items-center gap-1 cursor-pointer" title={!detail && number ? label : undefined}>
        <FileText aria-hidden="true" size={12}/>
        {number ? <>
          <span aria-hidden="true">{'Source ' + number + ', p. ' + citation.page}</span>
          <span className="sr-only">{label}</span>
        </> : <span>{label}</span>}
      </span>
    );
    if (!detail) return <React.Fragment key={index}>{pill}</React.Fragment>;
    return (
      <TooltipProvider key={index} delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            {pill}
          </TooltipTrigger>
          <TooltipContent side="top" align="center" className="max-w-xs sm:max-w-sm p-3 bg-stone-900 dark:bg-stone-950 text-stone-100 border border-stone-700/80 shadow-2xl rounded-xl">
            <div className="space-y-1.5 text-left">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-400">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{detail.source_file || label}</span>
                {detail.page && <span className="text-stone-400 text-[11px] font-normal shrink-0">· Page {detail.page}</span>}
              </div>
              {detail.snippet && (
                <p className="text-[11px] leading-relaxed text-stone-200 italic font-sans border-l-2 border-amber-500/50 pl-2 line-clamp-4">
                  "{detail.snippet}"
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  });
}

function AnswerTable({token, sourceNumbers, sourceDetails}: {token: Tokens.Table; sourceNumbers?: SourceNumbers; sourceDetails?: SourceDetailsMap}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = React.useState(false);
  const hintId = React.useId();
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setOverflows(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [token]);
  return <div className="answer-table">
    {overflows && <p id={hintId} className="answer-table-hint">Scroll horizontally to view all columns.</p>}
    <div ref={ref} className="answer-table-scroll" role="region" aria-label="Answer table" aria-describedby={overflows ? hintId : undefined} tabIndex={overflows ? 0 : undefined}>
      <table><thead><tr>{token.header.map((cell, i) => <th key={i} scope="col" style={{textAlign:cell.align || undefined}}>{renderTokens(cell.tokens, sourceNumbers, sourceDetails)}</th>)}</tr></thead>
        <tbody>{token.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} style={{textAlign:cell.align || undefined}}>{renderTokens(cell.tokens, sourceNumbers, sourceDetails)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </div>;
}

function renderTokens(tokens: Token[], sourceNumbers?: SourceNumbers, sourceDetails?: SourceDetailsMap): React.ReactNode[] {
  return tokens.map((generic, index) => {
    const token = generic as MarkedToken;
    const children = "tokens" in token && token.tokens ? renderTokens(token.tokens, sourceNumbers, sourceDetails) : null;
    switch (token.type) {
      case "space": case "def": return null;
      case "heading": return React.createElement(`h${Math.min(token.depth + 1, 6)}`, {key:index}, children);
      case "paragraph": return <p key={index}>{children}</p>;
      case "strong": return <strong key={index}>{children}</strong>;
      case "em": return <em key={index}>{children}</em>;
      case "del": return <del key={index}>{children}</del>;
      case "codespan": return <code key={index}>{token.text}</code>;
      case "code": return <pre key={index} tabIndex={0} aria-label="Code block"><code>{token.text}</code></pre>;
      case "br": return <br key={index}/>;
      case "hr": return <hr key={index}/>;
      case "blockquote": return <blockquote key={index}>{children}</blockquote>;
      case "list": {
        const items = token.items.map((item, itemIndex) => <li key={itemIndex}>
          {item.task && <span className="answer-task" role="img" aria-label={item.checked ? "Completed" : "Not completed"}>{item.checked && <Check size={12} aria-hidden="true"/>}</span>}
          {renderTokens(item.tokens, sourceNumbers, sourceDetails)}
        </li>);
        return token.ordered ? <ol key={index} start={Number(token.start) || 1}>{items}</ol> : <ul key={index}>{items}</ul>;
      }
      case "table": return <AnswerTable key={index} token={token} sourceNumbers={sourceNumbers} sourceDetails={sourceDetails}/>;
      case "link": {
        const href = safeHref(token.href);
        return href ? <a key={index} href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <React.Fragment key={index}>{children}</React.Fragment>;
      }
      case "image": return <span key={index}>{token.text}</span>;
      case "html":
        return /^<br[ \t]*\/?>$/i.test(token.text.trim())
          ? <br key={index}/>
          : <React.Fragment key={index}>{token.text}</React.Fragment>;
      case "escape": return <React.Fragment key={index}>{token.text}</React.Fragment>;
      case "text": return <React.Fragment key={index}>{children || citedText(token.text, sourceNumbers, sourceDetails)}</React.Fragment>;
      default: return <React.Fragment key={index}>{generic.raw}</React.Fragment>;
    }
  });
}

export const FormattedMessageContent = React.memo(function FormattedMessageContent(
  {content, sourceNumbers, sourceDetails}: {content: string; sourceNumbers?: SourceNumbers; sourceDetails?: SourceDetailsMap},
) {
  const tokens = React.useMemo(() => marked.lexer(content, {gfm:true}), [content]);
  if (!content) return null;
  return <div className="answer-content">{renderTokens(tokens, sourceNumbers, sourceDetails)}</div>;
});
