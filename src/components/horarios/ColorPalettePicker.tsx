"use client";

import React from "react";
import { Pipette } from "lucide-react";
import { Label } from "@/components/ui/label";
import { TEACHER_COLOR_FAMILIES } from "@/lib/scheduling/constants";

interface ColorPalettePickerProps {
  label?: string;
  value: string;
  onChange: (hex: string) => void;
}

const TINT_LEVELS = [0, 1, 2, 3, 4] as const;

export function ColorPalettePicker({
  label = "Color en grilla",
  value,
  onChange,
}: ColorPalettePickerProps) {
  const normalizedValue = (value || "#2563EB").trim().toUpperCase();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 shrink-0 rounded-full border"
            style={{ backgroundColor: normalizedValue }}
            aria-hidden="true"
          />
          <span className="font-mono text-xs text-muted-foreground">
            {normalizedValue}
          </span>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border bg-card p-2.5">
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
                  className={`h-5 w-full cursor-pointer rounded-[4px] border transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isSelected
                      ? "z-10 scale-110 border-white ring-2 ring-foreground ring-offset-1 ring-offset-background"
                      : "border-black/15 hover:z-10 hover:scale-110"
                  }`}
                />
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Pipette className="h-3.5 w-3.5" />
            Personalizado
          </span>
          <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted">
            <span
              className="h-3.5 w-3.5 rounded-sm border border-black/20"
              style={{ backgroundColor: normalizedValue }}
            />
            <span>Elegir</span>
            <input
              type="color"
              value={/^#[0-9A-F]{6}$/i.test(normalizedValue) ? normalizedValue : "#2563EB"}
              onChange={(e) => onChange(e.target.value.toUpperCase())}
              aria-label="Selector de color personalizado"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
