import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const glassCardShellVariants = cva(
  "relative border bg-white dark:bg-stone-900/90 border-stone-200 dark:border-stone-800 transition-all duration-200",
  {
    variants: {
      variant: {
        default: "shadow-sm",
        hover:
          "shadow-sm hover:shadow-md hover:border-stone-400 dark:hover:border-stone-600 hover:scale-[1.01]",
        glow: "shadow-md border-stone-300 dark:border-stone-700",
        outline: "bg-transparent border-2 border-stone-200 dark:border-stone-800",
      },
      radius: {
        default: "rounded-2xl",
        sm: "rounded-xl",
        lg: "rounded-3xl",
        full: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      radius: "default",
    },
  },
);

const glassCardInnerVariants = cva("h-full min-h-0 w-full overflow-hidden", {
  variants: {
    radius: {
      default: "rounded-2xl",
      sm: "rounded-xl",
      lg: "rounded-3xl",
      full: "rounded-full",
    },
    padding: {
      none: "p-0",
      sm: "p-4",
      default: "p-5 sm:p-6",
      lg: "p-6 sm:p-8",
    },
  },
  defaultVariants: {
    radius: "default",
    padding: "default",
  },
});

export interface GlassCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof glassCardShellVariants>,
    VariantProps<typeof glassCardInnerVariants> {}

const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant, radius, padding, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(glassCardShellVariants({ variant, radius }), className)}
      {...props}
    >
      <div className={glassCardInnerVariants({ radius, padding })}>
        {children}
      </div>
    </div>
  ),
);
GlassCard.displayName = "GlassCard";

const GlassCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 pb-4", className)}
    {...props}
  />
));
GlassCardHeader.displayName = "GlassCardHeader";

const GlassCardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-tight tracking-tight text-stone-900 dark:text-stone-100",
      className,
    )}
    {...props}
  />
));
GlassCardTitle.displayName = "GlassCardTitle";

const GlassCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-stone-500 dark:text-stone-400", className)}
    {...props}
  />
));
GlassCardDescription.displayName = "GlassCardDescription";

const GlassCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-stone-900 dark:text-stone-100", className)} {...props} />
));
GlassCardContent.displayName = "GlassCardContent";

const GlassCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center pt-4 border-t border-stone-200 dark:border-stone-800",
      className,
    )}
    {...props}
  />
));
GlassCardFooter.displayName = "GlassCardFooter";

export {
  GlassCard,
  GlassCardHeader,
  GlassCardTitle,
  GlassCardDescription,
  GlassCardContent,
  GlassCardFooter,
  glassCardShellVariants,
  glassCardInnerVariants,
};
