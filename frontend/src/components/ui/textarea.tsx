/**
 * Textarea Component
 *
 * A styled multi-line text input with glassmorphism design.
 *
 * Features:
 * - Auto-resize option
 * - Focus ring animation
 * - Error state styling
 * - Character count option
 *
 * Usage:
 * <Textarea placeholder="Enter message..." rows={4} />
 * <Textarea autoResize maxLength={500} showCount />
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  autoResize?: boolean;
  showCount?: boolean;
  wrapperClassName?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      error,
      autoResize,
      showCount,
      maxLength,
      wrapperClassName,
      disabled,
      onChange,
      value,
      ...props
    },
    ref,
  ) => {
    const [charCount, setCharCount] = React.useState(0);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    React.useImperativeHandle(ref, () => textareaRef.current!);

    React.useEffect(() => {
      if (autoResize && textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    }, [value, autoResize]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (showCount) {
        setCharCount(e.target.value.length);
      }
      onChange?.(e);
    };

    React.useEffect(() => {
      if (showCount && typeof value === "string") {
        setCharCount(value.length);
      }
    }, [value, showCount]);

    return (
      <div className={cn("relative min-w-0", wrapperClassName)}>
        <textarea
          ref={textareaRef}
          className={cn(
            "block min-h-[100px] w-full max-w-full rounded-xl border bg-white dark:bg-stone-900 px-4 py-3 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500",
            "focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40",
            "transition-all duration-200",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error
              ? "border-red-500/50 focus:ring-red-500/50 focus:border-red-500/50"
              : "border-stone-200 dark:border-stone-700",
            autoResize ? "resize-none overflow-hidden" : "resize-y",
            showCount && "pb-8",
            className,
          )}
          disabled={disabled}
          onChange={handleChange}
          value={value}
          maxLength={maxLength}
          {...props}
        />
        {showCount && (
          <div
            className={cn(
              "absolute bottom-2 right-3 text-xs",
              maxLength && charCount >= maxLength
                ? "text-red-400"
                : "text-stone-400 dark:text-stone-500",
            )}
          >
            {charCount}
            {maxLength && ` / ${maxLength}`}
          </div>
        )}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";

export { Textarea };
