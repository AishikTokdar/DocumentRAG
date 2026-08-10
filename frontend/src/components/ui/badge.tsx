import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border",
  {
    variants: {
      variant: {
        default:
          "bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border-stone-200 dark:border-stone-700",
        secondary:
          "bg-stone-100/60 dark:bg-stone-800/60 text-stone-600 dark:text-stone-400 border-stone-200/80 dark:border-stone-800",
        success:
          "bg-lime-50 dark:bg-lime-950/40 text-lime-700 dark:text-lime-300 border-lime-200 dark:border-lime-800/60",
        warning:
          "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60",
        destructive:
          "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60",
        outline:
          "bg-transparent text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700",
        info:
          "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60",
        accent:
          "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-2 py-0.5 text-[10px]",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  icon?: React.ReactNode;
  pulse?: boolean;
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, size, icon, pulse, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          badgeVariants({ variant, size }),
          pulse && "animate-pulse",
          className,
        )}
        {...props}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        {children}
      </div>
    );
  },
);

Badge.displayName = "Badge";

export { Badge, badgeVariants };
