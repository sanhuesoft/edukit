"use client";

import React, { useMemo, useState } from "react";
import { withBasePath } from "@/lib/basePath";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  DoorOpen,
  Download,
  FileArchive,
  FileText,
  GripVertical,
  Layers,
  LayoutGrid,
  Loader2,
  Lock,
  Palette,
  Play,
  RotateCcw,
  ShieldCheck,
  Unlock,
  Users,
} from "lucide-react";
import { DAYS_OF_WEEK } from "@/lib/scheduling/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useToast } from "@/components/ui/toast";
import { HelpTip } from "../HelpTip";
import type {
  ConflictAuditResult,
  PreconditionResult,
  ScheduleEntryDTO,
  ScheduleVersionDetailDTO,
  SchoolSetupPayload,
  TimeSlotDTO,
} from "../types";

interface StepResultadoProps {
  setup: SchoolSetupPayload;
  activeVersionId: string;
  versionDetail: ScheduleVersionDetailDTO | null;
  audit: ConflictAuditResult | null;
  preconditions: PreconditionResult | null;
  generating: boolean;
  onSelectVersion: (id: string) => void;
  onValidate: () => Promise<void>;
  onGenerate: () => Promise<void>;
  onVersionMutated: () => Promise<void>;
}

type ResultViewMode = "course" | "teacher" | "room" | "master";
type ColorByMode = "subject" | "teacher";
type MasterAxis = "courses" | "teachers";

function getEntryColor(entry: ScheduleEntryDTO, colorBy: ColorByMode): string {
  if (colorBy === "subject") {
    return entry.courseSubject.subject.colorHex || "#2563EB";
  }
  return entry.courseSubject.teachers[0]?.teacher.colorHex || "#2563EB";
}

function getTeacherLabel(entry: ScheduleEntryDTO): string {
  if (entry.courseSubject.teachers.length === 0) return "Sin docente";
  return entry.courseSubject.teachers
    .map((t) => `${t.teacher.firstName[0]}. ${t.teacher.lastName}`)
    .join(" / ");
}

interface GroupedSyncOption {
  key: string;
  subjectName: string;
  subjectCode: string;
  colorHex: string;
  teacherNames: string;
  courseNames: string[];
  roomNames: string[];
}

function groupSyncEntries(
  entries: ScheduleEntryDTO[],
  colorBy: ColorByMode
): GroupedSyncOption[] {
  const map = new Map<string, GroupedSyncOption>();
  for (const item of entries) {
    const teacherIds = [...item.courseSubject.teachers]
      .map((t) => t.teacherId)
      .sort()
      .join(",");
    const key = `${item.courseSubject.subjectId}::${teacherIds}`;
    const existing = map.get(key);
    if (existing) {
      if (!existing.courseNames.includes(item.courseSubject.course.name)) {
        existing.courseNames.push(item.courseSubject.course.name);
      }
      if (!existing.roomNames.includes(item.room.name)) {
        existing.roomNames.push(item.room.name);
      }
    } else {
      const teacherNames =
        item.courseSubject.teachers
          .map((t) => `${t.teacher.firstName} ${t.teacher.lastName}`)
          .join(" + ") || "Sin docente";
      map.set(key, {
        key,
        subjectName: item.courseSubject.subject.name,
        subjectCode: item.courseSubject.subject.code,
        colorHex: getEntryColor(item, colorBy),
        teacherNames,
        courseNames: [item.courseSubject.course.name],
        roomNames: [item.room.name],
      });
    }
  }
  return Array.from(map.values());
}

const SYNC_ACCENT_COLOR = "#4F46E5";

function SyncGroupHoverDetail({
  syncGroupCode,
  entries,
  colorBy,
}: {
  syncGroupCode: string;
  entries: ScheduleEntryDTO[];
  colorBy: ColorByMode;
}) {
  const options = groupSyncEntries(entries, colorBy);
  return (
    <HoverCardContent side="right" align="start" className="w-80 p-3">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 border-b pb-2">
          <div className="flex items-center gap-1.5 font-semibold text-xs">
            <Layers className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>{syncGroupCode}</span>
          </div>
          <Badge variant="secondary" className="text-[10px] font-normal">
            {options.length} {options.length === 1 ? "clase" : "en paralelo"}
          </Badge>
        </div>

        <div className="max-h-64 space-y-1.5 overflow-auto pr-1">
          {options.map((opt) => (
            <div
              key={opt.key}
              className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs"
            >
              <div className="flex items-center gap-1.5 font-medium">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: opt.colorHex }}
                />
                <span className="truncate">{opt.subjectName}</span>
              </div>
              <div className="mt-0.5 pl-3.5 text-[11px] text-muted-foreground">
                <div>{opt.teacherNames}</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{opt.roomNames.join(", ")}</span>
                  <span className="shrink-0 font-mono text-[10px]">
                    {opt.courseNames.join(", ")}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </HoverCardContent>
  );
}

export function StepResultado({
  setup,
  activeVersionId,
  versionDetail,
  audit,
  preconditions,
  generating,
  onSelectVersion,
  onValidate,
  onGenerate,
  onVersionMutated,
}: StepResultadoProps) {
  const { showToast } = useToast();
  const [viewMode, setViewMode] = useState<ResultViewMode>("course");
  const [colorBy, setColorBy] = useState<ColorByMode>("subject");
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    setup.courses[0]?.id ?? ""
  );
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    setup.teachers[0]?.id ?? ""
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string>(
    setup.rooms[0]?.id ?? ""
  );
  const [masterAxis, setMasterAxis] = useState<MasterAxis>("courses");
  const [masterDay, setMasterDay] = useState<number>(1);
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveCourseId =
    setup.courses.find((c) => c.id === selectedCourseId)?.id ??
    setup.courses[0]?.id ??
    "";
  const effectiveTeacherId =
    setup.teachers.find((t) => t.id === selectedTeacherId)?.id ??
    setup.teachers[0]?.id ??
    "";
  const effectiveRoomId =
    setup.rooms.find((r) => r.id === selectedRoomId)?.id ??
    setup.rooms[0]?.id ??
    "";

  const conflictEntryIds = useMemo(() => {
    const set = new Set<string>();
    if (!audit) return set;
    for (const c of audit.hardConflicts) {
      c.entryIds.forEach((id) => set.add(id));
    }
    return set;
  }, [audit]);

  // Determinar filas de bloques (TimeSlots de Lunes como referencia visual)
  const activeBellSchedule = useMemo(() => {
    if (viewMode === "course" && effectiveCourseId) {
      const course = setup.courses.find((c) => c.id === effectiveCourseId);
      if (course) {
        return setup.bellSchedules.find((b) => b.id === course.bellScheduleId) ?? setup.bellSchedules[0];
      }
    }
    return setup.bellSchedules[0];
  }, [viewMode, effectiveCourseId, setup.courses, setup.bellSchedules]);

  const rowSlots: TimeSlotDTO[] = useMemo(() => {
    if (!activeBellSchedule) return [];
    const byKey = new Map<string, TimeSlotDTO>();
    for (const s of activeBellSchedule.timeSlots) {
      const key = `${s.slotType}:${s.blockNumber}`;
      if (!byKey.has(key) || s.dayOfWeek === 1) {
        byKey.set(key, s);
      }
    }
    return Array.from(byKey.values()).sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );
  }, [activeBellSchedule]);

  const slotLookupByDayBlock = useMemo(() => {
    const map = new Map<string, TimeSlotDTO>();
    if (!activeBellSchedule) return map;
    for (const s of activeBellSchedule.timeSlots) {
      if (s.slotType === "CLASS") {
        map.set(`${s.dayOfWeek}:${s.blockNumber}`, s);
      }
    }
    return map;
  }, [activeBellSchedule]);

  const filteredEntries = useMemo(() => {
    if (!versionDetail) return [];
    if (viewMode === "course") {
      return versionDetail.entries.filter(
        (e) => e.courseSubject.courseId === effectiveCourseId
      );
    }
    if (viewMode === "teacher") {
      return versionDetail.entries.filter((e) =>
        e.courseSubject.teachers.some((t) => t.teacherId === effectiveTeacherId)
      );
    }
    if (viewMode === "room") {
      return versionDetail.entries.filter((e) => e.roomId === effectiveRoomId);
    }
    return versionDetail.entries;
  }, [
    versionDetail,
    viewMode,
    effectiveCourseId,
    effectiveTeacherId,
    effectiveRoomId,
  ]);

  const entriesByDayBlock = useMemo(() => {
    const map = new Map<string, ScheduleEntryDTO[]>();
    for (const entry of filteredEntries) {
      const key = `${entry.timeSlot.dayOfWeek}:${entry.timeSlot.blockNumber}`;
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return map;
  }, [filteredEntries]);

  const syncGroupSlotMap = useMemo(() => {
    const map = new Map<string, ScheduleEntryDTO[]>();
    if (!versionDetail) return map;
    for (const entry of versionDetail.entries) {
      const code = entry.courseSubject.syncGroupCode;
      if (!code) continue;
      const key = `${code}:${entry.timeSlot.dayOfWeek}:${entry.timeSlot.blockNumber}`;
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return map;
  }, [versionDetail]);

  const handleToggleLock = async (entry: ScheduleEntryDTO) => {
    if (!versionDetail) return;
    setBusy(true);
    try {
      const res = await fetch(withBasePath(`/api/horarios/versions/${versionDetail.id}/changes`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: entry.isLocked ? "UNLOCK" : "LOCK",
          entryId: entry.id,
          expectedLockNumber: versionDetail.versionLockNumber,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "No se pudo cambiar el candado.");
      }
      await onVersionMutated();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "Error al fijar bloque.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDropOnCell = async (dayOfWeek: number, blockNumber: number) => {
    if (!draggedEntryId || !versionDetail) return;
    const sourceEntry = versionDetail.entries.find((e) => e.id === draggedEntryId);
    setDraggedEntryId(null);
    if (!sourceEntry || sourceEntry.isLocked) return;

    const targetSlot = slotLookupByDayBlock.get(`${dayOfWeek}:${blockNumber}`);
    if (!targetSlot || targetSlot.id === sourceEntry.timeSlotId) return;

    const targetEntries = entriesByDayBlock.get(`${dayOfWeek}:${blockNumber}`) ?? [];
    const targetEntry = targetEntries[0];

    setBusy(true);
    try {
      const payload =
        targetEntry && !targetEntry.isLocked
          ? {
              action: "SWAP",
              entryAId: sourceEntry.id,
              entryBId: targetEntry.id,
              expectedLockNumber: versionDetail.versionLockNumber,
            }
          : {
              action: "MOVE",
              entryId: sourceEntry.id,
              targetTimeSlotId: targetSlot.id,
              expectedLockNumber: versionDetail.versionLockNumber,
            };

      const res = await fetch(withBasePath(`/api/horarios/versions/${versionDetail.id}/changes`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo mover el bloque.");
      showToast({
        variant: "success",
        title: targetEntry ? "Bloques intercambiados" : "Bloque movido",
        description: "Horario actualizado correctamente.",
      });
      await onVersionMutated();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Movimiento no permitido",
        description: err instanceof Error ? err.message : "Revisa conflictos.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async () => {
    if (!versionDetail) return;
    setBusy(true);
    try {
      const res = await fetch(withBasePath(`/api/horarios/versions/${versionDetail.id}/revert`), {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "No hay cambios para deshacer.");
      showToast({
        variant: "info",
        title: "Cambio revertido",
        description: "Se restauró el estado anterior del horario.",
      });
      await onVersionMutated();
    } catch (err) {
      showToast({
        variant: "error",
        title: "No se pudo revertir",
        description: err instanceof Error ? err.message : "Sin historial reciente.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleExport = (type: "current" | "master" | "bundle") => {
    if (!versionDetail) return;
    let url = `/api/horarios/versions/${versionDetail.id}/export?type=${type}`;
    if (type === "current") {
      if (viewMode === "course" && effectiveCourseId) {
        url = `/api/horarios/versions/${versionDetail.id}/export?type=course&entityId=${effectiveCourseId}`;
      } else if (viewMode === "teacher" && effectiveTeacherId) {
        url = `/api/horarios/versions/${versionDetail.id}/export?type=teacher&entityId=${effectiveTeacherId}`;
      } else if (viewMode === "room" && effectiveRoomId) {
        url = `/api/horarios/versions/${versionDetail.id}/export?type=room&entityId=${effectiveRoomId}`;
      } else {
        url = `/api/horarios/versions/${versionDetail.id}/export?type=master`;
      }
    }
    window.open(withBasePath(url), "_blank");
  };

  // Master grid lookup
  const masterEntriesMap = useMemo(() => {
    const map = new Map<string, ScheduleEntryDTO[]>();
    if (!versionDetail) return map;
    for (const e of versionDetail.entries) {
      if (masterDay !== 0 && e.timeSlot.dayOfWeek !== masterDay) continue;
      if (masterAxis === "courses") {
        const key = `${e.timeSlot.dayOfWeek}:${e.timeSlot.blockNumber}:${e.courseSubject.courseId}`;
        const list = map.get(key) ?? [];
        list.push(e);
        map.set(key, list);
      } else {
        for (const t of e.courseSubject.teachers) {
          const key = `${e.timeSlot.dayOfWeek}:${e.timeSlot.blockNumber}:${t.teacherId}`;
          const list = map.get(key) ?? [];
          list.push(e);
          map.set(key, list);
        }
      }
    }
    return map;
  }, [versionDetail, masterAxis, masterDay]);

  const masterClassSlots = useMemo(
    () => rowSlots.filter((s) => s.slotType === "CLASS"),
    [rowSlots]
  );

  const masterDaysToRender =
    masterDay === 0 ? DAYS_OF_WEEK : DAYS_OF_WEEK.filter((d) => d.value === masterDay);

  return (
    <div className="flex h-full flex-col">
      {/* Barra superior de acciones */}
      <div className="flex items-center justify-between gap-3 border-b bg-background px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <h1 className="whitespace-nowrap text-base font-semibold tracking-tight">
              8. Resultado
            </h1>
            <HelpTip text="Genera la propuesta de horarios y revísala por curso, por docente, por sala o en la sábana maestra. Puedes arrastrar bloques para permutarlos y fijarlos con candado." />
          </div>

          {setup.versions.length > 0 && (
            <Select value={activeVersionId} onValueChange={onSelectVersion}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Versión de horario" />
              </SelectTrigger>
              <SelectContent>
                {setup.versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} ({Math.round(v.fitnessScore)} pts)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {audit && (
            <div className="flex items-center gap-1.5">
              <Badge
                variant={audit.hardCount === 0 ? "secondary" : "destructive"}
                className="gap-1 text-xs font-normal"
              >
                {audit.hardCount === 0 ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-3 w-3" />
                )}
                {audit.hardCount} conflictos
              </Badge>
              <Badge variant="outline" className="font-mono text-xs font-normal">
                Puntaje {Math.round(audit.fitnessScore)}/100
              </Badge>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle color por Asignatura vs Docente */}
          <div className="flex items-center rounded-md border bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setColorBy("subject")}
              className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
                colorBy === "subject"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Palette className="h-3 w-3" />
              Asignatura
            </button>
            <button
              type="button"
              onClick={() => setColorBy("teacher")}
              className={`rounded px-2 py-1 font-medium transition-colors ${
                colorBy === "teacher"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Docente
            </button>
          </div>

          <Button size="sm" variant="outline" onClick={onValidate} disabled={generating}>
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
            Validar
          </Button>

          <Button size="sm" onClick={onGenerate} disabled={generating}>
            {generating ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generar horario
          </Button>

          {versionDetail && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleUndo}
                disabled={busy}
                title="Deshacer último cambio manual"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Exportar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExport("current")}>
                    <FileText className="mr-2 h-4 w-4" />
                    PDF de la vista actual
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("master")}>
                    <LayoutGrid className="mr-2 h-4 w-4" />
                    PDF Sábana Maestra
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("bundle")}>
                    <FileArchive className="mr-2 h-4 w-4" />
                    Paquete completo (ZIP)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {/* Sub-barra de vistas (Por Curso, Por Docente, Por Sala, Sábana Maestra) */}
      <div className="flex items-center justify-between border-b bg-muted/20 px-6 py-2">
        <Tabs
          value={viewMode}
          onValueChange={(v) => setViewMode(v as ResultViewMode)}
        >
          <TabsList className="h-8">
            <TabsTrigger value="course" className="gap-1.5 text-xs">
              <BookOpen className="h-3.5 w-3.5" />
              Por Curso
            </TabsTrigger>
            <TabsTrigger value="teacher" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              Por Docente
            </TabsTrigger>
            <TabsTrigger value="room" className="gap-1.5 text-xs">
              <DoorOpen className="h-3.5 w-3.5" />
              Por Sala
            </TabsTrigger>
            <TabsTrigger value="master" className="gap-1.5 text-xs">
              <LayoutGrid className="h-3.5 w-3.5" />
              Sábana Maestra
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Selector contextual según vista */}
        <div className="flex items-center gap-2">
          {viewMode === "course" && (
            <Select value={effectiveCourseId} onValueChange={setSelectedCourseId}>
              <SelectTrigger className="h-8 w-56 bg-background text-xs">
                <SelectValue placeholder="Selecciona curso" />
              </SelectTrigger>
              <SelectContent>
                {setup.courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {viewMode === "teacher" && (
            <Select value={effectiveTeacherId} onValueChange={setSelectedTeacherId}>
              <SelectTrigger className="h-8 w-64 bg-background text-xs">
                <SelectValue placeholder="Selecciona docente" />
              </SelectTrigger>
              <SelectContent>
                {setup.teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.firstName} {t.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {viewMode === "room" && (
            <Select value={effectiveRoomId} onValueChange={setSelectedRoomId}>
              <SelectTrigger className="h-8 w-56 bg-background text-xs">
                <SelectValue placeholder="Selecciona sala" />
              </SelectTrigger>
              <SelectContent>
                {setup.rooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {viewMode === "master" && (
            <>
              <Select
                value={masterAxis}
                onValueChange={(v) => setMasterAxis(v as MasterAxis)}
              >
                <SelectTrigger className="h-8 w-40 bg-background text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="courses">Columnas: Cursos</SelectItem>
                  <SelectItem value="teachers">Columnas: Docentes</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={String(masterDay)}
                onValueChange={(v) => setMasterDay(Number(v))}
              >
                <SelectTrigger className="h-8 w-40 bg-background text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Toda la semana</SelectItem>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      </div>

      {/* Alertas de precondición si falló validación */}
      {preconditions && !preconditions.ready && (
        <div className="border-b px-6 py-3">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-xs font-semibold">
              Se detectaron {preconditions.issues.length} observaciones antes de generar
            </AlertTitle>
            <AlertDescription className="mt-1 text-xs">
              <ul className="list-disc space-y-0.5 pl-4">
                {preconditions.issues.slice(0, 4).map((iss, idx) => (
                  <li key={idx}>{iss.message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Área de Grilla */}
      <div className="flex-1 overflow-auto p-6">
        {!versionDetail ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/10 p-10 text-center">
            <LayoutGrid className="h-10 w-10 text-muted-foreground/50" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Aún no hay un horario generado</p>
              <p className="text-xs text-muted-foreground">
                Haz clic en &quot;Generar horario&quot; para calcular una propuesta con tus reglas y plan de estudios.
              </p>
            </div>
            <Button size="sm" onClick={onGenerate} disabled={generating}>
              {generating ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1.5 h-4 w-4" />
              )}
              Generar primera propuesta
            </Button>
          </div>
        ) : viewMode !== "master" ? (
          /* Grilla semanal (Por Curso / Por Docente / Por Sala) */
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full table-fixed border-collapse">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="w-28 border-r px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                    Bloque
                  </th>
                  {DAYS_OF_WEEK.map((d) => (
                    <th
                      key={d.value}
                      className="border-r px-3 py-2 text-left text-xs font-semibold last:border-r-0"
                    >
                      {d.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowSlots.map((slot) => {
                  if (slot.slotType !== "CLASS") {
                    return (
                      <tr key={slot.id} className="border-b bg-muted/30">
                        <td
                          colSpan={6}
                          className="px-3 py-1.5 text-center text-[11px] font-medium text-muted-foreground"
                        >
                          {slot.slotType === "LUNCH" ? "Almuerzo" : "Recreo"} ·{" "}
                          {slot.startTime} – {slot.endTime} ({slot.durationMinutes} min)
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={slot.id} className="border-b last:border-b-0">
                      <td className="border-r bg-muted/15 px-3 py-2 align-top">
                        <div className="text-xs font-semibold">Bloque {slot.blockNumber}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {slot.startTime}–{slot.endTime}
                        </div>
                      </td>
                      {DAYS_OF_WEEK.map((day) => {
                        const cellEntries =
                          entriesByDayBlock.get(`${day.value}:${slot.blockNumber}`) ?? [];
                        return (
                          <td
                            key={day.value}
                            onDragOver={(e) => {
                              if (viewMode === "course") e.preventDefault();
                            }}
                            onDrop={() => {
                              if (viewMode === "course") {
                                handleDropOnCell(day.value, slot.blockNumber);
                              }
                            }}
                            className="h-20 border-r p-1.5 align-top last:border-r-0"
                          >
                            {cellEntries.length === 0 ? (
                              <div className="h-full w-full rounded-md border border-dashed border-transparent transition-colors hover:border-border" />
                            ) : (
                              <div className="space-y-1">
                                {(() => {
                                  // En "Por Curso", colapsar las clases del mismo grupo sincronizado en una sola tarjeta
                                  const itemsToRender: Array<
                                    | { kind: "single"; entry: ScheduleEntryDTO }
                                    | {
                                        kind: "syncGroup";
                                        syncGroupCode: string;
                                        entries: ScheduleEntryDTO[];
                                      }
                                  > = [];

                                  if (viewMode === "course") {
                                    const seenGroups = new Set<string>();
                                    for (const entry of cellEntries) {
                                      const code = entry.courseSubject.syncGroupCode;
                                      if (code) {
                                        if (seenGroups.has(code)) continue;
                                        seenGroups.add(code);
                                        const groupEntries = cellEntries.filter(
                                          (e) => e.courseSubject.syncGroupCode === code
                                        );
                                        itemsToRender.push({
                                          kind: "syncGroup",
                                          syncGroupCode: code,
                                          entries: groupEntries,
                                        });
                                      } else {
                                        itemsToRender.push({ kind: "single", entry });
                                      }
                                    }
                                  } else {
                                    for (const entry of cellEntries) {
                                      itemsToRender.push({ kind: "single", entry });
                                    }
                                  }

                                  return itemsToRender.map((item) => {
                                    if (item.kind === "syncGroup") {
                                      const rep = item.entries[0];
                                      const allGroupEntries =
                                        syncGroupSlotMap.get(
                                          `${item.syncGroupCode}:${day.value}:${slot.blockNumber}`
                                        ) ?? item.entries;
                                      const parallelOptions = groupSyncEntries(
                                        allGroupEntries,
                                        colorBy
                                      );
                                      const anyLocked = item.entries.some((e) => e.isLocked);
                                      const anyConflict = item.entries.some((e) =>
                                        conflictEntryIds.has(e.id)
                                      );

                                      return (
                                        <HoverCard
                                          key={`sync-${item.syncGroupCode}`}
                                          openDelay={120}
                                          closeDelay={80}
                                        >
                                          <HoverCardTrigger asChild>
                                            <div
                                              draggable={!anyLocked}
                                              onDragStart={() => setDraggedEntryId(rep.id)}
                                              onDragEnd={() => setDraggedEntryId(null)}
                                              style={{
                                                borderLeftColor: SYNC_ACCENT_COLOR,
                                                backgroundColor: `${SYNC_ACCENT_COLOR}14`,
                                              }}
                                              className={`group relative rounded-md border border-l-4 px-2 py-1.5 text-xs transition-shadow hover:shadow-xs ${
                                                anyConflict
                                                  ? "ring-2 ring-destructive"
                                                  : "border-indigo-500/30"
                                              } ${
                                                !anyLocked
                                                  ? "cursor-grab active:cursor-grabbing"
                                                  : ""
                                              }`}
                                            >
                                              <div className="flex items-start justify-between gap-1">
                                                <div className="min-w-0 flex-1">
                                                  <div className="flex items-center gap-1 font-semibold leading-tight">
                                                    {!anyLocked && (
                                                      <GripVertical className="h-3 w-3 shrink-0 opacity-40" />
                                                    )}
                                                    <Layers className="h-3 w-3 shrink-0 text-indigo-600 dark:text-indigo-400" />
                                                    <span className="truncate">
                                                      {item.syncGroupCode}
                                                    </span>
                                                  </div>
                                                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                                    {parallelOptions.length}{" "}
                                                    {parallelOptions.length === 1
                                                      ? "clase sincronizada"
                                                      : "clases en paralelo"}
                                                  </div>
                                                </div>
                                                <button
                                                  type="button"
                                                  onClick={() => handleToggleLock(rep)}
                                                  disabled={busy}
                                                  title={
                                                    anyLocked
                                                      ? "Desbloquear grupo"
                                                      : "Fijar grupo (candado)"
                                                  }
                                                  className={`shrink-0 rounded p-0.5 transition-opacity ${
                                                    anyLocked
                                                      ? "text-foreground opacity-100"
                                                      : "text-muted-foreground opacity-0 group-hover:opacity-100"
                                                  }`}
                                                >
                                                  {anyLocked ? (
                                                    <Lock className="h-3 w-3" />
                                                  ) : (
                                                    <Unlock className="h-3 w-3" />
                                                  )}
                                                </button>
                                              </div>
                                            </div>
                                          </HoverCardTrigger>
                                          <SyncGroupHoverDetail
                                            syncGroupCode={item.syncGroupCode}
                                            entries={allGroupEntries}
                                            colorBy={colorBy}
                                          />
                                        </HoverCard>
                                      );
                                    }

                                    const entry = item.entry;
                                    const color = getEntryColor(entry, colorBy);
                                    const hasConflict = conflictEntryIds.has(entry.id);
                                    const syncCode = entry.courseSubject.syncGroupCode;
                                    const cardEl = (
                                      <div
                                        key={entry.id}
                                        draggable={viewMode === "course" && !entry.isLocked}
                                        onDragStart={() => setDraggedEntryId(entry.id)}
                                        onDragEnd={() => setDraggedEntryId(null)}
                                        style={{
                                          borderLeftColor: color,
                                          backgroundColor: `${color}14`,
                                        }}
                                        className={`group relative rounded-md border border-l-4 px-2 py-1.5 text-xs transition-shadow hover:shadow-xs ${
                                          hasConflict
                                            ? "ring-2 ring-destructive"
                                            : "border-border/70"
                                        } ${
                                          viewMode === "course" && !entry.isLocked
                                            ? "cursor-grab active:cursor-grabbing"
                                            : ""
                                        }`}
                                      >
                                        <div className="flex items-start justify-between gap-1">
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1 font-semibold leading-tight">
                                              {viewMode === "course" && !entry.isLocked && (
                                                <GripVertical className="h-3 w-3 shrink-0 opacity-40" />
                                              )}
                                              <span className="truncate">
                                                {entry.courseSubject.subject.name}
                                              </span>
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                                              <span className="truncate">
                                                {viewMode === "course" &&
                                                  `${getTeacherLabel(entry)} · ${entry.room.name}`}
                                                {viewMode === "teacher" &&
                                                  `${entry.courseSubject.course.name} · ${entry.room.name}`}
                                                {viewMode === "room" &&
                                                  `${entry.courseSubject.course.name} · ${getTeacherLabel(entry)}`}
                                              </span>
                                            </div>
                                            {syncCode && viewMode !== "course" && (
                                              <div className="mt-1 inline-flex items-center gap-1 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">
                                                <Layers className="h-2.5 w-2.5" />
                                                {syncCode}
                                              </div>
                                            )}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => handleToggleLock(entry)}
                                            disabled={busy}
                                            title={
                                              entry.isLocked
                                                ? "Desbloquear bloque"
                                                : "Fijar bloque (candado)"
                                            }
                                            className={`shrink-0 rounded p-0.5 transition-opacity ${
                                              entry.isLocked
                                                ? "text-foreground opacity-100"
                                                : "text-muted-foreground opacity-0 group-hover:opacity-100"
                                            }`}
                                          >
                                            {entry.isLocked ? (
                                              <Lock className="h-3 w-3" />
                                            ) : (
                                              <Unlock className="h-3 w-3" />
                                            )}
                                          </button>
                                        </div>
                                      </div>
                                    );

                                    if (syncCode) {
                                      const allGroupEntries =
                                        syncGroupSlotMap.get(
                                          `${syncCode}:${day.value}:${slot.blockNumber}`
                                        ) ?? [entry];
                                      return (
                                        <HoverCard
                                          key={entry.id}
                                          openDelay={120}
                                          closeDelay={80}
                                        >
                                          <HoverCardTrigger asChild>{cardEl}</HoverCardTrigger>
                                          <SyncGroupHoverDetail
                                            syncGroupCode={syncCode}
                                            entries={allGroupEntries}
                                            colorBy={colorBy}
                                          />
                                        </HoverCard>
                                      );
                                    }

                                    return cardEl;
                                  });
                                })()}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Sábana Maestra */
          <div className="overflow-auto rounded-lg border bg-card">
            <table className="w-max min-w-full border-collapse text-xs">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="sticky left-0 z-10 w-28 border-r bg-muted/90 px-3 py-2 text-left font-semibold">
                    Día / Bloque
                  </th>
                  {masterAxis === "courses"
                    ? setup.courses.map((c) => (
                        <th
                          key={c.id}
                          className="min-w-36 border-r px-2.5 py-2 text-left font-semibold last:border-r-0"
                        >
                          {c.name}
                        </th>
                      ))
                    : setup.teachers.map((t) => (
                        <th
                          key={t.id}
                          className="min-w-36 border-r px-2.5 py-2 text-left font-semibold last:border-r-0"
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: t.colorHex }}
                            />
                            <span className="truncate">
                              {t.firstName[0]}. {t.lastName}
                            </span>
                          </div>
                        </th>
                      ))}
                </tr>
              </thead>
              <tbody>
                {masterDaysToRender.map((day) =>
                  masterClassSlots.map((slot) => (
                    <tr
                      key={`${day.value}-${slot.blockNumber}`}
                      className="border-b last:border-b-0"
                    >
                      <td className="sticky left-0 z-10 border-r bg-muted/30 px-3 py-1.5 font-medium">
                        <div>
                          {day.short} B{slot.blockNumber}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {slot.startTime}
                        </div>
                      </td>
                      {(masterAxis === "courses" ? setup.courses : setup.teachers).map(
                        (col) => {
                          const entries =
                            masterEntriesMap.get(
                              `${day.value}:${slot.blockNumber}:${col.id}`
                            ) ?? [];
                          const first = entries[0];
                          if (!first) {
                            return (
                              <td
                                key={col.id}
                                className="border-r px-2 py-1.5 text-center text-muted-foreground/30 last:border-r-0"
                              >
                                —
                              </td>
                            );
                          }
                          const syncCode = first.courseSubject.syncGroupCode;
                          const isGroupedMaster = masterAxis === "courses" && Boolean(syncCode);
                          const allGroupEntries = syncCode
                            ? syncGroupSlotMap.get(
                                `${syncCode}:${day.value}:${slot.blockNumber}`
                              ) ?? entries
                            : entries;
                          const parallelCount = syncCode
                            ? groupSyncEntries(allGroupEntries, colorBy).length
                            : entries.length;
                          const color = isGroupedMaster
                            ? SYNC_ACCENT_COLOR
                            : getEntryColor(first, colorBy);

                          const cellCard = (
                            <div
                              style={{
                                borderLeftColor: color,
                                backgroundColor: `${color}16`,
                              }}
                              className="rounded border-l-3 px-2 py-1"
                            >
                              <div className="flex items-center gap-1 truncate font-semibold">
                                {isGroupedMaster && (
                                  <Layers className="h-3 w-3 shrink-0 text-indigo-600 dark:text-indigo-400" />
                                )}
                                <span className="truncate">
                                  {isGroupedMaster
                                    ? syncCode
                                    : first.courseSubject.subject.code}
                                </span>
                              </div>
                              <div className="truncate text-[10px] text-muted-foreground">
                                {isGroupedMaster
                                  ? `${parallelCount} en paralelo`
                                  : masterAxis === "courses"
                                    ? getTeacherLabel(first)
                                    : first.courseSubject.course.name}
                              </div>
                            </div>
                          );

                          return (
                            <td key={col.id} className="border-r p-1 last:border-r-0">
                              {syncCode ? (
                                <HoverCard openDelay={120} closeDelay={80}>
                                  <HoverCardTrigger asChild>{cellCard}</HoverCardTrigger>
                                  <SyncGroupHoverDetail
                                    syncGroupCode={syncCode}
                                    entries={allGroupEntries}
                                    colorBy={colorBy}
                                  />
                                </HoverCard>
                              ) : (
                                cellCard
                              )}
                            </td>
                          );
                        }
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
