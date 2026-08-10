/**
 * Input Component
 *
 * A styled input field with glassmorphism design.
 *
 * Features:
 * - Focus ring animation
 * - Error state styling
 * - Optional icon prefix/suffix
 * - Disabled state
 *
 * Usage:
 * <Input placeholder="Enter text..." />
 * <Input error icon={<SearchIcon />} />
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Show error state styling */
  error?: boolean;
  /** Icon to display at the start */
  startIcon?: React.ReactNode;
  /** Icon to display at the end */
  endIcon?: React.ReactNode;
  /** Wrapper className */
  wrapperClassName?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = "text",
      error,
      startIcon,
      endIcon,
      wrapperClassName,
      disabled,
      ...props
    },
    ref,
  ) => {
    // If icons are provided, wrap input with container
    if (startIcon || endIcon) {
      return (
        <div className={cn("relative flex items-center", wrapperClassName)}>
          {startIcon && (
            <span className="absolute left-3 text-stone-500 pointer-events-none">
              {startIcon}
            </span>
          )}
          <input
            type={type}
            className={cn(
              // Base styles
              "flex h-11 w-full rounded-xl border bg-white dark:bg-stone-900 px-4 py-2 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500",
              // Focus styles
              "focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40",
              // Transition
              "transition-all duration-200",
              // Disabled styles
              "disabled:cursor-not-allowed disabled:opacity-50",
              // Error styles
              error
                ? "border-red-500/50 focus:ring-red-500/50 focus:border-red-500/50"
                : "border-stone-200 dark:border-stone-700",
              // Icon padding
              startIcon && "pl-10",
              endIcon && "pr-10",
              className,
            )}
            ref={ref}
            disabled={disabled}
            {...props}
          />
          {endIcon && (
            <span className="absolute right-3 text-stone-500 pointer-events-none">
              {endIcon}
            </span>
          )}
        </div>
      );
    }

    // Simple input without icons
    return (
      <input
        type={type}
        className={cn(
          // Base styles
          "flex h-11 w-full rounded-xl border bg-white dark:bg-stone-900 px-4 py-2 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500",
          // Focus styles
          "focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40",
          // Transition
          "transition-all duration-200",
          // Disabled styles
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Error styles
          error
            ? "border-red-500/50 focus:ring-red-500/50 focus:border-red-500/50"
            : "border-stone-200 dark:border-stone-700",
          className,
        )}
        ref={ref}
        disabled={disabled}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
