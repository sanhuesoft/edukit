import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-[#0353a4]/30 bg-[#0353a4]/10 text-[#0353a4] dark:border-[#87c2fd]/30 dark:bg-[#0353a4]/25 dark:text-[#87c2fd]",
        secondary:
          "border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-secondary)]",
        outline:
          "border-[var(--border-card)] text-[var(--text-primary)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
