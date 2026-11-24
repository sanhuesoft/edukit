"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = "course" | "teacher";
type HighlightRule = "all" | "pie" | "ley20903" | "rooms";

interface CellData {
  subject: string;
  detail: string;
  room: string;
  tone: "blue" | "indigo" | "emerald" | "amber" | "slate" | "teal" | "rose";
  tags?: HighlightRule[];
  isNonTeaching?: boolean;
}

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
const BLOCKS = [
  { id: "B1", time: "08:00 – 09:30" },
  { id: "B2", time: "09:45 – 11:15" },
  { id: "B3", time: "11:30 – 13:00" },
  { id: "B4", time: "14:00 – 15:30" },
];

const COURSE_GRID: Record<string, CellData[]> = {
  B1: [
    { subject: "Matemática", detail: "Prof. C. Morales", room: "Sala 204", tone: "blue", tags: ["pie"] },
    { subject: "Lenguaje", detail: "Prof. V. Soto", room: "Sala 204", tone: "indigo", tags: ["pie"] },
    { subject: "Matemática", detail: "Prof. C. Morales", room: "Sala 204", tone: "blue" },
    { subject: "Física", detail: "Prof. R. Díaz", room: "Lab. Ciencias", tone: "teal", tags: ["rooms"] },
    { subject: "Lenguaje", detail: "Prof. V. Soto", room: "Sala 204", tone: "indigo" },
  ],
  B2: [
    { subject: "Historia", detail: "Prof. M. Paredes", room: "Sala 204", tone: "amber" },
    { subject: "Inglés", detail: "Prof. A. Fuentes", room: "Lab. Idiomas", tone: "emerald", tags: ["rooms"] },
    { subject: "Biología", detail: "Prof. L. Vega", room: "Lab. Ciencias", tone: "teal", tags: ["rooms"] },
    { subject: "Matemática", detail: "Prof. C. Morales", room: "Sala 204", tone: "blue", tags: ["pie"] },
    { subject: "Química", detail: "Prof. L. Vega", room: "Lab. Ciencias", tone: "teal", tags: ["rooms"] },
  ],
  B3: [
    { subject: "Lenguaje", detail: "Prof. V. Soto", room: "Sala 204", tone: "indigo" },
    { subject: "Matemática", detail: "Prof. C. Morales", room: "Sala 204", tone: "blue" },
    { subject: "Inglés", detail: "Prof. A. Fuentes", room: "Sala 204", tone: "emerald" },
    { subject: "Historia", detail: "Prof. M. Paredes", room: "Sala 204", tone: "amber" },
    { subject: "Ed. Ciudadana", detail: "Prof. M. Paredes", room: "Sala 204", tone: "amber" },
  ],
  B4: [
    { subject: "Ed. Física", detail: "Prof. J. Bravo", room: "Gimnasio", tone: "rose", tags: ["rooms"] },
    { subject: "Artes Visuales", detail: "Prof. P. Rojas", room: "Taller Arte", tone: "slate", tags: ["rooms"] },
    { subject: "Tecnología", detail: "Prof. D. Reyes", room: "Sala Comp.", tone: "slate", tags: ["rooms"] },
    { subject: "Orientación", detail: "Prof. C. Morales", room: "Sala 204", tone: "blue" },
    { subject: "Electivo CRA", detail: "Prof. V. Soto", room: "Biblio. CRA", tone: "indigo", tags: ["rooms"] },
  ],
};

const TEACHER_GRID: Record<string, CellData[]> = {
  B1: [
    { subject: "2° Medio A", detail: "Matemática · PIE", room: "Sala 204", tone: "blue", tags: ["pie"] },
    { subject: "1° Medio B", detail: "Matemática", room: "Sala 108", tone: "blue" },
    { subject: "2° Medio A", detail: "Matemática", room: "Sala 204", tone: "blue" },
    { subject: "3° Medio A", detail: "Electivo M2", room: "Sala 301", tone: "indigo" },
    { subject: "Horas no lectivas", detail: "Planificación · Ley 20.903", room: "Sala Prof.", tone: "emerald", tags: ["ley20903"], isNonTeaching: true },
  ],
  B2: [
    { subject: "1° Medio A", detail: "Matemática", room: "Sala 107", tone: "blue" },
    { subject: "Horas no lectivas", detail: "Depto. Matemática", room: "Sala UTP", tone: "emerald", tags: ["ley20903"], isNonTeaching: true },
    { subject: "3° Medio A", detail: "Matemática", room: "Sala 301", tone: "indigo" },
    { subject: "2° Medio A", detail: "Matemática · PIE", room: "Sala 204", tone: "blue", tags: ["pie"] },
    { subject: "1° Medio B", detail: "Matemática", room: "Sala 108", tone: "blue" },
  ],
  B3: [
    { subject: "Horas no lectivas", detail: "Atención apoderados", room: "Sala Entrev.", tone: "emerald", tags: ["ley20903"], isNonTeaching: true },
    { subject: "2° Medio A", detail: "Matemática", room: "Sala 204", tone: "blue" },
    { subject: "1° Medio A", detail: "Matemática · PIE", room: "Sala 107", tone: "blue", tags: ["pie"] },
    { subject: "Horas no lectivas", detail: "Evaluación · Ley 20.903", room: "Sala Prof.", tone: "emerald", tags: ["ley20903"], isNonTeaching: true },
    { subject: "2° Medio B", detail: "Matemática", room: "Sala 205", tone: "blue" },
  ],
  B4: [
    { subject: "2° Medio B", detail: "Matemática", room: "Sala 205", tone: "blue" },
    { subject: "3° Medio A", detail: "Electivo M2", room: "Sala 301", tone: "indigo" },
    { subject: "Horas no lectivas", detail: "Consejo de Profesores", room: "Auditorio", tone: "emerald", tags: ["ley20903", "rooms"], isNonTeaching: true },
    { subject: "2° Medio A", detail: "Orientación", room: "Sala 204", tone: "amber" },
    { subject: "Bloque liberado", detail: "Sin ventanas muertas", room: "Salida 13:00", tone: "slate", tags: ["ley20903"], isNonTeaching: true },
  ],
};

const TONE_CLASSES: Record<CellData["tone"], string> = {
  blue: "bg-blue-50/90 border-blue-200/80 text-blue-950 dark:bg-blue-950/45 dark:border-blue-800/60 dark:text-blue-100",
  indigo: "bg-indigo-50/90 border-indigo-200/80 text-indigo-950 dark:bg-indigo-950/45 dark:border-indigo-800/60 dark:text-indigo-100",
  emerald: "bg-emerald-50/90 border-emerald-200/80 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-100",
  amber: "bg-amber-50/90 border-amber-200/80 text-amber-950 dark:bg-amber-950/40 dark:border-amber-800/60 dark:text-amber-100",
  teal: "bg-teal-50/90 border-teal-200/80 text-teal-950 dark:bg-teal-950/40 dark:border-teal-800/60 dark:text-teal-100",
  rose: "bg-rose-50/90 border-rose-200/80 text-rose-950 dark:bg-rose-950/40 dark:border-rose-800/60 dark:text-rose-100",
  slate: "bg-zinc-100/90 border-zinc-200/80 text-zinc-900 dark:bg-zinc-900/70 dark:border-zinc-700/70 dark:text-zinc-100",
};

const RULE_FILTERS: { id: HighlightRule; label: string; viewHint?: ViewMode }[] = [
  { id: "all", label: "Vista completa" },
  { id: "rooms", label: "Salas especiales sin choque", viewHint: "course" },
  { id: "pie", label: "Co-docencia PIE" },
  { id: "ley20903", label: "Ley 20.903 (65/35)", viewHint: "teacher" },
];

export function TimetableShowcase() {
  const [viewMode, setViewMode] = useState<ViewMode>("course");
  const [activeRule, setActiveRule] = useState<HighlightRule>("all");

  const grid = viewMode === "course" ? COURSE_GRID : TEACHER_GRID;

  const handleRuleClick = (rule: (typeof RULE_FILTERS)[number]) => {
    setActiveRule(rule.id);
    if (rule.viewHint && rule.id !== "all") {
      setViewMode(rule.viewHint);
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-5xl">
      {/* Subtle architectural glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-6 -top-6 -bottom-4 rounded-[28px] bg-gradient-to-b from-blue-600/12 via-blue-500/5 to-transparent blur-2xl dark:from-blue-500/15 dark:via-indigo-500/8"
      />

      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl shadow-slate-950/10 dark:shadow-black/40">
        {/* Top app bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                0 conflictos detectados
              </span>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {viewMode === "course"
                  ? "Curso: 2° Medio A · 38 hrs"
                  : "Docente: Prof. C. Morales · 44 hrs (0 ventanas)"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div
              role="tablist"
              aria-label="Cambiar vista del horario"
              className="inline-flex rounded-lg border border-border bg-background p-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "course"}
                onClick={() => setViewMode("course")}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  viewMode === "course"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <GraduationCap className="h-3.5 w-3.5" />
                Por curso
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "teacher"}
                onClick={() => setViewMode("teacher")}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  viewMode === "teacher"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Users className="h-3.5 w-3.5" />
                Por docente
              </button>
            </div>

            <div className="hidden items-center gap-1.5 md:flex">
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">
                <FileText className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                PDF
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">
                <FileSpreadsheet className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                Excel
              </span>
            </div>
          </div>
        </div>

        {/* Interactive rule filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-background/80 px-4 py-2.5 sm:px-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Reglas activas:
            </span>
            {RULE_FILTERS.map((rule) => {
              const selected = activeRule === rule.id;
              return (
                <button
                  key={rule.id}
                  type="button"
                  onClick={() => handleRuleClick(rule)}
                  className={cn(
                    "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                    selected
                      ? "border-primary bg-primary/10 text-primary dark:bg-primary/20"
                      : "border-border bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
                  )}
                >
                  {rule.label}
                </button>
              );
            })}
          </div>
          <span className="hidden items-center gap-1 text-[11px] font-medium text-muted-foreground lg:inline-flex">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Simulación interactiva · Haz clic para inspeccionar
          </span>
        </div>

        {/* Timetable Grid */}
        <div className="overflow-x-auto p-3 sm:p-4">
          <div className="min-w-[640px]">
            <div className="mb-2 grid grid-cols-[96px_repeat(5,minmax(0,1fr))] gap-2 text-center">
              <div className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Bloque
              </div>
              {DAYS.map((day) => (
                <div
                  key={day}
                  className="rounded-md bg-muted/60 py-1.5 text-xs font-semibold text-foreground"
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {BLOCKS.map((block) => (
                <div
                  key={block.id}
                  className="grid grid-cols-[96px_repeat(5,minmax(0,1fr))] items-stretch gap-2"
                >
                  <div className="flex flex-col justify-center rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2">
                    <span className="text-xs font-bold text-foreground">
                      {block.id}
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {block.time}
                    </span>
                  </div>

                  {grid[block.id].map((cell, idx) => {
                    const isHighlighted =
                      activeRule === "all" || cell.tags?.includes(activeRule);
                    return (
                      <div
                        key={`${block.id}-${idx}`}
                        className={cn(
                          "flex flex-col justify-between rounded-lg border p-2.5 transition-all duration-200",
                          TONE_CLASSES[cell.tone],
                          cell.isNonTeaching && "border-dashed",
                          isHighlighted
                            ? "opacity-100 ring-1 ring-transparent"
                            : "opacity-30 saturate-50",
                          activeRule !== "all" &&
                            isHighlighted &&
                            "ring-2 ring-primary/50 shadow-sm"
                        )}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-xs font-semibold leading-tight">
                            {cell.subject}
                          </span>
                        </div>
                        <div className="mt-1.5 space-y-0.5">
                          <p className="truncate text-[11px] opacity-80">
                            {cell.detail}
                          </p>
                          <p className="truncate text-[10px] font-medium opacity-70">
                            {cell.room}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom status bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              <strong className="font-semibold text-foreground">100%</strong>{" "}
              bloques asignados
            </span>
            <span>
              <strong className="font-semibold text-foreground">0</strong>{" "}
              choques de sala o docente
            </span>
            <span>
              <strong className="font-semibold text-foreground">Ley 20.903</strong>{" "}
              respetada
            </span>
          </div>
          <span className="text-[11px] font-medium text-primary">
            Ajustable manualmente con validación instantánea
          </span>
        </div>
      </div>
    </div>
  );
}
