"use client";

import React, { useMemo, useState } from "react";
import { withBasePath } from "@/lib/basePath";
import { Copy, HeartHandshake, Layers, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { calculateEffectiveCourseBlocks, LEVEL_LABELS } from "@/lib/scheduling/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { HelpTip } from "../HelpTip";
import type { CourseSubjectDTO, SchoolSetupPayload } from "../types";

interface StepPlanEstudiosProps {
  setup: SchoolSetupPayload;
  onRefresh: () => Promise<void>;
  onNextStep: () => void;
}

export function StepPlanEstudios({
  setup,
  onRefresh,
  onNextStep,
}: StepPlanEstudiosProps) {
  const { showToast } = useToast();
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    setup.courses[0]?.id ?? ""
  );
  const [courseSearch, setCourseSearch] = useState("");
  const [busy, setBusy] = useState(false);

  // Dialog agregar/editar asignatura del plan
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CourseSubjectDTO | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("__NONE__");
  const [showAllTeachers, setShowAllTeachers] = useState(false);
  const [weeklyBlocks, setWeeklyBlocks] = useState(4);
  const [requiresConsecutive, setRequiresConsecutive] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [syncGroupCode, setSyncGroupCode] = useState("");
  const [propagateSyncRename, setPropagateSyncRename] = useState(true);

  // Apoyo PIE (educadora diferencial que acompaña algunos bloques)
  const [pieEnabled, setPieEnabled] = useState(false);
  const [pieTeacherId, setPieTeacherId] = useState("__NONE__");
  const [pieBlocks, setPieBlocks] = useState(2);
  const [pieResourceBlocks, setPieResourceBlocks] = useState(0);
  const [pieRoomId, setPieRoomId] = useState("__ANY__");
  // Otros docentes de la asignatura (codocentes) que el diálogo no edita pero debe conservar
  const [extraTeachers, setExtraTeachers] = useState<CourseSubjectDTO["teachers"]>([]);

  const pieRooms = useMemo(
    () => setup.rooms.filter((r) => r.roomType === "PIE_ROOM"),
    [setup.rooms]
  );

  // Dialog copiar plan
  const [copyOpen, setCopyOpen] = useState(false);
  const [targetCourseIds, setTargetCourseIds] = useState<string[]>([]);

  const selectedCourse = useMemo(
    () =>
      setup.courses.find((c) => c.id === selectedCourseId) ?? setup.courses[0] ?? null,
    [setup.courses, selectedCourseId]
  );

  const bellBlocksByScheduleId = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of setup.bellSchedules) {
      map.set(
        b.id,
        b.timeSlots.filter((s) => s.slotType === "CLASS").length
      );
    }
    return map;
  }, [setup.bellSchedules]);

  const existingSyncGroups = useMemo(() => {
    const set = new Set<string>();
    for (const c of setup.courses) {
      for (const cs of c.courseSubjects) {
        if (cs.syncGroupCode) set.add(cs.syncGroupCode);
      }
    }
    return Array.from(set).sort();
  }, [setup.courses]);

  const filteredCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase();
    return setup.courses.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [setup.courses, courseSearch]);

  const filteredTeachersForSubject = useMemo(() => {
    if (!subjectId || showAllTeachers) return setup.teachers;
    const qualified = setup.teachers.filter((t) =>
      t.qualifiedSubjects.some((qs) => qs.subjectId === subjectId)
    );
    return qualified.length > 0 ? qualified : setup.teachers;
  }, [setup.teachers, subjectId, showAllTeachers]);

  const hasQualifiedMatches = useMemo(() => {
    if (!subjectId) return false;
    return setup.teachers.some((t) =>
      t.qualifiedSubjects.some((qs) => qs.subjectId === subjectId)
    );
  }, [setup.teachers, subjectId]);

  const openCreate = () => {
    if (!selectedCourse) return;
    setEditing(null);
    const usedIds = new Set(selectedCourse.courseSubjects.map((cs) => cs.subjectId));
    const firstUnused = setup.subjects.find((s) => !usedIds.has(s.id)) ?? setup.subjects[0];
    setSubjectId(firstUnused?.id ?? "");
    setTeacherId("__NONE__");
    setShowAllTeachers(false);
    setWeeklyBlocks(4);
    setRequiresConsecutive(false);
    setIsSynced(false);
    setSyncGroupCode("");
    setPieEnabled(false);
    setPieTeacherId("__NONE__");
    setPieBlocks(2);
    setPieResourceBlocks(0);
    setPieRoomId("__ANY__");
    setExtraTeachers([]);
    setDialogOpen(true);
  };

  const openEdit = (cs: CourseSubjectDTO) => {
    setEditing(cs);
    setSubjectId(cs.subjectId);
    const lead = cs.teachers.find((t) => t.role === "LEAD") ?? null;
    const pie = cs.teachers.find((t) => t.role === "PIE_SUPPORT") ?? null;
    setTeacherId(lead?.teacherId ?? "__NONE__");
    setPieEnabled(Boolean(pie));
    setPieTeacherId(pie?.teacherId ?? "__NONE__");
    setPieBlocks(pie ? (pie.assignedBlocks ?? cs.weeklyBlocks) : Math.min(2, cs.weeklyBlocks));
    setPieResourceBlocks(pie?.resourceRoomBlocks ?? 0);
    setPieRoomId(pie?.resourceRoomId ?? "__ANY__");
    setExtraTeachers(cs.teachers.filter((t) => t !== lead && t !== pie));
    setShowAllTeachers(false);
    setWeeklyBlocks(cs.weeklyBlocks);
    setRequiresConsecutive(cs.requiresConsecutiveBlocks);
    setIsSynced(Boolean(cs.syncGroupCode));
    setSyncGroupCode(cs.syncGroupCode ?? "");
    setPropagateSyncRename(true);
    setDialogOpen(true);
  };

  const otherMembersInOriginalGroup = useMemo(() => {
    const orig = editing?.syncGroupCode?.trim();
    if (!editing || !orig) return 0;
    let count = 0;
    for (const c of setup.courses) {
      for (const cs of c.courseSubjects) {
        if (cs.id !== editing.id && cs.syncGroupCode?.trim() === orig) {
          count++;
        }
      }
    }
    return count;
  }, [editing, setup.courses]);

  const showSyncRenameChoice = Boolean(
    editing?.syncGroupCode &&
      isSynced &&
      syncGroupCode.trim() &&
      syncGroupCode.trim() !== editing.syncGroupCode &&
      otherMembersInOriginalGroup > 0
  );

  const handleSave = async () => {
    if (!selectedCourse || !subjectId) return;
    setBusy(true);
    try {
      const cleanSync = isSynced && syncGroupCode.trim() ? syncGroupCode.trim() : null;
      const blocks = Number(weeklyBlocks) || 2;
      const teachersPayload: Array<{
        teacherId: string;
        role: "LEAD" | "CO_TEACHER" | "PIE_SUPPORT";
        assignedBlocks: number | null;
        resourceRoomBlocks?: number;
        resourceRoomId?: string | null;
      }> = [];
      if (teacherId && teacherId !== "__NONE__") {
        teachersPayload.push({ teacherId, role: "LEAD", assignedBlocks: null });
      }
      const usedTeacherIds = new Set(teachersPayload.map((t) => t.teacherId));
      if (pieEnabled && pieTeacherId !== "__NONE__" && !usedTeacherIds.has(pieTeacherId)) {
        const supportBlocks = Math.min(blocks, Math.max(1, Number(pieBlocks) || 1));
        teachersPayload.push({
          teacherId: pieTeacherId,
          role: "PIE_SUPPORT",
          assignedBlocks: supportBlocks >= blocks ? null : supportBlocks,
          resourceRoomBlocks: Math.min(supportBlocks, Math.max(0, Number(pieResourceBlocks) || 0)),
          resourceRoomId: pieRoomId === "__ANY__" ? null : pieRoomId,
        });
        usedTeacherIds.add(pieTeacherId);
      }
      for (const t of extraTeachers) {
        if (usedTeacherIds.has(t.teacherId)) continue;
        teachersPayload.push({
          teacherId: t.teacherId,
          role: t.role,
          assignedBlocks: t.assignedBlocks,
          resourceRoomBlocks: t.resourceRoomBlocks,
          resourceRoomId: t.resourceRoomId,
        });
        usedTeacherIds.add(t.teacherId);
      }

      const res = await fetch(withBasePath("/api/horarios/setup/entities"), {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing
            ? {
                entity: "courseSubject",
                id: editing.id,
                data: {
                  courseId: selectedCourse.id,
                  subjectId,
                  weeklyBlocks: Number(weeklyBlocks) || 2,
                  requiresConsecutiveBlocks: requiresConsecutive,
                  syncGroupCode: cleanSync,
                  isSplitClass: Boolean(cleanSync),
                  propagateSyncRename: showSyncRenameChoice ? propagateSyncRename : false,
                  teachers: teachersPayload,
                },
              }
            : {
                entity: "courseSubject",
                data: {
                  courseId: selectedCourse.id,
                  subjectId,
                  weeklyBlocks: Number(weeklyBlocks) || 2,
                  requiresConsecutiveBlocks: requiresConsecutive,
                  syncGroupCode: cleanSync,
                  isSplitClass: Boolean(cleanSync),
                  teachers: teachersPayload,
                },
              }
        ),
      });
      const data = (await res.json()) as { propagatedCount?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      showToast({
        variant: "success",
        title:
          data.propagatedCount && data.propagatedCount > 0
            ? "Grupo sincronizado renombrado"
            : editing
              ? "Asignación actualizada"
              : "Asignatura agregada al plan",
        description:
          data.propagatedCount && data.propagatedCount > 0 && cleanSync
            ? `Se renombró a "${cleanSync}" en ${data.propagatedCount + 1} asignaturas del establecimiento.`
            : `Plan de ${selectedCourse.name} actualizado.`,
      });
      setDialogOpen(false);
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo guardar la carga.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (cs: CourseSubjectDTO) => {
    setBusy(true);
    try {
      const res = await fetch(
        withBasePath(`/api/horarios/setup/entities?entity=courseSubject&id=${cs.id}`),
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("No se pudo eliminar.");
      showToast({
        variant: "success",
        title: "Asignatura quitada del plan",
        description: `Se quitó ${cs.subject.name}.`,
      });
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "Error al eliminar.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCopyPlan = async () => {
    if (!selectedCourse || targetCourseIds.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(withBasePath("/api/horarios/setup/entities"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "copyCoursePlan",
          data: {
            sourceCourseId: selectedCourse.id,
            targetCourseIds,
          },
        }),
      });
      const data = (await res.json()) as { copiedCount?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo copiar el plan.");
      showToast({
        variant: "success",
        title: "Plan copiado",
        description: `Se copiaron ${data.copiedCount ?? 0} asignaciones a ${targetCourseIds.length} curso(s).`,
      });
      setTargetCourseIds([]);
      setCopyOpen(false);
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error al copiar",
        description: err instanceof Error ? err.message : "Intenta nuevamente.",
      });
    } finally {
      setBusy(false);
    }
  };

  const selectedTotalBlocks = selectedCourse
    ? calculateEffectiveCourseBlocks(selectedCourse.courseSubjects)
    : 0;
  const selectedMaxBlocks = selectedCourse
    ? bellBlocksByScheduleId.get(selectedCourse.bellScheduleId) ?? 0
    : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold tracking-tight">6. Plan de estudios</h1>
          <HelpTip text="Selecciona cada curso a la izquierda y define sus asignaturas, docente titular, bloques semanales y si pertenece a un grupo sincronizado (ej. Electivos o Talleres simultáneos)." />
        </div>
        <Button size="sm" onClick={onNextStep}>
          Continuar a Reglas
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Lista maestra de cursos a la izquierda */}
        <aside className="flex w-72 shrink-0 flex-col border-r bg-muted/20">
          <div className="border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar curso..."
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                className="h-8 bg-background pl-8 text-xs"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-1 p-2">
              {filteredCourses.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  No hay cursos disponibles.
                </p>
              ) : (
                filteredCourses.map((course) => {
                  const total = calculateEffectiveCourseBlocks(course.courseSubjects);
                  const max = bellBlocksByScheduleId.get(course.bellScheduleId) ?? 0;
                  const pct = max > 0 ? Math.min(100, Math.round((total / max) * 100)) : 0;
                  const isSelected = selectedCourse?.id === course.id;
                  const isOver = max > 0 && total > max;

                  return (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => setSelectedCourseId(course.id)}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        isSelected
                          ? "border-primary bg-background shadow-xs"
                          : "border-transparent hover:bg-background/70"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{course.name}</span>
                        <span
                          className={`font-mono text-xs ${
                            isOver
                              ? "font-semibold text-destructive"
                              : "text-muted-foreground"
                          }`}
                        >
                          {total}/{max || "?"}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{LEVEL_LABELS[course.levelCode]}</span>
                        <span>{course.courseSubjects.length} asig.</span>
                      </div>
                      {max > 0 && <Progress value={pct} className="mt-2 h-1" />}
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Detalle del curso seleccionado a la derecha */}
        <section className="flex flex-1 flex-col overflow-hidden bg-background">
          {!selectedCourse ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Crea al menos un curso en el paso 2 para configurar su plan de estudios.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b px-6 py-3">
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">{selectedCourse.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {LEVEL_LABELS[selectedCourse.levelCode]} · {selectedCourse.bellSchedule.name}
                    </p>
                  </div>
                  <Badge
                    variant={
                      selectedMaxBlocks > 0 && selectedTotalBlocks > selectedMaxBlocks
                        ? "destructive"
                        : "secondary"
                    }
                    className="font-mono text-xs"
                  >
                    {selectedTotalBlocks} / {selectedMaxBlocks} bloques asignados
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTargetCourseIds([]);
                      setCopyOpen(true);
                    }}
                    disabled={
                      selectedCourse.courseSubjects.length === 0 ||
                      setup.courses.length <= 1
                    }
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copiar plan
                  </Button>
                  <Button
                    size="sm"
                    onClick={openCreate}
                    disabled={setup.subjects.length === 0}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Agregar asignatura
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-6">
                <div className="rounded-lg border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Asignatura</TableHead>
                        <TableHead>Docente asignado</TableHead>
                        <TableHead className="w-28 text-center">Bloques/sem</TableHead>
                        <TableHead className="w-32">Pareados</TableHead>
                        <TableHead className="w-44">Grupo sincronizado</TableHead>
                        <TableHead className="w-24 text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedCourse.courseSubjects.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="h-32 text-center text-sm text-muted-foreground"
                          >
                            Este curso aún no tiene asignaturas en su plan. Haz clic en
                            &quot;Agregar asignatura&quot;.
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedCourse.courseSubjects.map((cs) => {
                          const lead = (
                            cs.teachers.find((t) => t.role === "LEAD") ?? cs.teachers[0]
                          )?.teacher;
                          const pie = cs.teachers.find((t) => t.role === "PIE_SUPPORT");
                          const others = cs.teachers.filter(
                            (t) => t.teacher !== lead && t !== pie
                          ).length;
                          return (
                            <TableRow key={cs.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span
                                    className="h-3 w-3 shrink-0 rounded-full"
                                    style={{
                                      backgroundColor: cs.subject.colorHex || "#2563EB",
                                    }}
                                  />
                                  <span className="font-medium">{cs.subject.name}</span>
                                  <span className="font-mono text-[11px] text-muted-foreground">
                                    {cs.subject.code}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {lead ? (
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                                      style={{ backgroundColor: lead.colorHex }}
                                    />
                                    <span className="text-sm">
                                      {lead.firstName} {lead.lastName}
                                    </span>
                                    {pie && pie.teacher !== lead && (
                                      <Badge
                                        variant="outline"
                                        className="gap-1 text-[10px]"
                                        title={`Apoyo PIE: ${pie.teacher.firstName} ${pie.teacher.lastName}`}
                                      >
                                        <HeartHandshake className="h-3 w-3" />
                                        PIE {pie.assignedBlocks ?? cs.weeklyBlocks}/{cs.weeklyBlocks}
                                        {pie.resourceRoomBlocks > 0
                                          ? ` · ${pie.resourceRoomBlocks} en A. Recursos`
                                          : ""}
                                      </Badge>
                                    )}
                                    {others > 0 && (
                                      <Badge variant="outline" className="text-[10px]">
                                        +{others}
                                      </Badge>
                                    )}
                                  </div>
                                ) : (
                                  <Badge variant="destructive" className="text-[11px] font-normal">
                                    Sin docente
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-center font-mono text-sm font-medium">
                                {cs.weeklyBlocks}
                              </TableCell>
                              <TableCell>
                                {cs.requiresConsecutiveBlocks ? (
                                  <Badge variant="secondary" className="text-xs font-normal">
                                    Dobles (90m)
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Libre</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {cs.syncGroupCode ? (
                                  <Badge
                                    variant="outline"
                                    className="gap-1 border-primary/40 text-xs font-medium text-primary"
                                  >
                                    <Layers className="h-3 w-3" />
                                    {cs.syncGroupCode}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => openEdit(cs)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleDelete(cs)}
                                    disabled={busy}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Dialog Agregar/Editar Carga Curricular */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar asignación" : `Agregar asignatura a ${selectedCourse?.name}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Asignatura</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona asignatura" />
                </SelectTrigger>
                <SelectContent>
                  {setup.subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  Docente
                  <HelpTip text="Se muestran primero los docentes habilitados para esta asignatura en el paso 5." />
                </Label>
                {hasQualifiedMatches && (
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Checkbox
                      checked={showAllTeachers}
                      onCheckedChange={(v) => setShowAllTeachers(Boolean(v))}
                    />
                    Mostrar todos
                  </label>
                )}
              </div>
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona docente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NONE__">Sin asignar todavía</SelectItem>
                  {filteredTeachersForSubject.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 items-center gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cs-blocks">Bloques semanales</Label>
                <Input
                  id="cs-blocks"
                  type="number"
                  min={1}
                  max={14}
                  value={weeklyBlocks}
                  onChange={(e) => setWeeklyBlocks(Number(e.target.value))}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="cs-consec" className="text-xs">
                    Bloques dobles
                  </Label>
                  <HelpTip text="Prioriza programar sesiones de 2 bloques consecutivos (90 min)." />
                </div>
                <Switch
                  id="cs-consec"
                  checked={requiresConsecutive}
                  onCheckedChange={setRequiresConsecutive}
                />
              </div>
            </div>

            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="cs-pie" className="text-xs font-medium">
                    Apoyo PIE
                  </Label>
                  <HelpTip text="Educador(a) diferencial que acompaña algunos bloques de esta asignatura. El generador elige en qué bloques va y, si corresponde, le asigna el Aula de Recursos mientras el titular sigue en la sala del curso." />
                </div>
                <Switch id="cs-pie" checked={pieEnabled} onCheckedChange={setPieEnabled} />
              </div>

              {pieEnabled && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Docente PIE</Label>
                    <Select value={pieTeacherId} onValueChange={setPieTeacherId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona docente" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__NONE__">Sin asignar todavía</SelectItem>
                        {setup.teachers
                          .filter((t) => t.id !== teacherId)
                          .map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.firstName} {t.lastName}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="cs-pie-blocks" className="text-xs">
                        Bloques con apoyo
                      </Label>
                      <Input
                        id="cs-pie-blocks"
                        type="number"
                        min={1}
                        max={weeklyBlocks}
                        value={pieBlocks}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setPieBlocks(v);
                          if (pieResourceBlocks > v) setPieResourceBlocks(Math.max(0, v));
                        }}
                      />
                      <p className="text-[11px] text-muted-foreground">de {weeklyBlocks} semanales</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cs-pie-resource" className="text-xs">
                        En Aula de Recursos
                      </Label>
                      <Input
                        id="cs-pie-resource"
                        type="number"
                        min={0}
                        max={Math.min(pieBlocks, weeklyBlocks)}
                        value={pieResourceBlocks}
                        onChange={(e) => setPieResourceBlocks(Number(e.target.value))}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        el resto, en aula regular
                      </p>
                    </div>
                  </div>
                  {pieResourceBlocks > 0 &&
                    (pieRooms.length === 0 ? (
                      <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                        No hay salas de tipo &quot;Sala de Apoyo / PIE&quot;. Créala en el paso Salas
                        para que el generador pueda asignar el Aula de Recursos.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Aula de Recursos</Label>
                        <Select value={pieRoomId} onValueChange={setPieRoomId}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__ANY__">Cualquier sala PIE disponible</SelectItem>
                            {pieRooms.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="cs-sync" className="text-xs font-medium">
                    Asignatura sincronizada
                  </Label>
                  <HelpTip text="Actívalo para electivos, talleres o grupos que deben ocurrir exactamente al mismo horario en distintos cursos o salas." />
                </div>
                <Switch
                  id="cs-sync"
                  checked={isSynced}
                  onCheckedChange={setIsSynced}
                />
              </div>

              {isSynced && (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="cs-sync-code" className="text-xs">
                    Nombre del grupo sincronizado
                  </Label>
                  <Input
                    id="cs-sync-code"
                    placeholder="Ej. ELECTIVOS_3M o TALLER_JEC"
                    value={syncGroupCode}
                    onChange={(e) => setSyncGroupCode(e.target.value)}
                  />
                  {existingSyncGroups.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {existingSyncGroups.map((g) => (
                        <Badge
                          key={g}
                          variant={syncGroupCode === g ? "default" : "outline"}
                          className="cursor-pointer text-[10px]"
                          onClick={() => setSyncGroupCode(g)}
                        >
                          {g}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {showSyncRenameChoice && editing?.syncGroupCode && (
                    <div className="mt-2 space-y-1.5 rounded-md border bg-background p-2.5">
                      <p className="text-[11px] font-medium text-foreground">
                        Hay otras {otherMembersInOriginalGroup} asignatura(s) en &quot;
                        {editing.syncGroupCode}&quot;:
                      </p>
                      <div className="space-y-1.5">
                        <label className="flex cursor-pointer items-start gap-2 rounded p-1 text-xs hover:bg-muted/50">
                          <input
                            type="radio"
                            name="sync-rename-mode"
                            checked={propagateSyncRename}
                            onChange={() => setPropagateSyncRename(true)}
                            className="mt-0.5 accent-primary"
                          />
                          <span>
                            <strong>Propagar a todo el grupo</strong> ({otherMembersInOriginalGroup + 1}{" "}
                            asignaturas pasarán a llamarse &quot;{syncGroupCode.trim()}&quot;)
                          </span>
                        </label>
                        <label className="flex cursor-pointer items-start gap-2 rounded p-1 text-xs hover:bg-muted/50">
                          <input
                            type="radio"
                            name="sync-rename-mode"
                            checked={!propagateSyncRename}
                            onChange={() => setPropagateSyncRename(false)}
                            className="mt-0.5 accent-primary"
                          />
                          <span>
                            <strong>Solo esta asignatura</strong> (dejar las otras en &quot;
                            {editing.syncGroupCode}&quot;)
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={busy || !subjectId}>
              {editing ? "Guardar cambios" : "Agregar al plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Copiar Plan a Otros Cursos */}
      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Copiar plan de {selectedCourse?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Elige los cursos destino. Se copiarán las asignaturas que aún no existan en cada curso.
            </p>
            <ScrollArea className="h-56 rounded-lg border p-2">
              <div className="space-y-1">
                {setup.courses
                  .filter((c) => c.id !== selectedCourse?.id)
                  .map((c) => {
                    const checked = targetCourseIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(val) =>
                            setTargetCourseIds((prev) =>
                              val ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                            )
                          }
                        />
                        <span>{c.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {LEVEL_LABELS[c.levelCode]}
                        </span>
                      </label>
                    );
                  })}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCopyPlan}
              disabled={busy || targetCourseIds.length === 0}
            >
              Copiar a {targetCourseIds.length} curso(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
