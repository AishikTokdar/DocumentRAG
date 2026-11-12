import { renderToStaticMarkup } from "react-dom/server";
import { FormattedMessageContent } from "@/components/chat/chat-message";

export async function renderDocumentHtml(text: string): Promise<string> {
  return renderToStaticMarkup(<FormattedMessageContent content={text}/>);
}
