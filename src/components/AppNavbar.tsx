"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { EduKitLogo } from "@/components/EduKitLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface NavbarUser {
  firstName: string;
  lastName: string;
  email: string;
  role: "SUPER_ADMIN" | "SCHOOL_ADMIN";
  schoolName?: string | null;
}

interface AppNavbarProps {
  currentSection?: string;
  sectionIcon?: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
  user?: NavbarUser | null;
}

export function AppNavbar({
  currentSection,
  sectionIcon,
  fullWidth = false,
  className,
  user,
}: AppNavbarProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <nav className={cn("nav app-navbar", className)} data-navbar="true">
      <div className={fullWidth ? "w-full px-4 sm:px-6 xl:px-10" : "container"}>
        <div className="nav-inner justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <Link
              href="/"
              className="nav-logo shrink-0 group"
              aria-label="EduKit, ir al inicio"
            >
              <EduKitLogo
                compact
                className="md:hidden transition-transform duration-200 group-hover:scale-[1.05]"
              />
              <EduKitLogo className="hidden md:inline-flex transition-transform duration-200 group-hover:scale-[1.03]" />
            </Link>

            {currentSection && (
              <div className="hidden min-w-0 items-center gap-1.5 sm:gap-2 md:flex">
                <span className="nav-breadcrumb-sep shrink-0">/</span>
                <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--text-primary)] sm:text-base">
                  {sectionIcon && (
                    <span className="flex shrink-0 items-center text-[var(--accent-1)]" aria-hidden="true">
                      {sectionIcon}
                    </span>
                  )}
                  <span className="truncate">{currentSection}</span>
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <>
                <div className="hidden sm:flex items-center gap-2 pr-1">
                  <Badge variant="default" className="gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    {user.role === "SUPER_ADMIN" ? "Super Admin" : "Admin Colegio"}
                  </Badge>
                  <span className="text-xs font-medium text-[var(--text-secondary)] max-w-[160px] truncate">
                    {user.firstName} {user.lastName}
                  </span>
                </div>
                {!currentSection && (
                  <Button variant="neonOutline" size="sm" asChild>
                    <Link href="/horarios">
                      <CalendarDays className="h-4 w-4" />
                      Horarios
                    </Link>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  title="Cerrar sesión"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Salir</span>
                </Button>
              </>
            ) : (
              <Button variant="neonOutline" size="sm" asChild>
                <Link href="/login">
                  <LogIn className="h-4 w-4" />
                  Ingresar
                </Link>
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}
