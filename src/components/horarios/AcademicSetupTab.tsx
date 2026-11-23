"use client";

import React, { useMemo, useState } from "react";
import {
  Clock,
  DoorOpen,
  BookOpen,
  Users,
  GraduationCap,
  Upload,
  Plus,
  Trash2,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  X,
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
  ACTIVITY_TYPE_LABELS,
  DAYS_OF_WEEK,
  LEVEL_LABELS,
  ROOM_TYPE_LABELS,
  calculateLey20903Breakdown,
  extractLey20903Policy,
  formatChronologicalMinutes,
  resolveBlockDurationMinutes,
  resolveTeacherLey20903Ratio,
  type TeacherLey20903Override,
} from "@/lib/scheduling/constants";
import type {
  ScheduleVersionDetailDTO,
  SchoolSetupPayload,
} from "./types";
import type { DryRunImportResult } from "@/services/SchoolSetupService";
import { TeacherColorPicker } from "./TeacherColorPicker";

interface AcademicSetupTabProps {
  setup: SchoolSetupPayload;
  activeVersion: ScheduleVersionDetailDTO | null;
  onRefresh: () => Promise<void>;
}

type SetupSubTab =
  | "bells"
  | "rooms"
  | "subjects"
  | "teachers"
  | "courses"
  | "activities"
  | "import";

const AUTO_COURSE_ROOM_VALUE = "__auto__";
const NO_COURSE_ROOM_VALUE = "__none__";
const DEFAULT_ROOM_CAPACITY = 45;
const LAST_ROOM_CAPACITY_STORAGE_KEY = "edukit:horarios:lastRoomCapacity";

function getSavedRoomCapacity(): number {
  if (typeof window === "undefined") return DEFAULT_ROOM_CAPACITY;
  try {
    const raw = window.localStorage.getItem(LAST_ROOM_CAPACITY_STORAGE_KEY);
    if (!raw) return DEFAULT_ROOM_CAPACITY;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.round(parsed);
    }
  } catch {
    // Ignore storage access errors
  }
  return DEFAULT_ROOM_CAPACITY;
}

function saveRoomCapacity(capacity: number): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(capacity) || capacity < 1) return;
  try {
    window.localStorage.setItem(
      LAST_ROOM_CAPACITY_STORAGE_KEY,
      String(Math.round(capacity))
    );
  } catch {
    // Ignore storage access errors
  }
}

export function AcademicSetupTab({
  setup,
  activeVersion,
  onRefresh,
}: AcademicSetupTabProps) {
  const { showToast } = useToast();
  const [subTab, setSubTab] = useState<SetupSubTab>("teachers");
  const [saving, setSaving] = useState(false);

  // Form states
  const [editingBellId, setEditingBellId] = useState<string | null>(null);
  const [bellName, setBellName] = useState("");
  const [bellStart, setBellStart] = useState("08:00");
  const [bellDuration, setBellDuration] = useState(45);
  const [bellBlocks, setBellBlocks] = useState(8);
  const [bellBlocksByDay, setBellBlocksByDay] = useState<Record<number, number>>({
    1: 8,
    2: 8,
    3: 8,
    4: 8,
    5: 8,
  });
  const [bellBreaks, setBellBreaks] = useState<
    Array<{ afterBlock: number; durationMinutes: number; type: "BREAK" | "LUNCH" }>
  >([
    { afterBlock: 2, durationMinutes: 15, type: "BREAK" },
    { afterBlock: 4, durationMinutes: 15, type: "BREAK" },
    { afterBlock: 6, durationMinutes: 45, type: "LUNCH" },
  ]);

  const resetBellForm = () => {
    setEditingBellId(null);
    setBellName("");
    setBellStart("08:00");
    setBellDuration(45);
    setBellBlocks(8);
    setBellBlocksByDay({ 1: 8, 2: 8, 3: 8, 4: 8, 5: 8 });
    setBellBreaks([
      { afterBlock: 2, durationMinutes: 15, type: "BREAK" },
      { afterBlock: 4, durationMinutes: 15, type: "BREAK" },
      { afterBlock: 6, durationMinutes: 45, type: "LUNCH" },
    ]);
  };

  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [roomCap, setRoomCap] = useState(() => getSavedRoomCapacity());
  const [roomType, setRoomType] = useState("CLASSROOM");

  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [subjName, setSubjName] = useState("");
  const [subjCode, setSubjCode] = useState("");
  const [subjRoomType, setSubjRoomType] = useState("");
  const [subjRoomId, setSubjRoomId] = useState("");

  const courseHomeRoomIds = useMemo(
    () =>
      new Set(
        setup.courses
          .map((c) => c.defaultRoomId)
          .filter((id): id is string => Boolean(id))
      ),
    [setup.courses]
  );

  const subjectSelectableRooms = useMemo(() => {
    if (!subjRoomType) return [];
    return setup.rooms.filter((r) => {
      if (r.roomType !== subjRoomType) return false;
      if (subjRoomType === "CLASSROOM" && courseHomeRoomIds.has(r.id)) return false;
      return true;
    });
  }, [setup.rooms, subjRoomType, courseHomeRoomIds]);

  const roomNameById = useMemo(
    () => new Map(setup.rooms.map((r) => [r.id, r.name])),
    [setup.rooms]
  );

  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [tFirst, setTFirst] = useState("");
  const [tLast, setTLast] = useState("");
  const [tEmail, setTEmail] = useState("");
  const [tContract, setTContract] = useState(44);
  const [tMaxBlocks, setTMaxBlocks] = useState("");
  const [tRatio, setTRatio] = useState<TeacherLey20903Override>("AUTO");
  const [tColor, setTColor] = useState("#0353A4");

  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [cName, setCName] = useState("");
  const [cCode, setCCode] = useState("");
  const [cLevel, setCLevel] = useState("MEDIA_1_2");
  const [cBellId, setCBellId] = useState(setup.bellSchedules[0]?.id ?? "");
  const [cRoomId, setCRoomId] = useState<string>(AUTO_COURSE_ROOM_VALUE);

  const editingCourse = useMemo(
    () => (editingCourseId ? setup.courses.find((c) => c.id === editingCourseId) ?? null : null),
    [setup.courses, editingCourseId]
  );

  const suggestedCourseRoomName = useMemo(() => {
    const trimmed = cName.trim();
    return trimmed ? `Sala ${trimmed}` : "";
  }, [cName]);

  const editingCourseHasSuggestedRoom = useMemo(() => {
    if (!editingCourse || !editingCourse.defaultRoomId || !suggestedCourseRoomName) {
      return false;
    }
    const currentRoomName =
      editingCourse.defaultRoom?.name ?? roomNameById.get(editingCourse.defaultRoomId) ?? "";
    return currentRoomName.trim().toLowerCase() === suggestedCourseRoomName.toLowerCase();
  }, [editingCourse, suggestedCourseRoomName, roomNameById]);

  const showAutoCourseRoomOption =
    !editingCourseId || !editingCourseHasSuggestedRoom || cRoomId === AUTO_COURSE_ROOM_VALUE;

  const courseSelectableRooms = useMemo(() => {
    const otherCourseHomeRoomIds = new Set(
      setup.courses
        .filter((c) => c.id !== editingCourseId)
        .map((c) => c.defaultRoomId)
        .filter((id): id is string => Boolean(id))
    );
    const suggestedLower = suggestedCourseRoomName.toLowerCase();

    return setup.rooms.filter((r) => {
      const isEditingCourseCurrentRoom =
        Boolean(editingCourse?.defaultRoomId) && r.id === editingCourse?.defaultRoomId;
      if (isEditingCourseCurrentRoom) return true;
      if (r.roomType !== "CLASSROOM") return false;
      if (otherCourseHomeRoomIds.has(r.id)) return false;
      if (showAutoCourseRoomOption && suggestedLower && r.name.trim().toLowerCase() === suggestedLower) {
        return false;
      }
      return true;
    });
  }, [
    setup.courses,
    setup.rooms,
    editingCourseId,
    editingCourse,
    suggestedCourseRoomName,
    showAutoCourseRoomOption,
  ]);

  // Course-Subject assignment
  const getFirstAvailableSubjectId = (courseId: string, excludeCourseSubjectId: string | null = null) => {
    const selectedCourse = setup.courses.find((c) => c.id === courseId);
    const assignedIds = new Set(
      (selectedCourse?.courseSubjects ?? [])
        .filter((cs) => cs.id !== excludeCourseSubjectId)
        .map((cs) => cs.subjectId)
    );
    return setup.subjects.find((s) => !assignedIds.has(s.id))?.id ?? "";
  };

  const [editingCourseSubjectId, setEditingCourseSubjectId] = useState<string | null>(null);
  const [csCourseId, setCsCourseId] = useState(setup.courses[0]?.id ?? "");
  const [csSubjectId, setCsSubjectId] = useState(() =>
    getFirstAvailableSubjectId(setup.courses[0]?.id ?? "")
  );
  const [csLeadTeacherId, setCsLeadTeacherId] = useState(setup.teachers[0]?.id ?? "");
  const [csCoTeacherId, setCsCoTeacherId] = useState("");
  const [csBlocks, setCsBlocks] = useState(4);
  const [csConsecutive, setCsConsecutive] = useState(true);
  const [csSyncCode, setCsSyncCode] = useState("");
  const [selectedCourseSubjectIds, setSelectedCourseSubjectIds] = useState<string[]>([]);
  const [bulkSyncCode, setBulkSyncCode] = useState("");

  const availablePlanSubjects = useMemo(() => {
    const selectedCourse = setup.courses.find((c) => c.id === csCourseId);
    const assignedIds = new Set(
      (selectedCourse?.courseSubjects ?? [])
        .filter((cs) => cs.id !== editingCourseSubjectId)
        .map((cs) => cs.subjectId)
    );
    return setup.subjects.filter((s) => !assignedIds.has(s.id));
  }, [setup.courses, setup.subjects, csCourseId, editingCourseSubjectId]);

  const effectiveCsSubjectId = useMemo(() => {
    if (editingCourseSubjectId) return csSubjectId;
    if (availablePlanSubjects.some((s) => s.id === csSubjectId)) {
      return csSubjectId;
    }
    return availablePlanSubjects[0]?.id ?? "";
  }, [availablePlanSubjects, csSubjectId, editingCourseSubjectId]);

  // Non-teaching activity
  const [actTeacherId, setActTeacherId] = useState(setup.teachers[0]?.id ?? "");
  const [actSlotId, setActSlotId] = useState(
    setup.bellSchedules[0]?.timeSlots.find((s) => s.slotType === "CLASS")?.id ?? ""
  );
  const [actType, setActType] = useState("STAFF_MEETING");
  const [actTitle, setActTitle] = useState("Consejo de Profesores");

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunImportResult | null>(null);

  const postEntity = async (entity: string, data: Record<string, unknown>, successMsg: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/horarios/setup/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, data }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({ variant: "error", title: "Error al guardar", description: json.error || "Error" });
        return false;
      }
      showToast({ variant: "success", title: "Guardado", description: successMsg });
      await onRefresh();
      return true;
    } finally {
      setSaving(false);
    }
  };

  const patchEntity = async (
    entity: string,
    id: string,
    data: Record<string, unknown>,
    successMsg: string
  ) => {
    setSaving(true);
    try {
      const res = await fetch("/api/horarios/setup/entities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, id, data }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({ variant: "error", title: "Error al actualizar", description: json.error || "Error" });
        return false;
      }
      showToast({ variant: "success", title: "Actualizado", description: successMsg });
      await onRefresh();
      return true;
    } finally {
      setSaving(false);
    }
  };

  const deleteEntity = async (entity: string, id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/horarios/setup/entities?entity=${entity}&id=${id}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({ variant: "error", title: "No se pudo eliminar", description: json.error || "Error" });
        return;
      }
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async (mode: "dryRun" | "commit") => {
    if (!importFile) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("mode", mode);
      const res = await fetch("/api/horarios/setup/import", { method: "POST", body: fd });
      const data = (await res.json()) as {
        dryRun?: DryRunImportResult;
        imported?: boolean;
        error?: string;
      };
      if (!res.ok) {
        showToast({ variant: "error", title: "Error de importación", description: data.error || "Error" });
        return;
      }
      if (data.dryRun) setDryRunResult(data.dryRun);
      if (mode === "commit" && data.imported) {
        showToast({
          variant: "success",
          title: "Datos importados",
          description: "Profesores, salas, asignaturas y cursos cargados correctamente.",
        });
        setImportFile(null);
        await onRefresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const classSlots = setup.bellSchedules[0]?.timeSlots.filter((s) => s.slotType === "CLASS") ?? [];
  const leyPolicy = extractLey20903Policy(setup.rules);
  const blockDurationMinutes = resolveBlockDurationMinutes(setup.bellSchedules, leyPolicy);

  const editingTeacher = editingTeacherId
    ? setup.teachers.find((t) => t.id === editingTeacherId) ?? null
    : null;
  const editingTeachesBasic1to4 = editingTeacher
    ? editingTeacher.courseSubjects.some((cs) => cs.courseSubject.course.levelCode === "BASIC_1_4") ||
      (editingTeacher.courseSubjects.length === 0 &&
        editingTeacher.qualifiedLevels.some((ql) => ql.levelCode === "BASIC_1_4"))
    : false;
  const formEffectiveRatio = resolveTeacherLey20903Ratio(tRatio, editingTeachesBasic1to4, leyPolicy);
  const formBreakdown = calculateLey20903Breakdown({
    contractHours: tContract,
    ratio: formEffectiveRatio,
    blockDurationMinutes,
    includeBreaksInTeaching: leyPolicy.includeBreaksInTeaching,
    breakMinutesPerBlock: leyPolicy.breakMinutesPerBlock,
  });

  const resetTeacherForm = () => {
    setEditingTeacherId(null);
    setTFirst("");
    setTLast("");
    setTEmail("");
    setTContract(44);
    setTMaxBlocks("");
    setTRatio("AUTO");
    setTColor("#0353A4");
  };

  const resetCourseForm = () => {
    setEditingCourseId(null);
    setCName("");
    setCCode("");
    setCLevel("MEDIA_1_2");
    setCBellId(setup.bellSchedules[0]?.id ?? "");
    setCRoomId(AUTO_COURSE_ROOM_VALUE);
  };

  const resetCourseSubjectForm = () => {
    const defaultCourseId = setup.courses[0]?.id ?? "";
    setEditingCourseSubjectId(null);
    setCsCourseId(defaultCourseId);
    setCsSubjectId(getFirstAvailableSubjectId(defaultCourseId));
    setCsLeadTeacherId(setup.teachers[0]?.id ?? "");
    setCsCoTeacherId("");
    setCsBlocks(4);
    setCsConsecutive(true);
    setCsSyncCode("");
  };

  const toggleCourseSubjectSelection = (id: string) => {
    setSelectedCourseSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const applyBulkSyncGroup = async (syncGroupCode: string | null) => {
    if (selectedCourseSubjectIds.length === 0) return;
    const ok = await patchEntity(
      "courseSubjectBulkSync",
      "bulk",
      { ids: selectedCourseSubjectIds, syncGroupCode },
      syncGroupCode
        ? `Grupo sincronizado "${syncGroupCode}" asignado a ${selectedCourseSubjectIds.length} asignaturas.`
        : `Grupo sincronizado removido de ${selectedCourseSubjectIds.length} asignaturas.`
    );
    if (ok) {
      setSelectedCourseSubjectIds([]);
      if (syncGroupCode) setBulkSyncCode("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-2">
        {(
          [
            ["teachers", "Docentes", Users],
            ["courses", "Cursos y Plan", GraduationCap],
            ["subjects", "Asignaturas", BookOpen],
            ["rooms", "Salas", DoorOpen],
            ["bells", "Jornadas y Bloques", Clock],
            ["activities", "No Lectivos", CalendarClock],
            ["import", "Carga Masiva", Upload],
          ] as const
        ).map(([id, label, Icon]) => (
          <Button
            key={id}
            size="sm"
            variant={subTab === id ? "default" : "ghost"}
            onClick={() => setSubTab(id)}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Button>
        ))}
      </div>

      {/* DOCENTES */}
      {subTab === "teachers" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span>{editingTeacherId ? "Editar Docente" : "Nuevo Docente"}</span>
                {editingTeacherId && (
                  <Button size="sm" variant="ghost" onClick={resetTeacherForm}>
                    <X className="h-3.5 w-3.5" />
                    Cancelar
                  </Button>
                )}
              </CardTitle>
              <CardDescription className="space-y-1">
                <span className="block">
                  Ley 20.903 ({formBreakdown.ratioLabel}) para {tContract}h:{" "}
                  <strong className="text-[var(--accent-1)]">
                    máx. {formBreakdown.legalMaxTeachingBlocks} bloques lectivos
                  </strong>{" "}
                  ({formatChronologicalMinutes(formBreakdown.maxTeachingChronologicalMinutes)})
                </span>
                <span className="block text-[11px]">
                  Mín. no lectivo:{" "}
                  <strong className="text-[var(--text-primary)]">
                    {formatChronologicalMinutes(formBreakdown.minNonTeachingChronologicalMinutes)}
                  </strong>{" "}
                  ({Math.round(formBreakdown.nonTeachingPct * 100)}%) · bloque{" "}
                  {formBreakdown.blockDurationMinutes}m
                  {formBreakdown.breakMinutesPerBlock > 0
                    ? ` + ${formBreakdown.breakMinutesPerBlock}m recreo`
                    : ""}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="teacher-first-name">Nombre</Label>
                  <Input
                    id="teacher-first-name"
                    value={tFirst}
                    onChange={(e) => setTFirst(e.target.value)}
                    placeholder="Ej. María"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="teacher-last-name">Apellido</Label>
                  <Input
                    id="teacher-last-name"
                    value={tLast}
                    onChange={(e) => setTLast(e.target.value)}
                    placeholder="Ej. González"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="teacher-email">Correo electrónico (opcional)</Label>
                <Input
                  id="teacher-email"
                  type="email"
                  value={tEmail}
                  onChange={(e) => setTEmail(e.target.value)}
                  placeholder="Ej. maria@colegio.cl"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="teacher-contract-hours">Horas contrato</Label>
                  <Input
                    id="teacher-contract-hours"
                    type="number"
                    min={1}
                    max={44}
                    value={tContract}
                    onChange={(e) => setTContract(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="teacher-max-blocks">
                    Tope lectivo (vacío = {formBreakdown.legalMaxTeachingBlocks})
                  </Label>
                  <Input
                    id="teacher-max-blocks"
                    type="number"
                    min={0}
                    max={50}
                    value={tMaxBlocks}
                    onChange={(e) => setTMaxBlocks(e.target.value)}
                    placeholder={`Auto (${formBreakdown.legalMaxTeachingBlocks})`}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="teacher-ratio">Proporción Ley 20.903</Label>
                <Select
                  value={tRatio}
                  onValueChange={(v) => setTRatio(v as TeacherLey20903Override)}
                >
                  <SelectTrigger id="teacher-ratio" className="text-xs font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTO">Automática (según colegio)</SelectItem>
                    <SelectItem value="65_35">65/35 (Regla general)</SelectItem>
                    <SelectItem value="60_40">60/40 (Alta vulnerabilidad)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <TeacherColorPicker value={tColor} onChange={setTColor} />
              <Button
                className="w-full"
                disabled={saving || !tFirst || !tLast}
                onClick={async () => {
                  const payload = {
                    firstName: tFirst,
                    lastName: tLast,
                    email: tEmail,
                    contractHours: tContract,
                    maxTeachingBlocks: tMaxBlocks.trim() === "" ? "" : Number(tMaxBlocks),
                    ley20903Ratio: tRatio,
                    colorHex: tColor,
                  };
                  const ok = editingTeacherId
                    ? await patchEntity(
                        "teacher",
                        editingTeacherId,
                        payload,
                        `Docente ${tFirst} ${tLast} actualizado.`
                      )
                    : await postEntity(
                        "teacher",
                        payload,
                        `Docente ${tFirst} ${tLast} creado.`
                      );
                  if (ok) resetTeacherForm();
                }}
              >
                <Plus className="h-4 w-4" />
                {editingTeacherId ? "Guardar Cambios" : "Agregar Docente"}
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Plantilla Docente ({setup.teachers.length})</CardTitle>
              <CardDescription>
                Política activa: {leyPolicy.defaultRatio === "60_40" ? "60/40" : "65/35"} · Bloque{" "}
                {blockDurationMinutes}m
                {leyPolicy.includeBreaksInTeaching && leyPolicy.breakMinutesPerBlock > 0
                  ? ` + ${leyPolicy.breakMinutesPerBlock}m recreo`
                  : " (sin imputación de recreo)"}
                {leyPolicy.apply6040ToBasic1to4 ? " · 60/40 en 1°–4° Básico" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
              {setup.teachers.map((t) => {
                const assigned = t.courseSubjects.reduce(
                  (s, cs) => s + (cs.assignedBlocks ?? cs.courseSubject.weeklyBlocks),
                  0
                );
                const scheduledNonTeaching = (activeVersion?.nonTeachingActivities ?? []).filter(
                  (a) => a.teacherId === t.id
                ).length;
                const teachesBasic1to4 =
                  t.courseSubjects.some((cs) => cs.courseSubject.course.levelCode === "BASIC_1_4") ||
                  (t.courseSubjects.length === 0 &&
                    t.qualifiedLevels.some((ql) => ql.levelCode === "BASIC_1_4"));
                const ratio = resolveTeacherLey20903Ratio(t.ley20903Ratio, teachesBasic1to4, leyPolicy);
                const breakdown = calculateLey20903Breakdown({
                  contractHours: t.contractHours,
                  ratio,
                  blockDurationMinutes,
                  includeBreaksInTeaching: leyPolicy.includeBreaksInTeaching,
                  breakMinutesPerBlock: leyPolicy.breakMinutesPerBlock,
                  assignedTeachingBlocks: assigned,
                  scheduledNonTeachingBlocks: scheduledNonTeaching,
                });
                const overConfigured = assigned > t.maxTeachingBlocks;
                return (
                  <div
                    key={t.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 ${
                      editingTeacherId === t.id
                        ? "border-[var(--accent-1)] bg-[var(--accent-1)]/5"
                        : "border-[var(--border-card)] bg-[var(--bg-card-subtle)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-4 w-4 rounded-full shrink-0"
                        style={{ backgroundColor: t.colorHex }}
                      />
                      <div>
                        <div className="text-sm font-semibold text-[var(--text-primary)] flex flex-wrap items-center gap-1.5">
                          <span>
                            {t.firstName} {t.lastName}
                          </span>
                          <span className="text-[10px] font-medium text-[var(--text-muted)] rounded-md border border-[var(--border-subtle)] px-1.5 py-0.5">
                            {breakdown.ratioLabel}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          Contrato {t.contractHours}h · Lectivos: {assigned}/{t.maxTeachingBlocks} blq
                          (Ley máx: {breakdown.legalMaxTeachingBlocks} · {breakdown.actualTeachingPct}%)
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          No lectivos mín: {formatChronologicalMinutes(breakdown.minNonTeachingChronologicalMinutes)} ·
                          Agendados: {scheduledNonTeaching} blq (
                          {formatChronologicalMinutes(breakdown.scheduledNonTeachingMinutes)}) ·
                          Restante: {formatChronologicalMinutes(breakdown.remainingNonTeachingMinutes)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {overConfigured ? (
                        <Badge variant="outline" className="border-red-500/40 text-red-500">
                          Supera tope ({t.maxTeachingBlocks})
                        </Badge>
                      ) : breakdown.exceedsLegalLimit ? (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                          Excede {breakdown.ratioLabel}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
                          Cumple {breakdown.ratioLabel}
                        </Badge>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Editar docente"
                        onClick={() => {
                          setEditingTeacherId(t.id);
                          setTFirst(t.firstName);
                          setTLast(t.lastName);
                          setTEmail(t.email ?? "");
                          setTContract(t.contractHours);
                          setTMaxBlocks(String(t.maxTeachingBlocks));
                          setTRatio(t.ley20903Ratio ?? "AUTO");
                          setTColor(t.colorHex);
                        }}
                      >
                        <Pencil className="h-4 w-4 text-[var(--text-secondary)]" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Eliminar docente"
                        onClick={() => {
                          if (editingTeacherId === t.id) resetTeacherForm();
                          void deleteEntity("teacher", t.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* CURSOS Y PLAN DE ESTUDIOS */}
      {subTab === "courses" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span>{editingCourseId ? "Editar Curso" : "Nuevo Curso"}</span>
                  {editingCourseId && (
                    <Button size="xs" variant="ghost" onClick={resetCourseForm}>
                      <X className="h-3.5 w-3.5" />
                      Cancelar
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="course-name">Nombre del curso</Label>
                  <Input
                    id="course-name"
                    value={cName}
                    onChange={(e) => setCName(e.target.value)}
                    placeholder="Ej. 2° Medio B"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="course-code">Código</Label>
                    <Input
                      id="course-code"
                      value={cCode}
                      onChange={(e) => setCCode(e.target.value)}
                      placeholder="Ej. 2MB"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="course-level">Nivel educativo</Label>
                    <Select value={cLevel} onValueChange={setCLevel}>
                      <SelectTrigger id="course-level" className="text-xs">
                        <SelectValue placeholder="Selecciona nivel" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(LEVEL_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="course-bell">Jornada</Label>
                  <Select value={cBellId || undefined} onValueChange={setCBellId}>
                    <SelectTrigger id="course-bell">
                      <SelectValue placeholder="Selecciona una jornada" />
                    </SelectTrigger>
                    <SelectContent>
                      {setup.bellSchedules.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="course-room">Sala base</Label>
                  <Select
                    value={cRoomId || NO_COURSE_ROOM_VALUE}
                    onValueChange={setCRoomId}
                  >
                    <SelectTrigger id="course-room">
                      <SelectValue placeholder="Sin sala fija" />
                    </SelectTrigger>
                    <SelectContent>
                      {showAutoCourseRoomOption && (
                        <SelectItem value={AUTO_COURSE_ROOM_VALUE}>
                          {suggestedCourseRoomName || "Crear sala automática (Sala + nombre)"}
                        </SelectItem>
                      )}
                      <SelectItem value={NO_COURSE_ROOM_VALUE}>Sin sala fija</SelectItem>
                      {courseSelectableRooms.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  disabled={saving || !cName.trim() || !cCode.trim() || !cBellId}
                  onClick={async () => {
                    const isAutoRoom = cRoomId === AUTO_COURSE_ROOM_VALUE;
                    const payload = {
                      name: cName,
                      code: cCode,
                      levelCode: cLevel,
                      bellScheduleId: cBellId,
                      ...(isAutoRoom
                        ? {
                            autoCreateDefaultRoom: true,
                            autoRoomCapacity: DEFAULT_ROOM_CAPACITY,
                          }
                        : {
                            defaultRoomId:
                              cRoomId === NO_COURSE_ROOM_VALUE ? null : cRoomId || null,
                          }),
                    };
                    const trimmedName = cName.trim();
                    const ok = editingCourseId
                      ? await patchEntity(
                          "course",
                          editingCourseId,
                          payload,
                          isAutoRoom
                            ? `Curso ${trimmedName} actualizado con sala base Sala ${trimmedName}.`
                            : `Curso ${trimmedName} actualizado.`
                        )
                      : await postEntity(
                          "course",
                          payload,
                          isAutoRoom
                            ? `Curso ${trimmedName} creado con sala base Sala ${trimmedName}.`
                            : `Curso ${trimmedName} creado.`
                        );
                    if (ok) {
                      resetCourseForm();
                    }
                  }}
                >
                  {editingCourseId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editingCourseId ? "Guardar Cambios" : "Crear Curso"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span>
                    {editingCourseSubjectId ? "Editar Carga Curricular" : "Asignar Plan de Estudio"}
                  </span>
                  {editingCourseSubjectId && (
                    <Button size="xs" variant="ghost" onClick={resetCourseSubjectForm}>
                      <X className="h-3.5 w-3.5" />
                      Cancelar
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>Soporta codocencia PIE y grupos sincronizados.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="plan-course">Curso</Label>
                  <Select value={csCourseId || undefined} onValueChange={setCsCourseId}>
                    <SelectTrigger id="plan-course">
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
                <div className="space-y-1.5">
                  <Label htmlFor="plan-subject">Asignatura</Label>
                  <Select
                    value={effectiveCsSubjectId}
                    onValueChange={setCsSubjectId}
                    disabled={availablePlanSubjects.length === 0}
                  >
                    <SelectTrigger id="plan-subject">
                      <SelectValue
                        placeholder={
                          availablePlanSubjects.length === 0
                            ? "Todas las asignaturas asignadas"
                            : "Selecciona una asignatura"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePlanSubjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-lead-teacher">Docente titular</Label>
                  <Select value={csLeadTeacherId || undefined} onValueChange={setCsLeadTeacherId}>
                    <SelectTrigger id="plan-lead-teacher">
                      <SelectValue placeholder="Selecciona docente titular" />
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
                <div className="space-y-1.5">
                  <Label htmlFor="plan-co-teacher">Codocente / PIE (opcional)</Label>
                  <Select
                    value={csCoTeacherId || "__none__"}
                    onValueChange={(v) => setCsCoTeacherId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger id="plan-co-teacher">
                      <SelectValue placeholder="Sin codocente / PIE" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin codocente / PIE</SelectItem>
                      {setup.teachers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.firstName} {t.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="plan-blocks">Bloques / semana</Label>
                    <Input
                      id="plan-blocks"
                      type="number"
                      min={1}
                      max={12}
                      value={csBlocks}
                      onChange={(e) => setCsBlocks(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="plan-sync-code">Grupo sincronizado (opcional)</Label>
                    <Input
                      id="plan-sync-code"
                      value={csSyncCode}
                      onChange={(e) => setCsSyncCode(e.target.value)}
                      placeholder="Ej. ELECTIVO_3M"
                      className="text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="plan-consecutive"
                    checked={csConsecutive}
                    onCheckedChange={(checked) => setCsConsecutive(checked === true)}
                  />
                  <Label htmlFor="plan-consecutive" className="cursor-pointer font-normal">
                    Requiere bloques dobles (pareados)
                  </Label>
                </div>
                <Button
                  className="w-full"
                  disabled={saving || !csCourseId || !effectiveCsSubjectId || !csLeadTeacherId}
                  onClick={async () => {
                    const teachers = [{ teacherId: csLeadTeacherId, role: "LEAD" }];
                    if (csCoTeacherId && csCoTeacherId !== csLeadTeacherId) {
                      teachers.push({ teacherId: csCoTeacherId, role: "PIE_SUPPORT" });
                    }
                    const payload = {
                      courseId: csCourseId,
                      subjectId: effectiveCsSubjectId,
                      weeklyBlocks: csBlocks,
                      requiresConsecutiveBlocks: csConsecutive,
                      syncGroupCode: csSyncCode.trim() || null,
                      isSplitClass: Boolean(csSyncCode.trim()),
                      teachers,
                    };
                    const currentIdx = availablePlanSubjects.findIndex(
                      (s) => s.id === effectiveCsSubjectId
                    );
                    const nextSubject =
                      currentIdx >= 0
                        ? (availablePlanSubjects[currentIdx + 1] ?? availablePlanSubjects[0] ?? null)
                        : (availablePlanSubjects[0] ?? null);
                    const nextSubjectId =
                      nextSubject && nextSubject.id !== effectiveCsSubjectId ? nextSubject.id : "";
                    const ok = editingCourseSubjectId
                      ? await patchEntity(
                          "courseSubject",
                          editingCourseSubjectId,
                          payload,
                          "Carga curricular actualizada."
                        )
                      : await postEntity(
                          "courseSubject",
                          payload,
                          "Asignatura agregada al plan de estudio del curso."
                        );
                    if (ok) {
                      if (editingCourseSubjectId) {
                        resetCourseSubjectForm();
                      } else {
                        setCsSubjectId(nextSubjectId);
                      }
                    }
                  }}
                >
                  {editingCourseSubjectId ? (
                    <Pencil className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {editingCourseSubjectId ? "Guardar Cambios" : "Agregar al Plan"}
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card className="lg:col-span-2">
            <CardHeader className="space-y-3">
              <div>
                <CardTitle className="text-base">
                  Cursos y Carga Curricular ({setup.courses.length})
                </CardTitle>
                <CardDescription>
                  Edita cursos o asignaturas, o selecciona varias asignaturas para asignarles un
                  grupo sincronizado.
                </CardDescription>
              </div>
              {selectedCourseSubjectIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--accent-1)]/30 bg-[var(--accent-1)]/5 p-2.5">
                  <Badge variant="secondary">
                    {selectedCourseSubjectIds.length}{" "}
                    {selectedCourseSubjectIds.length === 1 ? "seleccionada" : "seleccionadas"}
                  </Badge>
                  <Input
                    value={bulkSyncCode}
                    onChange={(e) => setBulkSyncCode(e.target.value)}
                    placeholder="Grupo sincronizado (ej. ELECTIVO_3M)"
                    className="h-8 w-56 text-xs"
                  />
                  <Button
                    size="sm"
                    disabled={saving || !bulkSyncCode.trim()}
                    onClick={() => void applyBulkSyncGroup(bulkSyncCode.trim())}
                  >
                    Asignar grupo
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={saving}
                    onClick={() => void applyBulkSyncGroup(null)}
                  >
                    Quitar grupo
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="ml-auto h-8 w-8"
                    aria-label="Limpiar selección"
                    onClick={() => setSelectedCourseSubjectIds([])}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-3 max-h-[640px] overflow-y-auto">
              {setup.courses.map((course) => {
                const totalBlocks = course.courseSubjects.reduce((s, cs) => s + cs.weeklyBlocks, 0);
                return (
                  <div
                    key={course.id}
                    className={`rounded-xl border p-3 space-y-2 ${
                      editingCourseId === course.id
                        ? "border-[var(--accent-1)] bg-[var(--accent-1)]/5"
                        : "border-[var(--border-card)] bg-[var(--bg-card-subtle)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-sm text-[var(--text-primary)]">
                          {course.name}
                        </span>
                        <span className="ml-2 text-xs text-[var(--text-muted)]">
                          {course.bellSchedule.name} · Sala {course.defaultRoom?.name ?? "Sin fija"} ·{" "}
                          <strong>{totalBlocks} bloques/sem</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Editar ${course.name}`}
                          onClick={() => {
                            setEditingCourseId(course.id);
                            setCName(course.name);
                            setCCode(course.code);
                            setCLevel(course.levelCode);
                            setCBellId(course.bellScheduleId);
                            setCRoomId(course.defaultRoomId ?? NO_COURSE_ROOM_VALUE);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Eliminar ${course.name}`}
                          onClick={() => {
                            if (editingCourseId === course.id) resetCourseForm();
                            void deleteEntity("course", course.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {course.courseSubjects.map((cs) => {
                        const isSelected = selectedCourseSubjectIds.includes(cs.id);
                        const isEditing = editingCourseSubjectId === cs.id;
                        return (
                          <div
                            key={cs.id}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors ${
                              isEditing
                                ? "border-[var(--accent-1)] bg-[var(--accent-1)]/10"
                                : isSelected
                                  ? "border-[var(--accent-1)]/60 bg-[var(--accent-1)]/5"
                                  : "border-[var(--border-card)] bg-[var(--bg-surface)]"
                            }`}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleCourseSubjectSelection(cs.id)}
                              aria-label={`Seleccionar ${cs.subject.code} en ${course.name}`}
                              className="h-3.5 w-3.5"
                            />
                            <span className="font-semibold">{cs.subject.code}</span>
                            <span className="text-[var(--text-muted)]">({cs.weeklyBlocks}b)</span>
                            <span className="text-[var(--text-secondary)]">
                              {cs.teachers.map((t) => t.teacher.lastName).join("+")}
                            </span>
                            {cs.syncGroupCode && (
                              <Badge variant="default" className="text-[9px] px-1.5 py-0">
                                {cs.syncGroupCode}
                              </Badge>
                            )}
                            <button
                              type="button"
                              aria-label={`Editar ${cs.subject.code} en ${course.name}`}
                              onClick={() => {
                                const leadTeacher =
                                  cs.teachers.find((t) => t.role === "LEAD") ?? cs.teachers[0];
                                const coTeacher = cs.teachers.find(
                                  (t) => t.teacherId !== leadTeacher?.teacherId
                                );
                                setEditingCourseSubjectId(cs.id);
                                setCsCourseId(cs.courseId);
                                setCsSubjectId(cs.subjectId);
                                setCsLeadTeacherId(leadTeacher?.teacherId ?? "");
                                setCsCoTeacherId(coTeacher?.teacherId ?? "");
                                setCsBlocks(cs.weeklyBlocks);
                                setCsConsecutive(cs.requiresConsecutiveBlocks);
                                setCsSyncCode(cs.syncGroupCode ?? "");
                              }}
                              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Eliminar ${cs.subject.code} en ${course.name}`}
                              onClick={() => {
                                if (editingCourseSubjectId === cs.id) resetCourseSubjectForm();
                                setSelectedCourseSubjectIds((prev) =>
                                  prev.filter((id) => id !== cs.id)
                                );
                                void deleteEntity("courseSubject", cs.id);
                              }}
                              className="text-red-400 hover:text-red-300 cursor-pointer"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ASIGNATURAS */}
      {subTab === "subjects" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>{editingSubjectId ? "Editar Asignatura" : "Nueva Asignatura"}</span>
                {editingSubjectId && (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setEditingSubjectId(null);
                      setSubjName("");
                      setSubjCode("");
                      setSubjRoomType("");
                      setSubjRoomId("");
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancelar
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="subject-name">Nombre de la asignatura</Label>
                <Input
                  id="subject-name"
                  value={subjName}
                  onChange={(e) => setSubjName(e.target.value)}
                  placeholder="Ej. Artes Visuales"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subject-code">Código</Label>
                <Input
                  id="subject-code"
                  value={subjCode}
                  onChange={(e) => setSubjCode(e.target.value)}
                  placeholder="Ej. ART"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subject-room-type">Tipo de recinto requerido</Label>
                <Select
                  value={subjRoomType || "__none__"}
                  onValueChange={(v) => {
                    const nextType = v === "__none__" ? "" : v;
                    setSubjRoomType(nextType);
                    setSubjRoomId("");
                  }}
                >
                  <SelectTrigger id="subject-room-type">
                    <SelectValue placeholder="Sala normal del curso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sala normal del curso</SelectItem>
                    {Object.entries(ROOM_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {k === "CLASSROOM" ? "Otra sala de clases" : v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {subjRoomType && (
                <div className="space-y-1.5">
                  <Label htmlFor="subject-room-id">Sala o recinto específico (opcional)</Label>
                  <Select
                    value={subjRoomId || "__any__"}
                    onValueChange={(v) => setSubjRoomId(v === "__any__" ? "" : v)}
                  >
                    <SelectTrigger id="subject-room-id">
                      <SelectValue placeholder="Cualquiera disponible de este tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Cualquiera disponible de este tipo</SelectItem>
                      {subjectSelectableRooms.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} (Cap. {r.capacity})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {subjectSelectableRooms.length === 0 && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      {subjRoomType === "CLASSROOM"
                        ? "No hay otras salas de clases disponibles (todas están asignadas como sala base de algún curso)."
                        : "No hay recintos creados de este tipo aún."}
                    </p>
                  )}
                </div>
              )}
              <Button
                className="w-full"
                disabled={saving || !subjName}
                onClick={async () => {
                  const payload = {
                    name: subjName,
                    code: subjCode || subjName.slice(0, 3),
                    requiresRoomType: subjRoomType || null,
                    requiredRoomId: subjRoomType ? subjRoomId || null : null,
                  };
                  const ok = editingSubjectId
                    ? await patchEntity(
                        "subject",
                        editingSubjectId,
                        payload,
                        `Asignatura ${subjName} actualizada.`
                      )
                    : await postEntity(
                        "subject",
                        payload,
                        `Asignatura ${subjName} creada.`
                      );
                  if (ok) {
                    setEditingSubjectId(null);
                    setSubjName("");
                    setSubjCode("");
                    setSubjRoomType("");
                    setSubjRoomId("");
                  }
                }}
              >
                {editingSubjectId ? (
                  <Pencil className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editingSubjectId ? "Guardar Cambios" : "Crear Asignatura"}
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Catálogo de Asignaturas ({setup.subjects.length})</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {setup.subjects.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center justify-between rounded-xl border p-3 ${
                    editingSubjectId === s.id
                      ? "border-[var(--accent-1)] bg-sky-500/10"
                      : "border-[var(--border-card)] bg-[var(--bg-card-subtle)]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{s.name}</div>
                    <div className="text-xs text-[var(--text-muted)] truncate">
                      Código: {s.code}
                      {s.requiredRoomId && roomNameById.get(s.requiredRoomId)
                        ? ` · Requiere ${roomNameById.get(s.requiredRoomId)}`
                        : s.requiresRoomType
                          ? ` · Requiere ${
                              s.requiresRoomType === "CLASSROOM"
                                ? "Otra sala de clases"
                                : ROOM_TYPE_LABELS[s.requiresRoomType]
                            }`
                          : " · Sala normal del curso"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Editar asignatura"
                      onClick={() => {
                        setEditingSubjectId(s.id);
                        setSubjName(s.name);
                        setSubjCode(s.code);
                        setSubjRoomType(s.requiresRoomType ?? "");
                        setSubjRoomId(s.requiredRoomId ?? "");
                      }}
                    >
                      <Pencil className="h-4 w-4 text-[var(--text-secondary)]" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Eliminar asignatura"
                      onClick={() => void deleteEntity("subject", s.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* SALAS */}
      {subTab === "rooms" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>{editingRoomId ? "Editar Sala o Recinto" : "Nueva Sala o Recinto"}</span>
                {editingRoomId && (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setEditingRoomId(null);
                      setRoomName("");
                      setRoomCap(getSavedRoomCapacity());
                      setRoomType("CLASSROOM");
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancelar
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="room-name">Nombre de la sala o recinto</Label>
                <Input
                  id="room-name"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Ej. Laboratorio Química"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="room-capacity">Capacidad</Label>
                  <Input
                    id="room-capacity"
                    type="number"
                    min={1}
                    value={roomCap}
                    onChange={(e) => setRoomCap(Number(e.target.value))}
                    placeholder="Ej. 45"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="room-type">Tipo de recinto</Label>
                  <Select value={roomType} onValueChange={setRoomType}>
                    <SelectTrigger id="room-type" className="text-xs">
                      <SelectValue placeholder="Selecciona tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROOM_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                className="w-full"
                disabled={saving || !roomName}
                onClick={async () => {
                  const payload = { name: roomName, capacity: roomCap, roomType };
                  const ok = editingRoomId
                    ? await patchEntity(
                        "room",
                        editingRoomId,
                        payload,
                        `Sala ${roomName} actualizada.`
                      )
                    : await postEntity("room", payload, `Sala ${roomName} creada.`);
                  if (ok) {
                    if (!editingRoomId) {
                      saveRoomCapacity(roomCap);
                    }
                    setEditingRoomId(null);
                    setRoomName("");
                    setRoomCap(getSavedRoomCapacity());
                    setRoomType("CLASSROOM");
                  }
                }}
              >
                {editingRoomId ? (
                  <Pencil className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editingRoomId ? "Guardar Cambios" : "Agregar Sala"}
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Salas y Espacios Especiales ({setup.rooms.length})</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {setup.rooms.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between rounded-xl border p-3 ${
                    editingRoomId === r.id
                      ? "border-[var(--accent-1)] bg-sky-500/10"
                      : "border-[var(--border-card)] bg-[var(--bg-card-subtle)]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{r.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {ROOM_TYPE_LABELS[r.roomType]} · Cap. {r.capacity}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Editar sala"
                      onClick={() => {
                        setEditingRoomId(r.id);
                        setRoomName(r.name);
                        setRoomCap(r.capacity);
                        setRoomType(r.roomType);
                      }}
                    >
                      <Pencil className="h-4 w-4 text-[var(--text-secondary)]" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Eliminar sala"
                      onClick={() => void deleteEntity("room", r.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* JORNADAS Y BLOQUES */}
      {subTab === "bells" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {editingBellId ? "Editar Jornada" : "Nueva Jornada (Bell Schedule)"}
                </CardTitle>
                {editingBellId && (
                  <Button type="button" variant="ghost" size="sm" onClick={resetBellForm}>
                    <X className="h-4 w-4" />
                    Cancelar
                  </Button>
                )}
              </div>
              <CardDescription>
                Genera o actualiza los bloques de Lunes a Viernes (puedes definir menos bloques los viernes).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="bell-name">Nombre de la jornada</Label>
                <Input
                  id="bell-name"
                  value={bellName}
                  onChange={(e) => setBellName(e.target.value)}
                  placeholder="Ej. Jornada Primer Ciclo"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bell-start">Inicio</Label>
                  <Input
                    id="bell-start"
                    type="time"
                    value={bellStart}
                    onChange={(e) => setBellStart(e.target.value)}
                    className="px-2 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bell-duration">Min / bloque</Label>
                  <Input
                    id="bell-duration"
                    type="number"
                    min={15}
                    max={90}
                    value={bellDuration}
                    onChange={(e) => setBellDuration(Number(e.target.value))}
                    className="px-2 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bell-blocks">Bloques base</Label>
                  <Input
                    id="bell-blocks"
                    type="number"
                    min={1}
                    max={12}
                    value={bellBlocks}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(12, Number(e.target.value) || 1));
                      setBellBlocks(val);
                      setBellBlocksByDay({ 1: val, 2: val, 3: val, 4: val, 5: val });
                    }}
                    className="px-2 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">
                  Bloques por día (ej. Viernes 6)
                </Label>
                <div className="grid grid-cols-5 gap-1.5">
                  {DAYS_OF_WEEK.map((d) => (
                    <div key={d.value} className="space-y-1 text-center">
                      <Label
                        htmlFor={`bell-day-${d.value}`}
                        className="text-[11px] font-medium text-[var(--text-muted)]"
                      >
                        {d.short}
                      </Label>
                      <Input
                        id={`bell-day-${d.value}`}
                        type="number"
                        min={1}
                        max={12}
                        value={bellBlocksByDay[d.value] ?? bellBlocks}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(12, Number(e.target.value) || 1));
                          setBellBlocksByDay((prev) => ({ ...prev, [d.value]: val }));
                        }}
                        className="px-1.5 text-center text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-[var(--text-secondary)]">
                    Recreos y Almuerzo
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      setBellBreaks((prev) => [
                        ...prev,
                        {
                          afterBlock: Math.min(
                            11,
                            (prev[prev.length - 1]?.afterBlock ?? 0) + 2
                          ),
                          durationMinutes: 15,
                          type: "BREAK",
                        },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar
                  </Button>
                </div>
                {bellBreaks.length === 0 ? (
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Sin recreos ni almuerzo configurados.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {bellBreaks.map((brk, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-[1fr_64px_64px_28px] items-center gap-1.5"
                      >
                        <Select
                          value={brk.type}
                          onValueChange={(val) =>
                            setBellBreaks((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, type: val as "BREAK" | "LUNCH" } : item
                              )
                            )
                          }
                        >
                          <SelectTrigger className="h-8 px-2 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BREAK">Recreo</SelectItem>
                            <SelectItem value="LUNCH">Almuerzo</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={1}
                          max={11}
                          title="Después del bloque"
                          aria-label="Después del bloque"
                          value={brk.afterBlock}
                          onChange={(e) => {
                            const val = Math.max(1, Math.min(11, Number(e.target.value) || 1));
                            setBellBreaks((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, afterBlock: val } : item
                              )
                            );
                          }}
                          className="h-8 px-1.5 text-center text-xs"
                        />
                        <Input
                          type="number"
                          min={5}
                          max={120}
                          title="Duración en minutos"
                          aria-label="Duración en minutos"
                          value={brk.durationMinutes}
                          onChange={(e) => {
                            const val = Math.max(5, Math.min(120, Number(e.target.value) || 5));
                            setBellBreaks((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, durationMinutes: val } : item
                              )
                            );
                          }}
                          className="h-8 px-1.5 text-center text-xs"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-7"
                          aria-label="Eliminar pausa"
                          onClick={() =>
                            setBellBreaks((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      </div>
                    ))}
                    <div className="grid grid-cols-[1fr_64px_64px_28px] gap-1.5 text-[10px] text-[var(--text-muted)] text-center">
                      <span className="text-left pl-1">Tipo</span>
                      <span>Tras blq</span>
                      <span>Minutos</span>
                      <span />
                    </div>
                  </div>
                )}
              </div>
              <Button
                className="w-full"
                disabled={saving || !bellName}
                onClick={async () => {
                  const normalizedBreaks = [...bellBreaks]
                    .filter((b) => b.afterBlock >= 1 && b.durationMinutes >= 1)
                    .sort((a, b) => a.afterBlock - b.afterBlock);

                  const gridConfig = {
                    startTime: bellStart,
                    blockDurationMinutes: bellDuration,
                    blocksPerDay: bellBlocks,
                    blocksPerDayByDay: bellBlocksByDay,
                    breaks: normalizedBreaks,
                  };

                  if (editingBellId) {
                    const ok = await patchEntity(
                      "bellSchedule",
                      editingBellId,
                      {
                        name: bellName,
                        gridConfig,
                      },
                      `Jornada ${bellName} actualizada.`
                    );
                    if (ok) resetBellForm();
                  } else {
                    const ok = await postEntity(
                      "bellSchedule",
                      {
                        name: bellName,
                        applicableLevels: ["BASIC_1_4"],
                        gridConfig,
                      },
                      `Jornada ${bellName} creada con matriz horaria.`
                    );
                    if (ok) resetBellForm();
                  }
                }}
              >
                {editingBellId ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Guardar Cambios de Jornada
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Crear Jornada y Matriz
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Jornadas Configuradas ({setup.bellSchedules.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {setup.bellSchedules.map((bs) => {
                const countsByDay = DAYS_OF_WEEK.map((d) => ({
                  ...d,
                  count: bs.timeSlots.filter((s) => s.dayOfWeek === d.value && s.slotType === "CLASS")
                    .length,
                }));
                const maxDayCount = Math.max(...countsByDay.map((c) => c.count), 0);
                const refDay =
                  countsByDay.find((c) => c.count === maxDayCount)?.value ?? 1;
                const refSlots = bs.timeSlots.filter((s) => s.dayOfWeek === refDay);
                const allEqual = countsByDay.every((c) => c.count === countsByDay[0]?.count);
                const daySummary = allEqual
                  ? `Lun–Vie: ${countsByDay[0]?.count ?? 0} blq`
                  : countsByDay.map((c) => `${c.short} ${c.count}`).join(" · ");

                return (
                  <div
                    key={bs.id}
                    className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-subtle)] p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-sm">{bs.name}</span>
                        <div className="text-xs text-[var(--text-muted)]">{daySummary}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary">
                          {bs.timeSlots.filter((s) => s.slotType === "CLASS").length} bloques/semana
                        </Badge>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const firstClass = refSlots.find((s) => s.slotType === "CLASS");
                            const inferredCounts: Record<number, number> = {};
                            for (const d of DAYS_OF_WEEK) {
                              const cnt = bs.timeSlots.filter(
                                (s) => s.dayOfWeek === d.value && s.slotType === "CLASS"
                              ).length;
                              inferredCounts[d.value] = cnt > 0 ? cnt : 8;
                            }
                            const inferredBreaks = refSlots
                              .filter((s) => s.slotType !== "CLASS")
                              .map((s) => ({
                                afterBlock: Math.floor(s.blockNumber / 100),
                                durationMinutes: s.durationMinutes,
                                type: (s.slotType === "LUNCH" ? "LUNCH" : "BREAK") as
                                  | "BREAK"
                                  | "LUNCH",
                              }))
                              .filter((b) => b.afterBlock >= 1);

                            setEditingBellId(bs.id);
                            setBellName(bs.name);
                            setBellStart(firstClass?.startTime ?? "08:00");
                            setBellDuration(firstClass?.durationMinutes ?? 45);
                            setBellBlocks(Math.max(...Object.values(inferredCounts), 1));
                            setBellBlocksByDay(inferredCounts);
                            setBellBreaks(
                              inferredBreaks.length > 0
                                ? inferredBreaks
                                : [
                                    { afterBlock: 2, durationMinutes: 15, type: "BREAK" },
                                    { afterBlock: 4, durationMinutes: 15, type: "BREAK" },
                                    { afterBlock: 6, durationMinutes: 45, type: "LUNCH" },
                                  ]
                            );
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {refSlots.map((s) => (
                        <span
                          key={s.id}
                          className={`rounded-lg px-2 py-1 text-[11px] ${
                            s.slotType === "CLASS"
                              ? "border border-[var(--border-card)] bg-[var(--bg-surface)]"
                              : "bg-sky-500/15 text-sky-600 dark:text-sky-400 font-semibold"
                          }`}
                        >
                          {s.slotType === "CLASS"
                            ? `B${s.blockNumber} (${s.startTime}-${s.endTime})${s.pairGroupId ? ` [P${s.pairGroupId}]` : ""}`
                            : `${s.slotType === "LUNCH" ? "Almuerzo" : "Recreo"} ${s.startTime}`}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ACTIVIDADES NO LECTIVAS */}
      {subTab === "activities" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reservar Bloque No Lectivo</CardTitle>
              <CardDescription>
                Consejo de Profesores, reuniones de departamento o atención de apoderados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="activity-teacher">Docente</Label>
                <Select value={actTeacherId || undefined} onValueChange={setActTeacherId}>
                  <SelectTrigger id="activity-teacher">
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
              <div className="space-y-1.5">
                <Label htmlFor="activity-slot">Día y bloque</Label>
                <Select value={actSlotId || undefined} onValueChange={setActSlotId}>
                  <SelectTrigger id="activity-slot">
                    <SelectValue placeholder="Selecciona día y bloque" />
                  </SelectTrigger>
                  <SelectContent>
                    {classSlots.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {DAYS_OF_WEEK.find((d) => d.value === s.dayOfWeek)?.label} · Bloque {s.blockNumber} ({s.startTime})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="activity-type">Tipo de actividad</Label>
                <Select value={actType} onValueChange={setActType}>
                  <SelectTrigger id="activity-type">
                    <SelectValue placeholder="Selecciona tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACTIVITY_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="activity-title">Título de la actividad</Label>
                <Input
                  id="activity-title"
                  value={actTitle}
                  onChange={(e) => setActTitle(e.target.value)}
                  placeholder="Ej. Consejo de Profesores"
                />
              </div>
              <Button
                className="w-full"
                disabled={saving || !activeVersion || !actTeacherId || !actSlotId}
                onClick={async () => {
                  if (!activeVersion) return;
                  setSaving(true);
                  try {
                    const res = await fetch(`/api/horarios/versions/${activeVersion.id}/activities`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        teacherId: actTeacherId,
                        timeSlotId: actSlotId,
                        activityType: actType,
                        title: actTitle,
                      }),
                    });
                    if (res.ok) {
                      showToast({
                        variant: "success",
                        title: "Actividad reservada",
                        description: "Bloque no lectivo registrado en la versión activa.",
                      });
                      await onRefresh();
                    }
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Plus className="h-4 w-4" />
                Agregar Actividad No Lectiva
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">
                Actividades No Lectivas en Versión Activa ({activeVersion?.nonTeachingActivities.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(activeVersion?.nonTeachingActivities ?? []).length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  No hay actividades administrativas registradas en esta versión.
                </p>
              ) : (
                activeVersion?.nonTeachingActivities.map((act) => (
                  <div
                    key={act.id}
                    className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/8 p-3"
                  >
                    <div>
                      <div className="font-semibold text-sm">
                        {act.title} — {act.teacher.firstName} {act.teacher.lastName}
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {ACTIVITY_TYPE_LABELS[act.activityType]} ·{" "}
                        {DAYS_OF_WEEK.find((d) => d.value === act.timeSlot.dayOfWeek)?.label} Bloque{" "}
                        {act.timeSlot.blockNumber} ({act.timeSlot.startTime})
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={async () => {
                        await fetch(
                          `/api/horarios/versions/${activeVersion.id}/activities?id=${act.id}`,
                          { method: "DELETE" }
                        );
                        await onRefresh();
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* CARGA MASIVA EXCEL/CSV */}
      {subTab === "import" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Carga Masiva con Validación Previa (dryRunImport)</CardTitle>
            <CardDescription>
              Sube un archivo Excel (.xlsx) con hojas &quot;Profesores&quot;, &quot;Salas&quot;, &quot;Asignaturas&quot; y &quot;Cursos&quot; (o CSV).
              El sistema detecta duplicados y excesos Ley 20.903 antes de guardar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="import-file">Archivo Excel o CSV (.xlsx, .xls, .csv)</Label>
                <Input
                  id="import-file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    setImportFile(e.target.files?.[0] ?? null);
                    setDryRunResult(null);
                  }}
                  className="max-w-xs cursor-pointer text-xs"
                />
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={!importFile || saving}
                onClick={() => void handleImport("dryRun")}
              >
                Previsualizar y Validar
              </Button>
              {dryRunResult?.valid && (
                <Button size="sm" disabled={saving} onClick={() => void handleImport("commit")}>
                  Confirmar e Importar
                </Button>
              )}
            </div>

            {dryRunResult && (
              <div className="space-y-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-subtle)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {dryRunResult.valid ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Archivo válido para importar
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 border-red-500/40 text-red-500">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Errores bloqueantes encontrados
                    </Badge>
                  )}
                  <span className="text-xs text-[var(--text-muted)]">
                    Profesores: {dryRunResult.summary.teachers} · Salas: {dryRunResult.summary.rooms} ·
                    Asignaturas: {dryRunResult.summary.subjects} · Cursos: {dryRunResult.summary.courses}
                  </span>
                </div>

                {dryRunResult.issues.length > 0 && (
                  <div className="space-y-1.5">
                    {dryRunResult.issues.map((issue, idx) => (
                      <div
                        key={idx}
                        className={`rounded-lg px-3 py-2 text-xs ${
                          issue.severity === "ERROR"
                            ? "bg-red-500/10 text-red-500"
                            : "bg-amber-500/10 text-amber-500"
                        }`}
                      >
                        <strong>
                          [{issue.sheet} · Fila {issue.row}]
                        </strong>{" "}
                        {issue.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
