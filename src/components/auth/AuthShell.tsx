"use client";

import React from "react";
import { ArrowLeftRight, CalendarClock, CircleAlert, FileDown, Moon, Sparkles, Sun } from "lucide-react";
import { EduKitLogo } from "@/components/EduKitLogo";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/ThemeContext";

const features = [
  { icon: CalendarClock, text: "Horarios automáticos" },
  { icon: Sparkles, text: "Reglas con asistente IA" },
  { icon: ArrowLeftRight, text: "Reemplazos y cambios" },
  { icon: FileDown, text: "Exportación lista" },
];

/** Tarjeta de acceso (estilo ProfeKit / ECEP): formulario a la izquierda, panel azul a la derecha. */
export function AuthShell({
  title,
  description,
  error,
  children,
}: Readonly<{
  title: string;
  description: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}>) {
  const { toggleTheme } = useTheme();

  return (
    <main className="relative grid min-h-dvh place-items-center bg-[#f2f5fc] p-4 sm:p-8 dark:bg-background">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        aria-label="Cambiar tema"
        className="absolute top-4 right-4 text-muted-foreground"
      >
        <Sun className="hidden h-4 w-4 dark:block" />
        <Moon className="h-4 w-4 dark:hidden" />
      </Button>

      <div className="grid w-full max-w-[980px] overflow-hidden rounded-[22px] border bg-card text-card-foreground shadow-[0_20px_60px_-24px_rgba(14,38,110,.35)] md:min-h-[580px] md:grid-cols-2">
        <section className="grid place-items-center px-6 py-12 sm:px-12">
          <div className="w-full max-w-[350px]">
            <div className="mb-8 flex justify-center">
              <EduKitLogo width={176} height={48} imageClassName="h-11 w-auto" />
            </div>
            <h1 className="text-center text-[1.75rem] font-extrabold tracking-tight">{title}</h1>
            <p className="mt-1 mb-7 text-center text-sm text-muted-foreground">{description}</p>

            {error && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {children}
          </div>
        </section>

        <aside className="relative isolate hidden overflow-hidden bg-gradient-to-b from-[#060f2b] via-[#0f2d82] to-[#1f5bff] p-10 text-white md:grid md:place-items-center">
          <div className="hero-grid absolute inset-0 opacity-55" aria-hidden="true" />
          <div className="relative w-full max-w-[350px]">
            <h2 className="mb-7 text-center text-xl leading-snug font-semibold tracking-tight">
              Arma los horarios de tu colegio en minutos, no en semanas
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              {features.map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  className="flex items-center gap-2.5 rounded-xl border border-white/20 bg-white/10 p-2.5 backdrop-blur-sm"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-white/15 text-blue-100">
                    <Icon size={15} />
                  </span>
                  <span className="text-xs leading-snug font-medium">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

/** Botón principal azul con relieve. */
export const primaryTactileClass =
  "tactile flex w-full items-center justify-center gap-2 bg-[#1f5bff] px-4 py-2.5 text-sm text-white shadow-sm hover:bg-[#1849d9] focus-visible:ring-2 focus-visible:ring-[#1f5bff] focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-70";
