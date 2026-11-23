"use client";

import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Scale,
  Sliders,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  calculateLey20903Breakdown,
  extractLey20903Policy,
  formatChronologicalMinutes,
  resolveBlockDurationMinutes,
  ROOM_ASSIGNMENT_MODE_LABELS,
  RULE_TYPE_META,
  type Ley20903Policy,
  type Ley20903RatioMode,
  type RoomAssignmentMode,
} from "@/lib/scheduling/constants";
import type { SchedulingRuleType } from "@prisma/client";
import type {
  AISuggestionItem,
  ScheduleVersionDetailDTO,
  SchoolSetupPayload,
} from "./types";

interface RulesAndAITabProps {
  setup: SchoolSetupPayload;
  activeVersion: ScheduleVersionDetailDTO | null;
  onRefresh: () => Promise<void>;
}

export function RulesAndAITab({
  setup,
  activeVersion,
  onRefresh,
}: RulesAndAITabProps) {
  const { showToast } = useToast();
  const [ruleType, setRuleType] = useState<SchedulingRuleType>("TEACHER_UNAVAILABILITY");
  const [weight, setWeight] = useState<"HARD" | "SOFT">("HARD");
  const [penaltyScore, setPenaltyScore] = useState(20);
  const [targetType, setTargetType] = useState<"GLOBAL" | "TEACHER" | "SUBJECT" | "COURSE">("TEACHER");
  const [targetId, setTargetId] = useState(setup.teachers[0]?.id ?? "");
  const [paramDay, setParamDay] = useState(5);
  const [paramBlock, setParamBlock] = useState(1);
  const [paramPeriod, setParamPeriod] = useState("MORNING");
  const [paramMax, setParamMax] = useState(2);
  const [paramMin, setParamMin] = useState(2);
  const [paramStartBlock, setParamStartBlock] = useState(4);
  const [paramEndBlock, setParamEndBlock] = useState(6);
  const [paramText, setParamText] = useState("");
  const [paramSecondSubjectId, setParamSecondSubjectId] = useState(setup.subjects[1]?.id ?? "");
  const [paramTeacherIds, setParamTeacherIds] = useState<string[]>(
    setup.teachers.slice(0, 2).map((t) => t.id)
  );

  const syncGroupOptions = useMemo(() => {
    const map = new Map<string, { code: string; count: number; weeklyBlocks: number }>();
    for (const c of setup.courses) {
      for (const cs of c.courseSubjects) {
        if (!cs.syncGroupCode) continue;
        const existing = map.get(cs.syncGroupCode);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(cs.syncGroupCode, {
            code: cs.syncGroupCode,
            count: 1,
            weeklyBlocks: cs.weeklyBlocks,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [setup.courses]);

  const availableBlockNumbers = useMemo(() => {
    const set = new Set<number>();
    for (const bs of setup.bellSchedules) {
      for (const ts of bs.timeSlots) {
        if (ts.slotType === "CLASS") set.add(ts.blockNumber);
      }
    }
    if (set.size === 0) {
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [setup.bellSchedules]);

  const [paramSyncGroupCode, setParamSyncGroupCode] = useState(
    syncGroupOptions[0]?.code ?? ""
  );
  const [paramSyncBlocks, setParamSyncBlocks] = useState<number[]>([1]);

  const [busyRule, setBusyRule] = useState(false);
  const [busyAI, setBusyAI] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestionItem[]>(
    activeVersion?.aiSuggestions ?? []
  );

  const handleCreateRule = async () => {
    setBusyRule(true);
    try {
      let parameters: Record<string, unknown> = { enabled: true };
      if (ruleType === "TEACHER_UNAVAILABILITY") {
        parameters = { unavailableDays: [paramDay] };
      } else if (ruleType === "SUBJECT_PREFERRED_TIME_RANGE") {
        parameters = {
          period: paramPeriod,
          maxBlock: paramPeriod === "MORNING" ? 4 : undefined,
          minBlock: paramPeriod === "AFTERNOON" ? 5 : undefined,
        };
      } else if (
        ruleType === "MAX_DAILY_BLOCKS_PER_SUBJECT" ||
        ruleType === "MAX_TEACHER_WINDOWS" ||
        ruleType === "MAX_CONSECUTIVE_TEACHER_BLOCKS"
      ) {
        parameters = { max: paramMax };
      } else if (ruleType === "TEACHER_DAY_COMPACTNESS") {
        parameters = { maxDays: paramMax };
      } else if (ruleType === "TEACHER_DAILY_BLOCKS_LIMIT") {
        parameters = { min: paramMin, max: paramMax };
      } else if (ruleType === "TEACHER_GUARANTEED_LUNCH_BREAK") {
        parameters = {
          startBlock: paramStartBlock,
          endBlock: paramEndBlock,
          minFreeBlocks: Math.max(1, paramMin),
        };
      } else if (ruleType === "SYNCED_DEPARTMENT_MEETING") {
        parameters = {
          label: paramText.trim() || "Reunión de Departamento",
          teacherIds: paramTeacherIds,
          requiredFreeBlocks: Math.max(1, paramMax),
        };
      } else if (ruleType === "TEACHER_CAMPUS_TRAVEL") {
        parameters = { minGapBlocks: Math.max(0, paramMax) };
      } else if (ruleType === "EXTENDED_BLOCKS_POLICY") {
        parameters = { blockSize: Math.max(2, paramMax) };
      } else if (ruleType === "FIXED_SUBJECT_SLOT") {
        parameters = { dayOfWeek: paramDay, blockNumber: paramBlock };
      } else if (ruleType === "FIXED_SYNC_GROUP_SLOT") {
        const cleanCode = paramSyncGroupCode.trim();
        if (!cleanCode) {
          showToast({ variant: "error", title: "Grupo requerido", description: "Debes indicar un grupo sincronizado." });
          setBusyRule(false);
          return;
        }
        if (paramSyncBlocks.length === 0) {
          showToast({ variant: "error", title: "Bloque(s) requerido(s)", description: "Debes seleccionar al menos un bloque." });
          setBusyRule(false);
          return;
        }
        parameters = {
          syncGroupCode: cleanCode,
          dayOfWeek: paramDay,
          blockNumbers: [...paramSyncBlocks].sort((a, b) => a - b),
        };
      } else if (ruleType === "SUBJECT_MIN_DAY_SPACING") {
        parameters = { minDaysBetween: Math.max(1, paramMin) };
      } else if (ruleType === "MAX_DAILY_COGNITIVE_LOAD") {
        parameters = { maxDailyLoad: Math.max(1, paramMax) };
      } else if (ruleType === "NO_SUBJECT_POST_LUNCH") {
        parameters = { blocksAfterLunch: Math.max(1, paramMax) };
      } else if (ruleType === "SUBJECT_PRECEDENCE") {
        parameters = {
          prerequisiteSubjectId: targetId || setup.subjects[0]?.id,
          dependentSubjectId: paramSecondSubjectId || setup.subjects[1]?.id,
        };
      } else if (ruleType === "ROOM_ACCESSIBILITY_FLOOR") {
        parameters = { maxFloor: Math.max(1, paramMax) };
      } else if (ruleType === "ROOM_EQUIPMENT_REQUIREMENT") {
        parameters = { requiredTag: paramText.trim() || undefined };
      } else if (ruleType === "MINIMIZE_COURSE_ROOM_CHANGES") {
        parameters = { maxChangesPerDay: Math.max(0, paramMax) };
      }

      const res = await fetch("/api/horarios/setup/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "rule",
          data: {
            ruleType,
            weight: ruleType === "FIXED_SYNC_GROUP_SLOT" ? "HARD" : weight,
            penaltyScore: ruleType === "FIXED_SYNC_GROUP_SLOT" ? 100 : penaltyScore,
            targetEntityType: ruleType === "FIXED_SYNC_GROUP_SLOT" ? "GLOBAL" : targetType,
            targetEntityId:
              ruleType === "FIXED_SYNC_GROUP_SLOT" || targetType === "GLOBAL"
                ? null
                : targetId || null,
            parameters,
          },
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({ variant: "error", title: "Error al guardar regla", description: json.error || "Error" });
        return;
      }
      showToast({ variant: "success", title: "Regla guardada", description: "Regla aplicada al motor de horarios." });
      await onRefresh();
    } finally {
      setBusyRule(false);
    }
  };

  const handleRunAI = async (action: "resolve" | "audit") => {
    if (!activeVersion) return;
    setBusyAI(true);
    try {
      const res = await fetch(`/api/horarios/versions/${activeVersion.id}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { suggestions?: AISuggestionItem[]; error?: string };
      if (!res.ok) {
        showToast({ variant: "error", title: "Error en IA", description: data.error || "Error" });
        return;
      }
      setSuggestions(data.suggestions ?? []);
      showToast({
        variant: "success",
        title: action === "resolve" ? "Análisis de conflictos completado" : "Auditoría pedagógica completada",
        description: `Se generaron ${data.suggestions?.length ?? 0} recomendaciones.`,
      });
      await onRefresh();
    } finally {
      setBusyAI(false);
    }
  };

  const handleApplySuggestion = async (suggestionId: string) => {
    if (!activeVersion) return;
    setBusyAI(true);
    try {
      const res = await fetch(`/api/horarios/versions/${activeVersion.id}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", suggestionId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({ variant: "error", title: "No se pudo aplicar", description: data.error || "Error" });
        return;
      }
      setSuggestions((prev) =>
        prev.map((s) => (s.id === suggestionId ? { ...s, applied: true } : s))
      );
      showToast({
        variant: "success",
        title: "Sugerencia aplicada",
        description: "Cambio ejecutado, registrado en historial (AI_APPLY) y puntaje recalculado.",
      });
      await onRefresh();
    } finally {
      setBusyAI(false);
    }
  };

  const displayedSuggestions =
    suggestions.length > 0 ? suggestions : (activeVersion?.aiSuggestions ?? []);

  const courseWindowsRule = setup.rules.find((r) => r.ruleType === "ALLOW_COURSE_WINDOWS");
  const courseWindowsEnabled = Boolean(
    courseWindowsRule &&
      ((courseWindowsRule.parameters ?? {}) as { enabled?: boolean }).enabled
  );

  const roomModeRule = setup.rules.find((r) => r.ruleType === "ROOM_ASSIGNMENT_MODE");
  const currentRoomMode: RoomAssignmentMode =
    (((roomModeRule?.parameters ?? {}) as { mode?: RoomAssignmentMode }).mode) ??
    "FIXED_COURSE_WITH_SPECIALS";

  const leyRule = setup.rules.find((r) => r.ruleType === "LEY_20903_POLICY");
  const savedLeyPolicy = extractLey20903Policy(setup.rules);
  const detectedBellBlockMinutes = resolveBlockDurationMinutes(setup.bellSchedules, {
    blockDurationMinutes: 0,
  });

  const [leyPolicyDraft, setLeyPolicyDraft] = useState<Ley20903Policy>(savedLeyPolicy);
  const [busyRecalc, setBusyRecalc] = useState(false);

  const previewBlockMin =
    leyPolicyDraft.blockDurationMinutes > 0
      ? leyPolicyDraft.blockDurationMinutes
      : detectedBellBlockMinutes;
  const preview44h = calculateLey20903Breakdown({
    contractHours: 44,
    ratio: leyPolicyDraft.defaultRatio,
    blockDurationMinutes: previewBlockMin,
    includeBreaksInTeaching: leyPolicyDraft.includeBreaksInTeaching,
    breakMinutesPerBlock: leyPolicyDraft.breakMinutesPerBlock,
  });

  const handleSaveLeyPolicy = async () => {
    setBusyRule(true);
    try {
      const res = await fetch("/api/horarios/setup/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "rule",
          data: {
            id: leyRule?.id,
            ruleType: "LEY_20903_POLICY",
            weight: leyPolicyDraft.strictEnforcement ? "HARD" : "SOFT",
            penaltyScore: leyPolicyDraft.strictEnforcement ? 100 : 25,
            targetEntityType: "GLOBAL",
            targetEntityId: null,
            parameters: leyPolicyDraft,
          },
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({
          variant: "error",
          title: "Error al guardar política Ley 20.903",
          description: json.error || "Error",
        });
        return;
      }
      showToast({
        variant: "success",
        title: "Ajustes Ley 20.903 guardados",
        description: `Proporción ${preview44h.ratioLabel} · Tope ref. 44h: ${preview44h.legalMaxTeachingBlocks} bloques lectivos.`,
      });
      await onRefresh();
    } finally {
      setBusyRule(false);
    }
  };

  const handleRecalculateTeachers = async () => {
    setBusyRecalc(true);
    try {
      const res = await fetch("/api/horarios/setup/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "recalculate_ley20903", data: {} }),
      });
      const json = (await res.json()) as {
        updatedCount?: number;
        totalTeachers?: number;
        error?: string;
      };
      if (!res.ok) {
        showToast({
          variant: "error",
          title: "No se pudo recalcular",
          description: json.error || "Error",
        });
        return;
      }
      showToast({
        variant: "success",
        title: "Topes docentes actualizados",
        description: `${json.updatedCount ?? 0} de ${json.totalTeachers ?? 0} docentes ajustados al tope Ley 20.903 vigente.`,
      });
      await onRefresh();
    } finally {
      setBusyRecalc(false);
    }
  };

  const handleChangeRoomMode = async (mode: RoomAssignmentMode) => {
    setBusyRule(true);
    try {
      const res = await fetch("/api/horarios/setup/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "rule",
          data: {
            id: roomModeRule?.id,
            ruleType: "ROOM_ASSIGNMENT_MODE",
            weight: "HARD",
            penaltyScore: 100,
            targetEntityType: "GLOBAL",
            targetEntityId: null,
            parameters: { mode },
          },
        }),
      });
      if (res.ok) {
        showToast({
          variant: "success",
          title: "Modo de salas actualizado",
          description: ROOM_ASSIGNMENT_MODE_LABELS[mode].label,
        });
        await onRefresh();
      }
    } finally {
      setBusyRule(false);
    }
  };

  const handleToggleCourseWindows = async () => {
    setBusyRule(true);
    try {
      const res = await fetch("/api/horarios/setup/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "rule",
          data: {
            id: courseWindowsRule?.id,
            ruleType: "ALLOW_COURSE_WINDOWS",
            weight: "SOFT",
            penaltyScore: 0,
            targetEntityType: "GLOBAL",
            targetEntityId: null,
            parameters: { enabled: !courseWindowsEnabled },
          },
        }),
      });
      if (res.ok) {
        showToast({
          variant: "info",
          title: !courseWindowsEnabled
            ? "Ventanas en cursos habilitadas"
            : "Ventanas en cursos prohibidas",
          description: !courseWindowsEnabled
            ? "El motor ahora permite espacios en blanco entre clases de un curso."
            : "Los cursos no podrán tener espacios libres entre clases (regla obligatoria).",
        });
        await onRefresh();
      }
    } finally {
      setBusyRule(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* COLUMNA IZQUIERDA: REGLAS HARD/SOFT */}
      <div className="space-y-4">
        <Card className="border-[var(--border-accent)]">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  Ventanas entre clases de cursos
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {courseWindowsEnabled
                    ? "Habilitadas: el motor permite bloques libres intermedios en cursos."
                    : "Prohibidas (por defecto): todos los cursos deben tener jornada continua sin huecos."}
                </p>
              </div>
              <Button
                size="sm"
                variant={courseWindowsEnabled ? "destructive" : "secondary"}
                disabled={busyRule}
                onClick={() => void handleToggleCourseWindows()}
              >
                {courseWindowsEnabled ? "Deshabilitar ventanas" : "Habilitar ventanas"}
              </Button>
            </div>

            <div className="border-t border-[var(--border-subtle)] pt-3 space-y-2">
              <div className="space-y-0.5">
                <Label htmlFor="room-assignment-mode" className="text-sm font-bold text-[var(--text-primary)]">
                  Asignación de salas
                </Label>
                <p className="text-xs text-[var(--text-secondary)]">
                  {ROOM_ASSIGNMENT_MODE_LABELS[currentRoomMode].description}
                </p>
              </div>
              <Select
                value={currentRoomMode}
                disabled={busyRule}
                onValueChange={(v) => void handleChangeRoomMode(v as RoomAssignmentMode)}
              >
                <SelectTrigger id="room-assignment-mode" className="text-xs font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(ROOM_ASSIGNMENT_MODE_LABELS) as Array<[RoomAssignmentMode, { label: string }]>).map(
                    ([key, meta]) => (
                      <SelectItem key={key} value={key}>
                        {meta.label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[var(--border-accent)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-4 w-4 text-[var(--accent-1)]" />
              Ajustes Ley 20.903 (65/35 y 60/40)
            </CardTitle>
            <CardDescription>
              Configura la proporción lectiva/no lectiva, imputación de recreos MINEDUC, duración de bloques y exigencia del motor.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ley-default-ratio">Proporción base del establecimiento</Label>
                <Select
                  value={leyPolicyDraft.defaultRatio}
                  onValueChange={(v) =>
                    setLeyPolicyDraft((prev) => ({
                      ...prev,
                      defaultRatio: v as Ley20903RatioMode,
                    }))
                  }
                >
                  <SelectTrigger id="ley-default-ratio" className="text-xs font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="65_35">65% lectivo / 35% no lectivo (Regla general)</SelectItem>
                    <SelectItem value="60_40">60% lectivo / 40% no lectivo (≥ 80% prioritarios)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ley-block-duration">
                  Duración bloque pedagógico (0 = auto: {detectedBellBlockMinutes} min)
                </Label>
                <Input
                  id="ley-block-duration"
                  type="number"
                  min={0}
                  max={120}
                  value={leyPolicyDraft.blockDurationMinutes}
                  onChange={(e) =>
                    setLeyPolicyDraft((prev) => ({
                      ...prev,
                      blockDurationMinutes: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                htmlFor="ley-include-breaks"
                className="flex items-start gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-subtle)] p-2.5 text-xs cursor-pointer"
              >
                <Checkbox
                  id="ley-include-breaks"
                  checked={leyPolicyDraft.includeBreaksInTeaching}
                  onCheckedChange={(checked) =>
                    setLeyPolicyDraft((prev) => ({
                      ...prev,
                      includeBreaksInTeaching: checked === true,
                    }))
                  }
                  className="mt-0.5"
                />
                <span>
                  <strong className="block text-[var(--text-primary)]">Imputar recreos en tiempo lectivo</strong>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Estándar MINEDUC: los recreos proporcionales se descuentan del porcentaje lectivo.
                  </span>
                </span>
              </label>

              <div className="space-y-1.5">
                <Label htmlFor="ley-break-minutes">Recreo proporcional por bloque (min)</Label>
                <Input
                  id="ley-break-minutes"
                  type="number"
                  min={0}
                  max={20}
                  disabled={!leyPolicyDraft.includeBreaksInTeaching}
                  value={leyPolicyDraft.breakMinutesPerBlock}
                  onChange={(e) =>
                    setLeyPolicyDraft((prev) => ({
                      ...prev,
                      breakMinutesPerBlock: Math.max(0, Math.min(20, Number(e.target.value) || 0)),
                    }))
                  }
                  className="text-xs"
                />
                <p className="text-[10px] text-[var(--text-muted)]">
                  4 min coincide con la tabla oficial MINEDUC (44h → 35 blq en 65/35).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                htmlFor="ley-basic-6040"
                className="flex items-start gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-subtle)] p-2.5 text-xs cursor-pointer"
              >
                <Checkbox
                  id="ley-basic-6040"
                  checked={leyPolicyDraft.apply6040ToBasic1to4}
                  disabled={leyPolicyDraft.defaultRatio === "60_40"}
                  onCheckedChange={(checked) =>
                    setLeyPolicyDraft((prev) => ({
                      ...prev,
                      apply6040ToBasic1to4: checked === true,
                    }))
                  }
                  className="mt-0.5"
                />
                <span>
                  <strong className="block text-[var(--text-primary)]">Aplicar 60/40 a 1°–4° Básico</strong>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Excepción legal para docentes de primer ciclo en establecimientos ≥ 80% prioritarios.
                  </span>
                </span>
              </label>

              <label
                htmlFor="ley-strict-enforcement"
                className="flex items-start gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-subtle)] p-2.5 text-xs cursor-pointer"
              >
                <Checkbox
                  id="ley-strict-enforcement"
                  checked={leyPolicyDraft.strictEnforcement}
                  onCheckedChange={(checked) =>
                    setLeyPolicyDraft((prev) => ({
                      ...prev,
                      strictEnforcement: checked === true,
                    }))
                  }
                  className="mt-0.5"
                />
                <span>
                  <strong className="block text-[var(--text-primary)]">Exigencia estricta (Conflicto DURO)</strong>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Marca exceso de proporción como error bloqueante en precondiciones y auditoría.
                  </span>
                </span>
              </label>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5 text-xs text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">Referencia contrato 44h ({preview44h.ratioLabel}):</span>{" "}
              máx. <strong className="text-[var(--accent-1)]">{preview44h.legalMaxTeachingBlocks} bloques lectivos</strong>{" "}
              ({formatChronologicalMinutes(preview44h.maxTeachingChronologicalMinutes)} cronológicas, bloque {preview44h.blockDurationMinutes}m
              {preview44h.breakMinutesPerBlock > 0 ? ` + ${preview44h.breakMinutesPerBlock}m recreo` : ""}) · mín. no lectivo:{" "}
              <strong>{formatChronologicalMinutes(preview44h.minNonTeachingChronologicalMinutes)}</strong>.
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busyRule} onClick={() => void handleSaveLeyPolicy()}>
                {busyRule ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Guardar ajustes Ley 20.903
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busyRecalc || busyRule}
                onClick={() => void handleRecalculateTeachers()}
              >
                {busyRecalc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Recalcular topes docentes
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sliders className="h-4 w-4 text-[var(--accent-1)]" />
              Nueva Regla de Programación
            </CardTitle>
            <CardDescription>
              Define restricciones duras (inviolables) o blandas (ponderadas en el puntaje).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rule-type">Tipo de regla</Label>
              <Select
                value={ruleType}
                onValueChange={(v) => {
                  const next = v as SchedulingRuleType;
                  setRuleType(next);
                  const meta = RULE_TYPE_META[next];
                  setWeight(meta.defaultWeight);
                  setPenaltyScore(meta.defaultPenalty);
                  if (next === "TEACHER_UNAVAILABILITY") {
                    setTargetType("TEACHER");
                    setTargetId(setup.teachers[0]?.id ?? "");
                  } else if (
                    next === "SUBJECT_PREFERRED_TIME_RANGE" ||
                    next === "EXTENDED_BLOCKS_POLICY" ||
                    next === "FIXED_SUBJECT_SLOT" ||
                    next === "SUBJECT_MIN_DAY_SPACING" ||
                    next === "NO_SUBJECT_POST_LUNCH" ||
                    next === "ROOM_EQUIPMENT_REQUIREMENT"
                  ) {
                    setTargetType("SUBJECT");
                    setTargetId(setup.subjects[0]?.id ?? "");
                    if (next === "EXTENDED_BLOCKS_POLICY") setParamMax(3);
                    if (next === "NO_SUBJECT_POST_LUNCH") setParamMax(1);
                    if (next === "SUBJECT_MIN_DAY_SPACING") setParamMin(1);
                  } else if (next === "ROOM_ACCESSIBILITY_FLOOR") {
                    setTargetType("COURSE");
                    setTargetId(setup.courses[0]?.id ?? "");
                    setParamMax(1);
                  } else {
                    setTargetType("GLOBAL");
                    setTargetId("");
                    if (next === "TEACHER_DAY_COMPACTNESS") setParamMax(3);
                    if (next === "TEACHER_DAILY_BLOCKS_LIMIT") {
                      setParamMin(2);
                      setParamMax(7);
                    }
                    if (next === "TEACHER_GUARANTEED_LUNCH_BREAK") {
                      setParamStartBlock(4);
                      setParamEndBlock(6);
                      setParamMin(1);
                    }
                    if (next === "SYNCED_DEPARTMENT_MEETING") setParamMax(1);
                    if (next === "TEACHER_CAMPUS_TRAVEL") setParamMax(1);
                    if (next === "MAX_DAILY_COGNITIVE_LOAD") setParamMax(10);
                    if (next === "MINIMIZE_COURSE_ROOM_CHANGES") setParamMax(1);
                    if (next === "FIXED_SYNC_GROUP_SLOT") {
                      setWeight("HARD");
                      setPenaltyScore(100);
                      setParamDay(4);
                      setParamSyncGroupCode(syncGroupOptions[0]?.code ?? "");
                      setParamSyncBlocks([availableBlockNumbers[0] ?? 1]);
                    }
                  }
                }}
              >
                <SelectTrigger id="rule-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RULE_TYPE_META)
                    .filter(([k]) => k !== "LEY_20903_POLICY")
                    .map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        [{v.category}] {v.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-[var(--text-muted)]">
              {RULE_TYPE_META[ruleType].description}
            </p>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="rule-weight">Prioridad</Label>
                <Select
                  value={weight}
                  disabled={ruleType === "FIXED_SYNC_GROUP_SLOT"}
                  onValueChange={(v) => setWeight(v as "HARD" | "SOFT")}
                >
                  <SelectTrigger id="rule-weight" className="text-xs font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HARD">HARD (Obligatoria)</SelectItem>
                    <SelectItem value="SOFT">SOFT (Preferencia)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rule-penalty">Penalización</Label>
                <Input
                  id="rule-penalty"
                  type="number"
                  disabled={weight === "HARD"}
                  value={weight === "HARD" ? 100 : penaltyScore}
                  onChange={(e) => setPenaltyScore(Number(e.target.value))}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rule-target-type">Alcance</Label>
                <Select
                  value={targetType}
                  disabled={ruleType === "FIXED_SYNC_GROUP_SLOT"}
                  onValueChange={(v) => {
                    const nextTarget = v as "GLOBAL" | "TEACHER" | "SUBJECT" | "COURSE";
                    setTargetType(nextTarget);
                    if (nextTarget === "TEACHER") setTargetId(setup.teachers[0]?.id ?? "");
                    else if (nextTarget === "SUBJECT") setTargetId(setup.subjects[0]?.id ?? "");
                    else if (nextTarget === "COURSE") setTargetId(setup.courses[0]?.id ?? "");
                    else setTargetId("");
                  }}
                >
                  <SelectTrigger id="rule-target-type" className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GLOBAL">Global</SelectItem>
                    <SelectItem value="TEACHER">Docente</SelectItem>
                    <SelectItem value="SUBJECT">Asignatura</SelectItem>
                    <SelectItem value="COURSE">Curso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {targetType === "TEACHER" && (
              <div className="space-y-1.5">
                <Label htmlFor="rule-target-teacher">Docente objetivo</Label>
                <Select value={targetId || undefined} onValueChange={setTargetId}>
                  <SelectTrigger id="rule-target-teacher">
                    <SelectValue placeholder="Selecciona un docente" />
                  </SelectTrigger>
                  <SelectContent>
                    {setup.teachers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.firstName} {t.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {targetType === "SUBJECT" && (
              <div className="space-y-1.5">
                <Label htmlFor="rule-target-subject">Asignatura objetivo</Label>
                <Select value={targetId || undefined} onValueChange={setTargetId}>
                  <SelectTrigger id="rule-target-subject">
                    <SelectValue placeholder="Selecciona una asignatura" />
                  </SelectTrigger>
                  <SelectContent>
                    {setup.subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {targetType === "COURSE" && (
              <div className="space-y-1.5">
                <Label htmlFor="rule-target-course">Curso objetivo</Label>
                <Select value={targetId || undefined} onValueChange={setTargetId}>
                  <SelectTrigger id="rule-target-course">
                    <SelectValue placeholder="Selecciona un curso" />
                  </SelectTrigger>
                  <SelectContent>
                    {setup.courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {ruleType === "TEACHER_UNAVAILABILITY" && (
              <div className="space-y-1.5">
                <Label htmlFor="rule-unavail-day">Día no disponible</Label>
                <Select
                  value={String(paramDay)}
                  onValueChange={(v) => setParamDay(Number(v))}
                >
                  <SelectTrigger id="rule-unavail-day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Lunes</SelectItem>
                    <SelectItem value="2">Martes</SelectItem>
                    <SelectItem value="3">Miércoles</SelectItem>
                    <SelectItem value="4">Jueves</SelectItem>
                    <SelectItem value="5">Viernes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {ruleType === "SUBJECT_PREFERRED_TIME_RANGE" && (
              <div className="space-y-1.5">
                <Label htmlFor="rule-preferred-period">Franja horaria preferida</Label>
                <Select value={paramPeriod} onValueChange={setParamPeriod}>
                  <SelectTrigger id="rule-preferred-period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MORNING">Priorizar Mañana (Bloques 1 a 4)</SelectItem>
                    <SelectItem value="AFTERNOON">Priorizar Tarde (Bloques 5 a 8)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {(ruleType === "MAX_DAILY_BLOCKS_PER_SUBJECT" ||
              ruleType === "MAX_TEACHER_WINDOWS" ||
              ruleType === "MAX_CONSECUTIVE_TEACHER_BLOCKS") && (
              <div className="space-y-1.5">
                <Label htmlFor="rule-param-max">
                  {ruleType === "MAX_DAILY_BLOCKS_PER_SUBJECT"
                    ? "Máximo de bloques diarios por asignatura"
                    : ruleType === "MAX_TEACHER_WINDOWS"
                      ? "Máximo de ventanas por docente"
                      : "Máximo de bloques consecutivos"}
                </Label>
                <Input
                  id="rule-param-max"
                  type="number"
                  min={0}
                  max={8}
                  value={paramMax}
                  onChange={(e) => setParamMax(Number(e.target.value))}
                />
              </div>
            )}

            {ruleType === "TEACHER_DAY_COMPACTNESS" && (
              <div className="space-y-1.5">
                <Label htmlFor="rule-compact-days">
                  Máximo de días a la semana (0 = automático según carga)
                </Label>
                <Input
                  id="rule-compact-days"
                  type="number"
                  min={0}
                  max={5}
                  value={paramMax}
                  onChange={(e) => setParamMax(Number(e.target.value))}
                />
              </div>
            )}

            {ruleType === "TEACHER_DAILY_BLOCKS_LIMIT" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rule-daily-min">Mínimo diario</Label>
                  <Input
                    id="rule-daily-min"
                    type="number"
                    min={0}
                    max={8}
                    value={paramMin}
                    onChange={(e) => setParamMin(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rule-daily-max">Máximo diario</Label>
                  <Input
                    id="rule-daily-max"
                    type="number"
                    min={1}
                    max={10}
                    value={paramMax}
                    onChange={(e) => setParamMax(Number(e.target.value))}
                  />
                </div>
              </div>
            )}

            {ruleType === "TEACHER_GUARANTEED_LUNCH_BREAK" && (
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rule-lunch-start">Bloque inicio</Label>
                  <Input
                    id="rule-lunch-start"
                    type="number"
                    min={1}
                    max={10}
                    value={paramStartBlock}
                    onChange={(e) => setParamStartBlock(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rule-lunch-end">Bloque fin</Label>
                  <Input
                    id="rule-lunch-end"
                    type="number"
                    min={1}
                    max={12}
                    value={paramEndBlock}
                    onChange={(e) => setParamEndBlock(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rule-lunch-min">Libres mín.</Label>
                  <Input
                    id="rule-lunch-min"
                    type="number"
                    min={1}
                    max={4}
                    value={paramMin}
                    onChange={(e) => setParamMin(Number(e.target.value))}
                  />
                </div>
              </div>
            )}

            {ruleType === "SYNCED_DEPARTMENT_MEETING" && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="rule-dept-name">Nombre de la reunión / depto.</Label>
                    <Input
                      id="rule-dept-name"
                      type="text"
                      value={paramText}
                      onChange={(e) => setParamText(e.target.value)}
                      placeholder="Ej. Depto. Matemática"
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rule-dept-blocks">Bloques libres requeridos</Label>
                    <Input
                      id="rule-dept-blocks"
                      type="number"
                      min={1}
                      max={4}
                      value={paramMax}
                      onChange={(e) => setParamMax(Number(e.target.value))}
                      className="text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Docentes participantes</Label>
                  <div className="max-h-28 overflow-y-auto rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-subtle)] p-2 space-y-1.5">
                    {setup.teachers.map((t) => {
                      const checked = paramTeacherIds.includes(t.id);
                      const checkId = `rule-dept-teacher-${t.id}`;
                      return (
                        <div key={t.id} className="flex items-center gap-2">
                          <Checkbox
                            id={checkId}
                            checked={checked}
                            onCheckedChange={(isChecked) => {
                              setParamTeacherIds((prev) =>
                                isChecked === true ? [...prev, t.id] : prev.filter((id) => id !== t.id)
                              );
                            }}
                          />
                          <Label htmlFor={checkId} className="cursor-pointer font-normal text-[var(--text-primary)]">
                            {t.firstName} {t.lastName}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {ruleType === "TEACHER_CAMPUS_TRAVEL" && (
              <div className="space-y-1.5">
                <Label htmlFor="rule-campus-travel">Bloques libres mínimos para cambio de sede</Label>
                <Input
                  id="rule-campus-travel"
                  type="number"
                  min={0}
                  max={3}
                  value={paramMax}
                  onChange={(e) => setParamMax(Number(e.target.value))}
                />
              </div>
            )}

            {ruleType === "EXTENDED_BLOCKS_POLICY" && (
              <div className="space-y-1.5">
                <Label htmlFor="rule-extended-blocks">
                  Tamaño de bloque extendido (ej. 3 o 4 bloques seguidos)
                </Label>
                <Input
                  id="rule-extended-blocks"
                  type="number"
                  min={2}
                  max={8}
                  value={paramMax}
                  onChange={(e) => setParamMax(Number(e.target.value))}
                />
              </div>
            )}

            {ruleType === "FIXED_SUBJECT_SLOT" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rule-fixed-day">Día</Label>
                  <Select
                    value={String(paramDay)}
                    onValueChange={(v) => setParamDay(Number(v))}
                  >
                    <SelectTrigger id="rule-fixed-day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Lunes</SelectItem>
                      <SelectItem value="2">Martes</SelectItem>
                      <SelectItem value="3">Miércoles</SelectItem>
                      <SelectItem value="4">Jueves</SelectItem>
                      <SelectItem value="5">Viernes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rule-fixed-block">N° de bloque</Label>
                  <Input
                    id="rule-fixed-block"
                    type="number"
                    min={1}
                    max={10}
                    value={paramBlock}
                    onChange={(e) => setParamBlock(Number(e.target.value))}
                    placeholder="Ej. 1"
                  />
                </div>
              </div>
            )}

            {ruleType === "FIXED_SYNC_GROUP_SLOT" && (
              <div className="space-y-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-subtle)] p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="rule-sync-group-code">Grupo sincronizado</Label>
                    {syncGroupOptions.length > 0 ? (
                      <Select
                        value={paramSyncGroupCode || undefined}
                        onValueChange={setParamSyncGroupCode}
                      >
                        <SelectTrigger id="rule-sync-group-code">
                          <SelectValue placeholder="Selecciona un grupo" />
                        </SelectTrigger>
                        <SelectContent>
                          {syncGroupOptions.map((g) => (
                            <SelectItem key={g.code} value={g.code}>
                              {g.code} ({g.count} asignaturas · {g.weeklyBlocks} bloq/sem)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="rule-sync-group-code"
                        type="text"
                        value={paramSyncGroupCode}
                        onChange={(e) => setParamSyncGroupCode(e.target.value)}
                        placeholder="Ej. Taller JEC"
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rule-sync-fixed-day">Día obligatorio</Label>
                    <Select
                      value={String(paramDay)}
                      onValueChange={(v) => setParamDay(Number(v))}
                    >
                      <SelectTrigger id="rule-sync-fixed-day">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Lunes</SelectItem>
                        <SelectItem value="2">Martes</SelectItem>
                        <SelectItem value="3">Miércoles</SelectItem>
                        <SelectItem value="4">Jueves</SelectItem>
                        <SelectItem value="5">Viernes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Bloque(s) obligatorio(s)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {availableBlockNumbers.map((blockNum) => {
                      const selected = paramSyncBlocks.includes(blockNum);
                      return (
                        <Button
                          key={blockNum}
                          type="button"
                          size="sm"
                          variant={selected ? "default" : "secondary"}
                          className="h-7 px-2.5 text-xs"
                          onClick={() => {
                            setParamSyncBlocks((prev) =>
                              prev.includes(blockNum)
                                ? prev.filter((b) => b !== blockNum)
                                : [...prev, blockNum].sort((a, b) => a - b)
                            );
                          }}
                        >
                          Bloque {blockNum}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Esta regla es siempre HARD (obligatoria): el motor anclará todas las asignaturas del grupo en el día y bloque(s) seleccionados.
                  </p>
                </div>
              </div>
            )}

            {ruleType === "SUBJECT_MIN_DAY_SPACING" && (
              <div className="space-y-1.5">
                <Label htmlFor="rule-day-spacing">Días libres mínimos entre sesiones</Label>
                <Input
                  id="rule-day-spacing"
                  type="number"
                  min={1}
                  max={4}
                  value={paramMin}
                  onChange={(e) => setParamMin(Number(e.target.value))}
                />
              </div>
            )}

            {ruleType === "MAX_DAILY_COGNITIVE_LOAD" && (
              <div className="space-y-1.5">
                <Label htmlFor="rule-cognitive-load">Carga cognitiva máxima diaria (puntos)</Label>
                <Input
                  id="rule-cognitive-load"
                  type="number"
                  min={1}
                  max={30}
                  value={paramMax}
                  onChange={(e) => setParamMax(Number(e.target.value))}
                />
              </div>
            )}

            {ruleType === "NO_SUBJECT_POST_LUNCH" && (
              <div className="space-y-1.5">
                <Label htmlFor="rule-post-lunch">Bloques restringidos después de almuerzo</Label>
                <Input
                  id="rule-post-lunch"
                  type="number"
                  min={1}
                  max={3}
                  value={paramMax}
                  onChange={(e) => setParamMax(Number(e.target.value))}
                />
              </div>
            )}

            {ruleType === "SUBJECT_PRECEDENCE" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rule-prec-theory">Teoría previa</Label>
                  <Select
                    value={targetId || setup.subjects[0]?.id || undefined}
                    onValueChange={setTargetId}
                  >
                    <SelectTrigger id="rule-prec-theory" className="text-xs">
                      <SelectValue placeholder="Selecciona asignatura" />
                    </SelectTrigger>
                    <SelectContent>
                      {setup.subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rule-prec-practice">Taller / Práctica</Label>
                  <Select
                    value={paramSecondSubjectId || undefined}
                    onValueChange={setParamSecondSubjectId}
                  >
                    <SelectTrigger id="rule-prec-practice" className="text-xs">
                      <SelectValue placeholder="Selecciona asignatura" />
                    </SelectTrigger>
                    <SelectContent>
                      {setup.subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {ruleType === "ROOM_ACCESSIBILITY_FLOOR" && (
              <div className="space-y-1.5">
                <Label htmlFor="rule-max-floor">Piso máximo permitido</Label>
                <Input
                  id="rule-max-floor"
                  type="number"
                  min={1}
                  max={5}
                  value={paramMax}
                  onChange={(e) => setParamMax(Number(e.target.value))}
                />
              </div>
            )}

            {ruleType === "ROOM_EQUIPMENT_REQUIREMENT" && (
              <div className="space-y-1.5">
                <Label htmlFor="rule-equipment">
                  Etiqueta de equipamiento requerida (opcional si la asignatura ya la define)
                </Label>
                <Input
                  id="rule-equipment"
                  type="text"
                  value={paramText}
                  onChange={(e) => setParamText(e.target.value)}
                  placeholder="Ej. TALLER_TP, LAB_HUMEDO"
                />
              </div>
            )}

            {ruleType === "MINIMIZE_COURSE_ROOM_CHANGES" && (
              <div className="space-y-1.5">
                <Label htmlFor="rule-room-changes">Máximo de cambios de sala por día</Label>
                <Input
                  id="rule-room-changes"
                  type="number"
                  min={0}
                  max={6}
                  value={paramMax}
                  onChange={(e) => setParamMax(Number(e.target.value))}
                />
              </div>
            )}

            <Button className="w-full" disabled={busyRule} onClick={() => void handleCreateRule()}>
              <Plus className="h-4 w-4" />
              Guardar Regla
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reglas Activas ({setup.rules.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[380px] overflow-y-auto">
            {setup.rules.map((r) => {
              const meta = RULE_TYPE_META[r.ruleType];
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-subtle)] p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={r.weight === "HARD" ? "default" : "secondary"}>
                        {r.weight}
                      </Badge>
                      <span className="text-xs font-semibold truncate">{meta.label}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                      Alcance: {r.targetEntityType} · Penalización: {r.penaltyScore} ·{" "}
                      <code>{JSON.stringify(r.parameters)}</code>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      await fetch(`/api/horarios/setup/entities?entity=rule&id=${r.id}`, {
                        method: "DELETE",
                      });
                      await onRefresh();
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* COLUMNA DERECHA: ASISTENTE IA */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--accent-1)]" />
            Asistente de Inteligencia Artificial (ScheduleAIService)
          </CardTitle>
          <CardDescription>
            Resuelve conflictos duros o realiza una auditoría pedagógica global con permutaciones aplicables en 1 clic.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busyAI || !activeVersion}
              onClick={() => void handleRunAI("resolve")}
            >
              {busyAI ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Resolver Conflictos con IA
            </Button>
            <Button
              variant="neonOutline"
              disabled={busyAI || !activeVersion}
              onClick={() => void handleRunAI("audit")}
            >
              {busyAI ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Auditoría Pedagógica UTP
            </Button>
          </div>

          <div className="space-y-3">
            {displayedSuggestions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border-card)] p-6 text-center text-xs text-[var(--text-muted)]">
                Ejecuta una auditoría o resolución de conflictos para obtener propuestas estructuradas.
              </div>
            ) : (
              displayedSuggestions.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-subtle)] p-4 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge variant="secondary" className="mb-1">
                        {item.kind === "CONFLICT_RESOLUTION"
                          ? "Resolución de Conflicto"
                          : "Mejora Pedagógica"}
                      </Badge>
                      <h4 className="text-sm font-bold text-[var(--text-primary)]">{item.title}</h4>
                    </div>
                    {item.expectedDeltaFitness > 0 && (
                      <Badge variant="default">+{item.expectedDeltaFitness} pts</Badge>
                    )}
                  </div>

                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {item.rationale}
                  </p>

                  {item.action && (
                    <div className="pt-1">
                      {item.applied ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-500">
                          <CheckCircle2 className="h-4 w-4" />
                          Aplicada al horario
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          disabled={busyAI}
                          onClick={() => void handleApplySuggestion(item.id)}
                        >
                          Aplicar sugerencia automáticamente
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
