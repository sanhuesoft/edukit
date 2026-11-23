import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[14px] text-sm font-semibold transition-all duration-200 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-[#0353a4] to-[#1d74d8] text-white shadow-[0_4px_20px_rgba(3,83,164,0.35)] hover:brightness-110 hover:-translate-y-[1px] hover:shadow-[0_6px_28px_rgba(3,83,164,0.5)] active:translate-y-0",
        neon:
          "bg-gradient-to-br from-[#0353a4] to-[#1d74d8] text-white shadow-[0_4px_20px_rgba(3,83,164,0.35)] hover:brightness-110 hover:-translate-y-[1px] hover:shadow-[0_6px_28px_rgba(3,83,164,0.5)] active:translate-y-0",
        neonOutline:
          "border border-[#0353a4]/40 bg-[#0353a4]/10 text-[#0353a4] shadow-[0_0_16px_rgba(3,83,164,0.12)] hover:bg-[#0353a4]/20 hover:border-[#3b9eff]/70 hover:text-[#023e7d] dark:border-[#87c2fd]/35 dark:bg-[#0353a4]/25 dark:text-[#87c2fd] dark:hover:bg-[#0353a4]/40 dark:hover:text-white",
        secondary:
          "bg-[var(--bg-card)] border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] hover:border-[#0353a4]/50 dark:hover:border-[#87c2fd]/50",
        ghost:
          "bg-transparent text-[var(--text-secondary)] hover:bg-[#0353a4]/10 hover:text-[#0353a4] dark:hover:bg-[#87c2fd]/10 dark:hover:text-[#87c2fd]",
        destructive:
          "bg-red-500/10 border border-red-500/35 text-red-700 hover:bg-red-500/20 hover:border-red-400/60 dark:bg-red-500/15 dark:text-red-300",
        link:
          "text-[#0353a4] underline-offset-4 hover:underline hover:text-[#023e7d] dark:text-[#87c2fd] dark:hover:text-white p-0 h-auto",
      },
      size: {
        default: "h-11 px-5 py-2.5 text-sm",
        sm: "h-9 rounded-[10px] px-3.5 py-1.5 text-[13px]",
        xs: "h-7 rounded-[8px] px-2.5 py-1 text-xs",
        lg: "h-12 rounded-[16px] px-7 py-3 text-base",
        icon: "h-9 w-9 rounded-[10px] p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
