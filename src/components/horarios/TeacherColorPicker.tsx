"use client";

import React from "react";
import { Pipette } from "lucide-react";
import { Label } from "@/components/ui/label";
import { TEACHER_COLOR_FAMILIES } from "@/lib/scheduling/constants";

interface TeacherColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
}

const TINT_LEVELS = [0, 1, 2, 3, 4] as const;

export function TeacherColorPicker({ value, onChange }: TeacherColorPickerProps) {
  const normalizedValue = value.trim().toUpperCase();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Color en grilla</Label>
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 rounded-full border border-[var(--border-card)] shrink-0"
            style={{ backgroundColor: value }}
            aria-hidden="true"
          />
          <span className="font-mono text-[11px] text-[var(--text-secondary)]">
            {normalizedValue}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] p-2.5 space-y-2">
        {/* Matriz 12 familias × 5 intensidades (60 colores) */}
        <div
          className="grid grid-cols-12 gap-1"
          role="radiogroup"
          aria-label="Paleta de 60 colores predefinidos"
        >
          {TINT_LEVELS.map((levelIdx) =>
            TEACHER_COLOR_FAMILIES.map((family) => {
              const hex = family.colors[levelIdx];
              const isSelected = normalizedValue === hex.toUpperCase();
              return (
                <button
                  key={hex}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`${family.name} ${hex}`}
                  title={`${family.name} (${hex})`}
                  onClick={() => onChange(hex)}
                  style={{ backgroundColor: hex }}
                  className={`h-5 w-full rounded-[4px] border transition-transform cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-1)] ${
                    isSelected
                      ? "border-white ring-2 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--bg-surface)] scale-110 z-10"
                      : "border-black/15 hover:scale-110 hover:z-10"
                  }`}
                />
              );
            })
          )}
        </div>

        {/* Selector personalizado nativo */}
        <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[var(--border-subtle)]">
          <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
            <Pipette className="h-3 w-3" />
            Color personalizado
          </span>
          <label className="relative inline-flex items-center gap-2 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] cursor-pointer transition-colors">
            <span
              className="h-3.5 w-3.5 rounded-sm border border-black/20"
              style={{ backgroundColor: value }}
            />
            <span>Selector</span>
            <input
              type="color"
              value={/^#[0-9A-F]{6}$/i.test(value) ? value : "#0353A4"}
              onChange={(e) => onChange(e.target.value.toUpperCase())}
              aria-label="Selector de color personalizado"
              className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
