import React from "react";
import Link from "next/link";
import { EduKitLogo } from "@/components/EduKitLogo";
import { cn } from "@/lib/utils";
import packageJson from "../../package.json";

interface AppFooterProps {
  className?: string;
}

export function AppFooter({ className }: AppFooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className={cn("app-footer mt-auto", className)} data-footer="true">
      <div className="container py-16 sm:py-18">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="nav-logo" aria-label="EduKit, ir al inicio">
            <EduKitLogo />
          </Link>

          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
            <span>v{packageJson.version}</span>
            <span aria-hidden="true">·</span>
            <span>© {year} EduKit</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
