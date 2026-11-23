"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  GripVertical,
  Lock,
  RotateCcw,
  Trash2,
  Unlock,
  Users,
  DoorOpen,
  BookOpen,
  LayoutGrid,
} from "lucide-react";
import { DAYS_OF_WEEK, ACTIVITY_TYPE_LABELS } from "@/lib/scheduling/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type {
  ConflictAuditResult,
  ScheduleEntryDTO,
  ScheduleVersionDetailDTO,
  SchoolSetupPayload,
  TimeSlotDTO,
} from "./types";

interface ScheduleGridViewProps {
  setup: SchoolSetupPayload;
  version: ScheduleVersionDetailDTO;
  audit: ConflictAuditResult;
  onVersionMutated: () => Promise<void>;
}

type GridViewMode = "course" | "teacher" | "room" | "master";
type MasterMode = "courses" | "teachers";

interface GroupedSyncSubject {
  key: string;
  subjectName: string;
  leadColorHex: string;
  teacherNames: string;
  courseNames: string[];
  roomNames: string[];
}

function groupSyncEntries(entries: ScheduleEntryDTO[]): GroupedSyncSubject[] {
  const map = new Map<string, GroupedSyncSubject>();
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
      const lead = item.courseSubject.teachers[0]?.teacher;
      const teacherNames = item.courseSubject.teachers
        .map((t) => `${t.teacher.firstName} ${t.teacher.lastName}`)
        .join(" + ");
      map.set(key, {
        key,
        subjectName: item.courseSubject.subject.name,
        leadColorHex: lead?.colorHex || "#0353A4",
        teacherNames: teacherNames || "Sin docente",
        courseNames: [item.courseSubject.course.name],
        roomNames: [item.room.name],
      });
    }
  }
  return Array.from(map.values());
}

export function ScheduleGridView({
  setup,
  version,
  audit,
  onVersionMutated,
}: ScheduleGridViewProps) {
  const { showToast } = useToast();
  const [viewMode, setViewMode] = useState<GridViewMode>("course");
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    setup.courses[0]?.id ?? ""
  );
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    setup.teachers[0]?.id ?? ""
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string>(
    setup.rooms[0]?.id ?? ""
  );
  const [masterMode, setMasterMode] = useState<MasterMode>("courses");
  const [masterDay, setMasterDay] = useState<number>(0); // 0 = Toda la semana
  const [highlightedTeacherId, setHighlightedTeacherId] = useState<string | null>(null);
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hoveredSync, setHoveredSync] = useState<{
    syncGroupCode: string;
    entries: ScheduleEntryDTO[];
    rect: { left: number; top: number; bottom: number; width: number };
  } | null>(null);

  const conflictEntryIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of audit.hardConflicts) {
      c.entryIds.forEach((id) => set.add(id));
    }
    return set;
  }, [audit]);

  const syncGroupSlotMap = useMemo(() => {
    const map = new Map<string, ScheduleEntryDTO[]>();
    for (const e of version.entries) {
      const code = e.courseSubject.syncGroupCode;
      if (!code) continue;
      const key = `${code}:${e.timeSlot.dayOfWeek}:${e.timeSlot.blockNumber}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [version.entries]);

  const getSyncGroupEntries = (entry: ScheduleEntryDTO): ScheduleEntryDTO[] => {
    const code = entry.courseSubject.syncGroupCode;
    if (!code) return [entry];
    const key = `${code}:${entry.timeSlot.dayOfWeek}:${entry.timeSlot.blockNumber}`;
    return syncGroupSlotMap.get(key) ?? [entry];
  };

  const handleSyncMouseEnter = (
    e: React.MouseEvent<HTMLElement>,
    entry: ScheduleEntryDTO
  ) => {
    const code = entry.courseSubject.syncGroupCode;
    if (!code) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredSync({
      syncGroupCode: code,
      entries: getSyncGroupEntries(entry),
      rect: {
        left: rect.left,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
      },
    });
  };

  const handleSyncMouseLeave = () => {
    setHoveredSync(null);
  };

  // Determinar la jornada de referencia para las filas
  const referenceBell = useMemo(() => {
    if (viewMode === "course") {
      const course = setup.courses.find((c) => c.id === selectedCourseId);
      if (course) {
        return setup.bellSchedules.find((b) => b.id === course.bellScheduleId) ?? setup.bellSchedules[0];
      }
    }
    return setup.bellSchedules[0];
  }, [viewMode, selectedCourseId, setup.courses, setup.bellSchedules]);

  const day1Slots: TimeSlotDTO[] = useMemo(() => {
    if (!referenceBell) return [];
    let bestDay = 1;
    let bestCount = -1;
    for (const d of DAYS_OF_WEEK) {
      const count = referenceBell.timeSlots.filter(
        (s) => s.dayOfWeek === d.value && s.slotType === "CLASS"
      ).length;
      if (count > bestCount) {
        bestCount = count;
        bestDay = d.value;
      }
    }
    return referenceBell.timeSlots
      .filter((s) => s.dayOfWeek === bestDay)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [referenceBell]);

  const activeMaxBlock = useMemo(() => {
    const maxEntryBlock = version.entries.reduce(
      (max, e) => Math.max(max, e.timeSlot.blockNumber),
      0
    );
    const maxActBlock = version.nonTeachingActivities.reduce(
      (max, a) => Math.max(max, a.timeSlot.blockNumber),
      0
    );
    return Math.max(maxEntryBlock, maxActBlock, 6);
  }, [version.entries, version.nonTeachingActivities]);

  const masterClassBlocks = useMemo(() => {
    const nums = day1Slots
      .filter((s) => s.slotType === "CLASS" && s.blockNumber <= activeMaxBlock)
      .map((s) => s.blockNumber);
    return nums.length > 0 ? nums : [1, 2, 3, 4, 5, 6];
  }, [day1Slots, activeMaxBlock]);

  const masterVisibleSlots = useMemo(() => {
    const lastClassIdx = day1Slots.reduce(
      (last, s, idx) =>
        s.slotType === "CLASS" && s.blockNumber <= activeMaxBlock ? idx : last,
      -1
    );
    return lastClassIdx >= 0 ? day1Slots.slice(0, lastClassIdx + 1) : day1Slots;
  }, [day1Slots, activeMaxBlock]);

  const findSlotId = (day: number, blockNumber: number): string | undefined => {
    return referenceBell?.timeSlots.find(
      (s) => s.dayOfWeek === day && s.blockNumber === blockNumber && s.slotType === "CLASS"
    )?.id;
  };

  const handleToggleLock = async (
    entry: ScheduleEntryDTO,
    currentlyLocked = entry.isLocked
  ) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/horarios/versions/${version.id}/changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedLockNumber: version.versionLockNumber,
          change: {
            actionType: currentlyLocked ? "UNLOCK" : "LOCK",
            entryAId: entry.id,
          },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({
          variant: "error",
          title: res.status === 409 ? "Conflicto de edición concurrente" : "Error",
          description: data.error || "No se pudo actualizar el candado.",
        });
        return;
      }
      await onVersionMutated();
    } finally {
      setBusy(false);
    }
  };

  const handleDropOnCell = async (
    targetEntry: ScheduleEntryDTO | null,
    targetTimeSlotId: string | undefined
  ) => {
    if (!draggedEntryId || !targetTimeSlotId) return;
    if (targetEntry && targetEntry.id === draggedEntryId) return;

    const draggedEntry = version.entries.find((e) => e.id === draggedEntryId);
    if (!draggedEntry) return;

    const draggedGroup = getSyncGroupEntries(draggedEntry);
    const targetGroup = targetEntry ? getSyncGroupEntries(targetEntry) : [];
    if (
      targetEntry &&
      draggedGroup.some((e) => targetGroup.some((t) => t.id === e.id))
    ) {
      setDraggedEntryId(null);
      return;
    }

    const isDraggedLocked = draggedGroup.some((e) => e.isLocked);
    const isTargetLocked = targetGroup.some((e) => e.isLocked);
    if (isDraggedLocked || isTargetLocked) {
      showToast({
        variant: "error",
        title: "Bloque fijado",
        description: "Desbloquea el candado antes de mover o permutar este bloque.",
      });
      setDraggedEntryId(null);
      return;
    }

    const involvesSyncGroup =
      Boolean(draggedEntry.courseSubject.syncGroupCode) ||
      Boolean(targetEntry?.courseSubject.syncGroupCode);

    setBusy(true);
    try {
      const mode = targetEntry ? "SWAP" : "MOVE";
      // 1. Simular impacto primero con simulateSwap
      const simRes = await fetch(`/api/horarios/versions/${version.id}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          entryAId: draggedEntryId,
          entryBId: targetEntry?.id,
          targetTimeSlotId,
        }),
      });
      const sim = (await simRes.json()) as {
        valid: boolean;
        deltaFitness: number;
        newHardConflicts: Array<{ message: string }>;
        error?: string;
      };

      if (!simRes.ok) {
        showToast({ variant: "error", title: "Error de simulación", description: sim.error || "Error" });
        return;
      }

      const hasNewConflicts = !sim.valid && sim.newHardConflicts.length > 0;

      // 2. Aplicar cambio con Optimistic Locking (permite mover aun con conflictos, avisando al usuario)
      const applyRes = await fetch(`/api/horarios/versions/${version.id}/changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedLockNumber: version.versionLockNumber,
          change: {
            actionType: mode,
            entryAId: draggedEntryId,
            entryBId: targetEntry?.id,
            targetTimeSlotId,
          },
        }),
      });
      const applyData = (await applyRes.json()) as { error?: string };
      if (!applyRes.ok) {
        showToast({
          variant: "error",
          title: applyRes.status === 409 ? "Conflicto de concurrencia" : "Error",
          description: applyData.error || "No se pudo aplicar el cambio.",
        });
        return;
      }

      if (hasNewConflicts) {
        showToast({
          variant: "error",
          title:
            sim.newHardConflicts.length > 1
              ? `Movimiento aplicado con ${sim.newHardConflicts.length} conflictos`
              : "Movimiento aplicado con conflicto",
          description: sim.newHardConflicts[0].message,
        });
      } else {
        showToast({
          variant: "success",
          title: involvesSyncGroup
            ? mode === "SWAP"
              ? "Grupo sincronizado intercambiado"
              : "Grupo sincronizado reubicado"
            : mode === "SWAP"
              ? "Bloques intercambiados"
              : "Bloque reubicado",
          description: `Impacto en fitness: ${sim.deltaFitness >= 0 ? "+" : ""}${sim.deltaFitness} pts.`,
        });
      }
      await onVersionMutated();
    } finally {
      setDraggedEntryId(null);
      setBusy(false);
    }
  };

  const handleUndoLast = async () => {
    const lastLog = version.changeLogs[0];
    if (!lastLog) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/horarios/versions/${version.id}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId: lastLog.id }),
      });
      if (res.ok) {
        showToast({
          variant: "info",
          title: "Cambio revertido",
          description: "Se restauró el estado previo del horario.",
        });
        await onVersionMutated();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleClearSchedule = async () => {
    if (version.entries.length === 0 && version.nonTeachingActivities.length === 0) return;
    const confirmed = window.confirm(
      "¿Seguro que deseas limpiar el horario completo de esta versión? Se eliminarán todos los bloques asignados y actividades no lectivas."
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/horarios/versions/${version.id}/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedLockNumber: version.versionLockNumber }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({
          variant: "error",
          title: res.status === 409 ? "Conflicto de edición concurrente" : "Error",
          description: data.error || "No se pudo limpiar el horario.",
        });
        return;
      }
      setHighlightedTeacherId(null);
      setHoveredSync(null);
      showToast({
        variant: "info",
        title: "Horario limpiado",
        description: "Se eliminaron todos los bloques del horario de esta versión.",
      });
      await onVersionMutated();
    } finally {
      setBusy(false);
    }
  };

  const filteredEntries = useMemo(() => {
    if (viewMode === "course") {
      return version.entries.filter((e) => e.courseSubject.courseId === selectedCourseId);
    }
    if (viewMode === "teacher") {
      return version.entries.filter((e) =>
        e.courseSubject.teachers.some((t) => t.teacherId === selectedTeacherId)
      );
    }
    if (viewMode === "room") {
      return version.entries.filter((e) => e.roomId === selectedRoomId);
    }
    return version.entries;
  }, [viewMode, version.entries, selectedCourseId, selectedTeacherId, selectedRoomId]);

  const teacherActivities = useMemo(() => {
    if (viewMode !== "teacher") return [];
    return version.nonTeachingActivities.filter((a) => a.teacherId === selectedTeacherId);
  }, [viewMode, version.nonTeachingActivities, selectedTeacherId]);

  return (
    <div className="space-y-4">
      {/* Barra de controles de vista */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant={viewMode === "course" ? "default" : "secondary"}
            onClick={() => setViewMode("course")}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Por Curso
          </Button>
          <Button
            size="sm"
            variant={viewMode === "teacher" ? "default" : "secondary"}
            onClick={() => setViewMode("teacher")}
          >
            <Users className="h-3.5 w-3.5" />
            Por Profesor
          </Button>
          <Button
            size="sm"
            variant={viewMode === "room" ? "default" : "secondary"}
            onClick={() => setViewMode("room")}
          >
            <DoorOpen className="h-3.5 w-3.5" />
            Por Sala
          </Button>
          <Button
            size="sm"
            variant={viewMode === "master" ? "default" : "secondary"}
            onClick={() => setViewMode("master")}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Sábana Maestra
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {viewMode === "course" && (
            <select
              aria-label="Seleccionar curso"
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
            >
              {setup.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.bellSchedule.name})
                </option>
              ))}
            </select>
          )}
          {viewMode === "teacher" && (
            <select
              aria-label="Seleccionar docente"
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
            >
              {setup.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.firstName} {t.lastName}
                </option>
              ))}
            </select>
          )}
          {viewMode === "room" && (
            <select
              aria-label="Seleccionar sala"
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
            >
              {setup.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.roomType})
                </option>
              ))}
            </select>
          )}
          {viewMode === "master" && (
            <>
              <div className="inline-flex rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] p-0.5">
                <button
                  type="button"
                  onClick={() => setMasterMode("courses")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    masterMode === "courses"
                      ? "bg-[var(--accent-1)] text-white"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Por Cursos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMasterMode("teachers");
                    if (masterDay === 0) setMasterDay(1);
                  }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    masterMode === "teachers"
                      ? "bg-[var(--accent-1)] text-white"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Por Docentes
                </button>
              </div>

              <select
                value={masterDay}
                onChange={(e) => setMasterDay(Number(e.target.value))}
                className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
              >
                {masterMode === "courses" && (
                  <option value={0}>Toda la semana</option>
                )}
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>

              {highlightedTeacherId && (
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => setHighlightedTeacherId(null)}
                >
                  Limpiar resaltado
                </Button>
              )}
            </>
          )}

          {version.changeLogs.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleUndoLast}
              disabled={busy}
              title="Deshacer último cambio manual"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Deshacer
            </Button>
          )}

          <Button
            size="sm"
            variant="destructive"
            onClick={() => void handleClearSchedule()}
            disabled={
              busy ||
              (version.entries.length === 0 && version.nonTeachingActivities.length === 0)
            }
            title="Limpiar el horario completo de esta versión"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Limpiar horario
          </Button>
        </div>
      </div>

      {/* Grilla semanal (Curso / Profesor / Sala) */}
      {viewMode !== "master" ? (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border-card)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[820px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-28" />
              {DAYS_OF_WEEK.map((day) => (
                <col key={day.value} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)]">
                <th className="p-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Bloque
                </th>
                {DAYS_OF_WEEK.map((day) => (
                  <th
                    key={day.value}
                    className="p-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]"
                  >
                    {day.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {day1Slots.map((slot) => {
                if (slot.slotType !== "CLASS") {
                  return (
                    <tr
                      key={slot.id}
                      className="border-b border-[var(--border-subtle)] bg-sky-500/8"
                    >
                      <td
                        colSpan={6}
                        className="px-3 py-1.5 text-center text-[11px] font-semibold tracking-wider uppercase text-[#0353a4] dark:text-[#87c2fd]"
                      >
                        {slot.slotType === "LUNCH" ? "Almuerzo" : "Recreo"} · {slot.startTime} –{" "}
                        {slot.endTime} ({slot.durationMinutes} min)
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={slot.id}
                    className="border-b border-[var(--border-subtle)] last:border-b-0"
                  >
                    <td className="border-r border-[var(--border-subtle)] p-2.5 align-top bg-[var(--bg-card-subtle)]">
                      <div className="text-xs font-bold text-[var(--text-primary)]">
                        Bloque {slot.blockNumber}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {slot.startTime} – {slot.endTime}
                      </div>
                      {slot.pairGroupId !== null && (
                        <span className="mt-1 inline-block rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-[#0353a4] dark:text-[#87c2fd]">
                          Par {slot.pairGroupId}
                        </span>
                      )}
                    </td>

                    {DAYS_OF_WEEK.map((day) => {
                      const entry = filteredEntries.find(
                        (e) =>
                          e.timeSlot.dayOfWeek === day.value &&
                          e.timeSlot.blockNumber === slot.blockNumber
                      );
                      const activity = teacherActivities.find(
                        (a) =>
                          a.timeSlot.dayOfWeek === day.value &&
                          a.timeSlot.blockNumber === slot.blockNumber
                      );
                      const targetSlotId = findSlotId(day.value, slot.blockNumber);
                      const isSlotAvailable = viewMode !== "course" || Boolean(targetSlotId);
                      const syncGroupCode = entry?.courseSubject.syncGroupCode ?? null;
                      const syncGroupEntries = entry ? getSyncGroupEntries(entry) : [];
                      const isCourseSyncCard = viewMode === "course" && Boolean(syncGroupCode);
                      const syncGroupedCount = isCourseSyncCard
                        ? groupSyncEntries(syncGroupEntries).length
                        : 0;
                      const isGroupLocked = entry
                        ? syncGroupCode
                          ? syncGroupEntries.some((e) => e.isLocked)
                          : entry.isLocked
                        : false;
                      const hasConflict = entry
                        ? syncGroupCode
                          ? syncGroupEntries.some((e) => conflictEntryIds.has(e.id))
                          : conflictEntryIds.has(entry.id)
                        : false;
                      const leadTeacher = entry?.courseSubject.teachers[0]?.teacher;
                      const syncUniqueTeacherCount = isCourseSyncCard
                        ? new Set(
                            syncGroupEntries.flatMap((e) =>
                              e.courseSubject.teachers.map((t) => t.teacherId)
                            )
                          ).size
                        : 0;
                      const syncCourseEntries = isCourseSyncCard
                        ? syncGroupEntries.filter(
                            (e) => e.courseSubject.courseId === selectedCourseId
                          )
                        : [];
                      const syncUniqueRooms = isCourseSyncCard
                        ? Array.from(
                            new Set(
                              (syncCourseEntries.length > 0
                                ? syncCourseEntries
                                : syncGroupEntries
                              ).map((e) => e.room.name)
                            )
                          )
                        : [];
                      const hasCoTeaching = entry
                        ? isCourseSyncCard
                          ? syncGroupEntries.some((e) => e.courseSubject.teachers.length > 1)
                          : entry.courseSubject.teachers.length > 1
                        : false;

                      return (
                        <td
                          key={day.value}
                          onDragOver={(e) => {
                            if (viewMode === "course" && isSlotAvailable) e.preventDefault();
                          }}
                          onDrop={() => {
                            if (viewMode === "course" && isSlotAvailable) {
                              void handleDropOnCell(entry ?? null, targetSlotId);
                            }
                          }}
                          className={`border-r border-[var(--border-subtle)] last:border-r-0 p-1.5 align-top h-24 overflow-hidden transition-colors ${
                            isSlotAvailable
                              ? "hover:bg-[var(--bg-card-subtle)]"
                              : "bg-[var(--bg-card-subtle)]/50"
                          }`}
                        >
                          {entry ? (
                            <div
                              draggable={viewMode === "course" && !isGroupLocked && !busy}
                              onDragStart={() => {
                                setHoveredSync(null);
                                setDraggedEntryId(entry.id);
                              }}
                              onDragEnd={() => setDraggedEntryId(null)}
                              onMouseEnter={(e) => {
                                if (syncGroupCode) handleSyncMouseEnter(e, entry);
                              }}
                              onMouseLeave={() => {
                                if (syncGroupCode) handleSyncMouseLeave();
                              }}
                              style={{
                                borderLeftColor: isCourseSyncCard
                                  ? "#0353A4"
                                  : leadTeacher?.colorHex || "#0353A4",
                              }}
                              className={`group relative flex h-full flex-col justify-between rounded-none border border-l-4 p-2 text-xs transition-all ${
                                hasConflict
                                  ? "border-red-500/60 bg-red-500/10"
                                  : "border-[var(--border-card)] bg-[var(--bg-card)] hover:border-sky-500/50"
                              } ${viewMode === "course" && !isGroupLocked ? "cursor-grab active:cursor-grabbing" : ""}`}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <div className="min-w-0">
                                  <div className="font-bold text-[var(--text-primary)] truncate">
                                    {isCourseSyncCard
                                      ? syncGroupCode
                                      : entry.courseSubject.subject.name}
                                  </div>
                                  <div className="text-[11px] text-[var(--text-secondary)] truncate">
                                    {isCourseSyncCard
                                      ? `${syncGroupedCount} ${
                                          syncGroupedCount === 1 ? "asignatura" : "asignaturas"
                                        } · ${syncUniqueTeacherCount} ${
                                          syncUniqueTeacherCount === 1 ? "docente" : "docentes"
                                        }`
                                      : viewMode === "course"
                                        ? entry.courseSubject.teachers
                                            .map((t) => `${t.teacher.firstName[0]}. ${t.teacher.lastName}`)
                                            .join(" + ")
                                        : entry.courseSubject.course.name}
                                  </div>
                                </div>

                                <div className="flex items-center gap-0.5 shrink-0">
                                  {viewMode === "course" && !isGroupLocked && (
                                    <GripVertical className="h-3.5 w-3.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100" />
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void handleToggleLock(entry, isGroupLocked)}
                                    title={
                                      isGroupLocked
                                        ? isCourseSyncCard
                                          ? "Desbloquear grupo sincronizado"
                                          : "Desbloquear bloque"
                                        : isCourseSyncCard
                                          ? "Fijar grupo sincronizado (no cambiar al regenerar)"
                                          : "Fijar bloque (no cambiar al regenerar)"
                                    }
                                    className={`rounded p-0.5 transition-colors cursor-pointer ${
                                      isGroupLocked
                                        ? "text-amber-500"
                                        : "text-[var(--text-muted)] opacity-60 hover:opacity-100"
                                    }`}
                                  >
                                    {isGroupLocked ? (
                                      <Lock className="h-3.5 w-3.5" />
                                    ) : (
                                      <Unlock className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              </div>

                              <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[10px] text-[var(--text-muted)]">
                                <span className="truncate">
                                  {isCourseSyncCard
                                    ? syncUniqueRooms.length === 1
                                      ? syncUniqueRooms[0]
                                      : `${syncUniqueRooms.length} salas`
                                    : entry.room.name}
                                </span>
                                <div className="flex items-center gap-1">
                                  {syncGroupCode && (
                                    <span className="rounded bg-sky-500/15 px-1 py-0.5 font-semibold text-[#0353a4] dark:text-[#87c2fd]">
                                      SYNC
                                    </span>
                                  )}
                                  {hasCoTeaching && (
                                    <span className="rounded bg-orange-500/15 px-1 py-0.5 font-semibold text-orange-400">
                                      PIE/CO
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : activity ? (
                            <div className="flex h-full flex-col justify-between rounded-none border border-amber-500/35 bg-amber-500/10 p-2 text-xs">
                              <div>
                                <div className="font-bold text-amber-700 dark:text-amber-300 truncate">
                                  {activity.title}
                                </div>
                                <div className="text-[10px] text-amber-700/80 dark:text-amber-300/80">
                                  {ACTIVITY_TYPE_LABELS[activity.activityType]}
                                </div>
                              </div>
                              <span className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400">
                                No lectivo
                              </span>
                            </div>
                          ) : !isSlotAvailable ? (
                            <div className="flex h-full items-center justify-center text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]/50 select-none">
                              Sin jornada
                            </div>
                          ) : (
                            <div className="flex h-full items-center justify-center rounded-none border border-dashed border-transparent text-[11px] text-[var(--text-muted)]/40 hover:border-[var(--border-card)]">
                              Libre
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
      ) : masterMode === "courses" ? (
        /* Sábana Maestra — Modo Cursos (Filas = Días y Bloques, Columnas = Cursos de ancho uniforme) */
        <div className="overflow-x-auto rounded-2xl border border-[var(--border-card)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)]">
          <table
            className="w-full table-fixed border-collapse text-left"
            style={{ minWidth: `${136 + setup.courses.length * 165}px` }}
          >
            <colgroup>
              <col className="w-36" />
              {setup.courses.map((course) => (
                <col key={course.id} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)]">
                <th className="sticky left-0 z-20 border-r border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Día / Bloque
                </th>
                {setup.courses.map((course) => (
                  <th
                    key={course.id}
                    className="border-r border-[var(--border-subtle)] last:border-r-0 p-3 text-xs font-semibold text-[var(--text-primary)]"
                  >
                    <div className="truncate">{course.name}</div>
                    <div className="text-[10px] font-normal text-[var(--text-muted)] truncate">
                      {course.defaultRoom ? course.defaultRoom.name : course.bellSchedule.name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(masterDay === 0
                ? DAYS_OF_WEEK
                : DAYS_OF_WEEK.filter((d) => d.value === masterDay)
              ).map((day) => (
                <React.Fragment key={day.value}>
                  {masterDay === 0 && (
                    <tr className="border-y border-[var(--border-accent)] bg-sky-500/12">
                      <td
                        colSpan={setup.courses.length + 1}
                        className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#0353a4] dark:text-[#87c2fd]"
                      >
                        {day.label}
                      </td>
                    </tr>
                  )}
                  {masterVisibleSlots.map((slot) => {
                    if (slot.slotType !== "CLASS") {
                      return (
                        <tr
                          key={`${day.value}-${slot.id}`}
                          className="border-b border-[var(--border-subtle)] bg-sky-500/5"
                        >
                          <td
                            colSpan={setup.courses.length + 1}
                            className="px-3 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-[#0353a4]/80 dark:text-[#87c2fd]/80"
                          >
                            {slot.slotType === "LUNCH" ? "Almuerzo" : "Recreo"} · {slot.startTime} –{" "}
                            {slot.endTime}
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={`${day.value}-${slot.id}`}
                        className="border-b border-[var(--border-subtle)]"
                      >
                        <td className="sticky left-0 z-10 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 align-top">
                          <div className="text-xs font-bold text-[var(--text-primary)]">
                            {masterDay === 0 ? `${day.short} · ` : ""}B{slot.blockNumber}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {slot.startTime} – {slot.endTime}
                          </div>
                        </td>
                        {setup.courses.map((course) => {
                          const entry = version.entries.find(
                            (e) =>
                              e.courseSubject.courseId === course.id &&
                              e.timeSlot.dayOfWeek === day.value &&
                              e.timeSlot.blockNumber === slot.blockNumber
                          );
                          const syncGroupCode = entry?.courseSubject.syncGroupCode ?? null;
                          const syncGroupEntries = entry ? getSyncGroupEntries(entry) : [];
                          const lead = entry?.courseSubject.teachers[0]?.teacher;
                          const isHighlighted =
                            Boolean(highlightedTeacherId) &&
                            (syncGroupCode
                              ? syncGroupEntries.some((se) =>
                                  se.courseSubject.teachers.some(
                                    (t) => t.teacherId === highlightedTeacherId
                                  )
                                )
                              : entry?.courseSubject.teachers.some(
                                  (t) => t.teacherId === highlightedTeacherId
                                ));
                          const isDimmed = Boolean(highlightedTeacherId) && !isHighlighted;
                          const showRoom =
                            entry &&
                            !syncGroupCode &&
                            (!course.defaultRoomId || entry.roomId !== course.defaultRoomId);

                          return (
                            <td
                              key={course.id}
                              className="border-r border-[var(--border-subtle)] last:border-r-0 p-1 align-top overflow-hidden"
                            >
                              {entry ? (
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() =>
                                    setHighlightedTeacherId(
                                      lead && highlightedTeacherId !== lead.id ? lead.id : null
                                    )
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      setHighlightedTeacherId(
                                        lead && highlightedTeacherId !== lead.id ? lead.id : null
                                      );
                                    }
                                  }}
                                  onMouseEnter={(e) => {
                                    if (syncGroupCode) handleSyncMouseEnter(e, entry);
                                  }}
                                  onMouseLeave={() => {
                                    if (syncGroupCode) handleSyncMouseLeave();
                                  }}
                                  style={{
                                    borderLeftColor: syncGroupCode
                                      ? "#0353A4"
                                      : lead?.colorHex || "#0353A4",
                                  }}
                                  className={`rounded-none border border-l-4 p-1.5 text-[11px] transition-opacity cursor-pointer ${
                                    isHighlighted
                                      ? "border-sky-500 bg-sky-500/15"
                                      : "border-[var(--border-card)] bg-[var(--bg-card)]"
                                  } ${isDimmed ? "opacity-35" : ""}`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-[var(--text-primary)] truncate">
                                      {syncGroupCode ?? entry.courseSubject.subject.code}
                                    </span>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      {syncGroupCode && (
                                        <span className="bg-sky-500/15 px-1 text-[9px] font-semibold text-[#0353a4] dark:text-[#87c2fd]">
                                          SYNC
                                        </span>
                                      )}
                                      {(syncGroupCode
                                        ? syncGroupEntries.some(
                                            (se) => se.courseSubject.teachers.length > 1
                                          )
                                        : entry.courseSubject.teachers.length > 1) && (
                                        <span className="bg-orange-500/15 px-1 text-[9px] font-semibold text-orange-400">
                                          PIE
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="truncate text-[10px] text-[var(--text-secondary)]">
                                    {syncGroupCode
                                      ? `${groupSyncEntries(syncGroupEntries).length} asig.`
                                      : lead
                                        ? `${lead.firstName[0]}. ${lead.lastName}`
                                        : ""}
                                  </div>
                                  {showRoom && (
                                    <div className="truncate text-[9px] text-[var(--text-muted)]">
                                      {entry.room.name}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex h-12 items-center justify-center text-[10px] text-[var(--text-muted)]/35">
                                  —
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Sábana Maestra — Modo Docentes (Filas = Profesores, Columnas = Bloques del día de ancho uniforme) */
        <div className="overflow-x-auto rounded-2xl border border-[var(--border-card)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)]">
          <table
            className="w-full table-fixed border-collapse text-left"
            style={{ minWidth: `${190 + masterClassBlocks.length * 145}px` }}
          >
            <colgroup>
              <col className="w-48" />
              {masterClassBlocks.map((b) => (
                <col key={b} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)]">
                <th className="sticky left-0 z-20 border-r border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Docente ({DAYS_OF_WEEK.find((d) => d.value === (masterDay || 1))?.label})
                </th>
                {masterClassBlocks.map((b) => {
                  const slotMeta = day1Slots.find(
                    (s) => s.slotType === "CLASS" && s.blockNumber === b
                  );
                  return (
                    <th
                      key={b}
                      className="border-r border-[var(--border-subtle)] last:border-r-0 p-2.5 text-xs font-semibold text-[var(--text-primary)]"
                    >
                      <div>Bloque {b}</div>
                      {slotMeta && (
                        <div className="text-[10px] font-normal text-[var(--text-muted)]">
                          {slotMeta.startTime}–{slotMeta.endTime}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {setup.teachers.map((teacher) => {
                const activeDay = masterDay || 1;
                const teacherDayEntries = version.entries.filter(
                  (e) =>
                    e.timeSlot.dayOfWeek === activeDay &&
                    e.courseSubject.teachers.some((t) => t.teacherId === teacher.id)
                );
                const occupiedNums = teacherDayEntries.map((e) => e.timeSlot.blockNumber);
                const minB = occupiedNums.length > 0 ? Math.min(...occupiedNums) : -1;
                const maxB = occupiedNums.length > 0 ? Math.max(...occupiedNums) : -1;

                return (
                  <tr key={teacher.id} className="border-b border-[var(--border-subtle)]">
                    <td className="sticky left-0 z-10 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: teacher.colorHex }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                            {teacher.firstName} {teacher.lastName}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {teacherDayEntries.length} blq hoy
                          </div>
                        </div>
                      </div>
                    </td>
                    {masterClassBlocks.map((b) => {
                      const entry = teacherDayEntries.find((e) => e.timeSlot.blockNumber === b);
                      const activity = version.nonTeachingActivities.find(
                        (a) =>
                          a.teacherId === teacher.id &&
                          a.timeSlot.dayOfWeek === activeDay &&
                          a.timeSlot.blockNumber === b
                      );
                      const isWindow =
                        !entry && !activity && minB !== -1 && b > minB && b < maxB;

                      return (
                        <td
                          key={b}
                          className="border-r border-[var(--border-subtle)] last:border-r-0 p-1 align-top overflow-hidden"
                        >
                          {entry ? (
                            <div
                              style={{ borderLeftColor: teacher.colorHex }}
                              className="rounded-none border border-l-4 border-[var(--border-card)] bg-[var(--bg-card)] p-1.5 text-[11px]"
                            >
                              <div className="font-bold text-[var(--text-primary)] truncate">
                                {entry.courseSubject.course.name}
                              </div>
                              <div className="truncate text-[10px] text-[var(--text-secondary)]">
                                {entry.courseSubject.subject.code} · {entry.room.name}
                              </div>
                            </div>
                          ) : activity ? (
                            <div className="rounded-none border border-amber-500/35 bg-amber-500/10 p-1.5 text-[10px]">
                              <div className="font-bold text-amber-700 dark:text-amber-300 truncate">
                                {activity.title}
                              </div>
                              <div className="text-[9px] text-amber-600 dark:text-amber-400">
                                No lectivo
                              </div>
                            </div>
                          ) : isWindow ? (
                            <div className="flex h-11 items-center justify-center rounded-none border border-dashed border-emerald-500/40 bg-emerald-500/8 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              Ventana
                            </div>
                          ) : (
                            <div className="flex h-11 items-center justify-center text-[10px] text-[var(--text-muted)]/35">
                              —
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
      )}

      {/* Panel inferior: Auditoría en vivo de conflictos y observaciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                {audit.hardCount === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                )}
                Conflictos Duros (HARD)
              </span>
              <Badge variant={audit.hardCount === 0 ? "default" : "outline"}>
                {audit.hardCount}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-56 overflow-y-auto">
            {audit.hardConflicts.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Sin topones de docentes, salas ni cursos. Cumple todas las restricciones duras.
              </p>
            ) : (
              audit.hardConflicts.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-red-500/35 bg-red-500/10 p-2.5 text-xs text-red-700 dark:text-red-300"
                >
                  {c.message}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Observaciones Blandas (SOFT)</span>
              <Badge variant="secondary">{audit.softCount}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-56 overflow-y-auto">
            {audit.softViolations.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Excelente: no hay penalizaciones blandas registradas.
              </p>
            ) : (
              audit.softViolations.slice(0, 12).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-subtle)] p-2.5 text-xs"
                >
                  <span className="text-[var(--text-secondary)]">{c.message}</span>
                  <span className="shrink-0 font-semibold text-amber-500">-{c.penalty}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tooltip flotante para grupos sincronizados */}
      {hoveredSync && (() => {
        const tooltipWidth = 304;
        const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200;
        const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
        const centeredLeft = hoveredSync.rect.left + hoveredSync.rect.width / 2 - tooltipWidth / 2;
        const left = Math.max(12, Math.min(centeredLeft, viewportW - tooltipWidth - 12));
        const showAbove = hoveredSync.rect.top > 220;
        const hasMultipleCourses =
          new Set(hoveredSync.entries.map((e) => e.courseSubject.courseId)).size > 1;
        const groupedEntries = groupSyncEntries(hoveredSync.entries);

        return (
          <div
            role="tooltip"
            style={{
              left,
              width: tooltipWidth,
              ...(showAbove
                ? { bottom: viewportH - hoveredSync.rect.top + 8 }
                : { top: hoveredSync.rect.bottom + 8 }),
            }}
            className="pointer-events-none fixed z-50 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] p-3 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-1.5">
              <span className="truncate text-xs font-bold text-[var(--text-primary)]">
                {hoveredSync.syncGroupCode}
              </span>
              <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#0353a4] dark:text-[#87c2fd]">
                SYNC · {groupedEntries.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {groupedEntries.map((item) => (
                <div key={item.key} className="flex items-start gap-2 text-[11px]">
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.leadColorHex }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="font-semibold text-[var(--text-primary)]">
                        {item.subjectName}
                      </span>
                      {hasMultipleCourses &&
                        item.courseNames.map((courseName) => (
                          <span
                            key={courseName}
                            className="shrink-0 rounded bg-[var(--bg-card-subtle)] px-1 py-0.2 text-[9px] font-medium text-[var(--text-muted)]"
                          >
                            {courseName}
                          </span>
                        ))}
                    </div>
                    <div className="truncate text-[10px] text-[var(--text-secondary)]">
                      {item.teacherNames} · {item.roomNames.join(" / ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
