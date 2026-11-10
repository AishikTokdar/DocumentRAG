import * as React from "react";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  recoveryDraft?: { text: string; requestId: number } | null;
}

export function ChatInput({
  onSend,
  recoveryDraft,
  disabled = false,
  isLoading = false,
  placeholder = "Ask a question about the document...",
}: ChatInputProps) {
  const inputId = React.useId();
  const [message, setMessage] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (recoveryDraft) setMessage(current => current || recoveryDraft.text);
  }, [recoveryDraft]);
  React.useEffect(() => {
    if (isLoading) setMessage("");
  }, [isLoading]);

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || disabled || isLoading) return;

    onSend(trimmedMessage);
    setMessage("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = message.trim().length > 0 && !disabled && !isLoading;

  return (
    <div className="relative w-full min-w-0"><label htmlFor={inputId} className="mb-2 block text-xs font-medium text-stone-600 dark:text-stone-300">Your question</label>
      <div
        className={cn(
          "relative flex w-full min-w-0 items-end gap-2.5 p-2 sm:p-2.5 rounded-2xl border transition-colors",
          "bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 shadow-warm-sm",
          "focus-within:border-amber-400 dark:focus-within:border-amber-600",
        )}
      >
        <Textarea
          id={inputId}
          aria-describedby={`${inputId}-hint`}
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Upload a document first..." : placeholder}
          disabled={disabled || isLoading}
          autoResize
          wrapperClassName="min-w-0 flex-1 self-stretch"
          className={cn(
            "w-full min-h-[40px] max-h-[160px] resize-none px-2 py-1.5 text-sm sm:text-base",
            "bg-transparent border-transparent ring-0 shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500",
            "focus:border-transparent focus:ring-0 focus:shadow-none",
            "text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500",
          )}
          rows={1}
        />

        <Button
          aria-label="Send question"
          onClick={handleSend}
          disabled={!canSend}
          size="icon"
          className={cn(
            "shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl transition-all",
            canSend
              ? "bg-amber-600 dark:bg-amber-500 text-white hover:bg-amber-700 dark:hover:bg-amber-600 shadow-sm"
              : "bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 border border-stone-200 dark:border-stone-700",
          )}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>

      <p id={`${inputId}-hint`} className="mt-2 text-xs text-stone-500 dark:text-stone-400">Enter to send. Shift + Enter for a new line.</p>
    </div>
  );
}
