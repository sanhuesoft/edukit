"use client";

import React, { useMemo, useState } from "react";
import { Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import type { LevelCode } from "@prisma/client";
import {
  LEVEL_LABELS,
  TEACHER_AUTO_PALETTE,
  type TeacherLey20903Override,
} from "@/lib/scheduling/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { ColorPalettePicker } from "../ColorPalettePicker";
import type { SchoolSetupPayload, TeacherDTO } from "../types";

interface StepDocentesProps {
  setup: SchoolSetupPayload;
  onRefresh: () => Promise<void>;
  onNextStep: () => void;
}

export function StepDocentes({ setup, onRefresh, onNextStep }: StepDocentesProps) {
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherDTO | null>(null);
  const [busy, setBusy] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [contractHours, setContractHours] = useState(44);
  const [maxTeachingBlocks, setMaxTeachingBlocks] = useState<string>("");
  const [maxDailyHours, setMaxDailyHours] = useState(7);
  const [ley20903Ratio, setLey20903Ratio] = useState<TeacherLey20903Override>("AUTO");
  const [colorHex, setColorHex] = useState("#3F69BD");
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [levelCodes, setLevelCodes] = useState<LevelCode[]>([]);

  const openCreate = () => {
    setEditing(null);
    setFirstName("");
    setLastName("");
    setEmail("");
    setContractHours(44);
    setMaxTeachingBlocks("");
    setMaxDailyHours(7);
    setLey20903Ratio("AUTO");
    setColorHex(
      TEACHER_AUTO_PALETTE[setup.teachers.length % TEACHER_AUTO_PALETTE.length] ||
        "#3F69BD"
    );
    setSubjectIds([]);
    setLevelCodes(["MEDIA_1_2", "MEDIA_3_4"]);
    setDialogOpen(true);
  };

  const openEdit = (teacher: TeacherDTO) => {
    setEditing(teacher);
    setFirstName(teacher.firstName);
    setLastName(teacher.lastName);
    setEmail(teacher.email ?? "");
    setContractHours(teacher.contractHours);
    setMaxTeachingBlocks(String(teacher.maxTeachingBlocks));
    setMaxDailyHours(teacher.maxDailyHours);
    setLey20903Ratio(teacher.ley20903Ratio || "AUTO");
    setColorHex(teacher.colorHex || "#3F69BD");
    setSubjectIds(teacher.qualifiedSubjects.map((qs) => qs.subjectId));
    setLevelCodes(teacher.qualifiedLevels.map((ql) => ql.levelCode));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) return;
    setBusy(true);
    try {
      const payloadData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || null,
        contractHours: Number(contractHours) || 44,
        maxTeachingBlocks: maxTeachingBlocks.trim() === "" ? null : Number(maxTeachingBlocks),
        maxDailyHours: Number(maxDailyHours) || 7,
        ley20903Ratio,
        colorHex,
        subjectIds,
        levelCodes,
      };

      const res = await fetch("/api/horarios/setup/entities", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing
            ? { entity: "teacher", id: editing.id, data: payloadData }
            : { entity: "teacher", data: payloadData }
        ),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo guardar el docente.");
      showToast({
        variant: "success",
        title: editing ? "Docente actualizado" : "Docente creado",
        description: `${firstName.trim()} ${lastName.trim()} guardado correctamente.`,
      });
      setDialogOpen(false);
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error al guardar",
        description: err instanceof Error ? err.message : "Verifica los datos.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (teacher: TeacherDTO) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/horarios/setup/entities?entity=teacher&id=${teacher.id}`,
        { method: "DELETE" }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar.");
      showToast({
        variant: "success",
        title: "Docente eliminado",
        description: `Se eliminó a ${teacher.firstName} ${teacher.lastName}.`,
      });
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo eliminar el docente.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRecalculateLey20903 = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/horarios/setup/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "recalculate_ley20903", data: {} }),
      });
      const data = (await res.json()) as { updatedCount?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Error al recalcular.");
      showToast({
        variant: "success",
        title: "Topes Ley 20.903 recalculados",
        description: `Se actualizaron ${data.updatedCount ?? 0} docentes según sus horas de contrato.`,
      });
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo recalcular.",
      });
    } finally {
      setBusy(false);
    }
  };

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return setup.teachers.filter((t) => {
      if (
        subjectFilter !== "ALL" &&
        !t.qualifiedSubjects.some((qs) => qs.subjectId === subjectFilter)
      ) {
        return false;
      }
      if (q) {
        const full = `${t.firstName} ${t.lastName} ${t.email ?? ""}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });
  }, [setup.teachers, search, subjectFilter]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold tracking-tight">5. Docentes</h1>
          <Badge variant="secondary">{setup.teachers.length}</Badge>
          <HelpTip text="Registra el cuerpo docente con su contrato, tope Ley 20.903 y las asignaturas que puede impartir para facilitar el filtrado en el Plan de estudios." />
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRecalculateLey20903}
            disabled={busy || setup.teachers.length === 0}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Recalcular Ley 20.903
          </Button>
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo docente
          </Button>
          <Button size="sm" onClick={onNextStep}>
            Continuar a Plan de estudios
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 border-b bg-muted/20 px-6 py-2.5">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar docente por nombre o correo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue placeholder="Filtrar por asignatura" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas las asignaturas</SelectItem>
            {setup.subjects.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} ({s.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Color</TableHead>
                <TableHead>Docente</TableHead>
                <TableHead className="w-28">Contrato</TableHead>
                <TableHead className="w-36">Carga / Tope</TableHead>
                <TableHead className="w-24">Proporción</TableHead>
                <TableHead>Asignaturas que imparte</TableHead>
                <TableHead className="w-24 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTeachers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No hay docentes registrados. Haz clic en &quot;Nuevo docente&quot; para agregar.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTeachers.map((teacher) => {
                  const assignedBlocks = teacher.courseSubjects.reduce(
                    (sum, cs) => sum + (cs.assignedBlocks ?? cs.courseSubject.weeklyBlocks),
                    0
                  );
                  const overloaded = assignedBlocks > teacher.maxTeachingBlocks;
                  return (
                    <TableRow key={teacher.id}>
                      <TableCell>
                        <span
                          className="inline-block h-5 w-5 rounded-full border border-black/15"
                          style={{ backgroundColor: teacher.colorHex || "#3F69BD" }}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {teacher.firstName} {teacher.lastName}
                        </div>
                        {teacher.email && (
                          <div className="text-xs text-muted-foreground">
                            {teacher.email}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{teacher.contractHours} hrs</TableCell>
                      <TableCell>
                        <Badge
                          variant={overloaded ? "destructive" : "secondary"}
                          className="font-mono text-xs font-normal"
                        >
                          {assignedBlocks} / {teacher.maxTeachingBlocks} blq
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {teacher.ley20903Ratio === "AUTO"
                          ? "Auto"
                          : teacher.ley20903Ratio.replace("_", "/")}
                      </TableCell>
                      <TableCell>
                        {teacher.qualifiedSubjects.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Sin especificar</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {teacher.qualifiedSubjects.map((qs) => (
                              <Badge
                                key={qs.subjectId}
                                variant="outline"
                                className="gap-1 text-[11px] font-normal"
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{
                                    backgroundColor: qs.subject.colorHex || "#2563EB",
                                  }}
                                />
                                {qs.subject.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(teacher)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(teacher)}
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

      {/* Dialog Crear/Editar Docente */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar docente" : "Nuevo docente"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-12 gap-5 py-2">
            {/* Columna izquierda: datos básicos y contrato */}
            <div className="col-span-6 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="t-first">Nombre</Label>
                  <Input
                    id="t-first"
                    placeholder="María"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-last">Apellido</Label>
                  <Input
                    id="t-last"
                    placeholder="González"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="t-email">Correo (opcional)</Label>
                <Input
                  id="t-email"
                  type="email"
                  placeholder="mgonzalez@colegio.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="space-y-1.5">
                  <Label htmlFor="t-hours" className="text-xs">
                    Contrato (h)
                  </Label>
                  <Input
                    id="t-hours"
                    type="number"
                    min={1}
                    max={44}
                    value={contractHours}
                    onChange={(e) => setContractHours(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-maxblq" className="flex items-center gap-1 text-xs">
                    Tope blq
                    <HelpTip text="Si lo dejas vacío se calcula automáticamente según la Ley 20.903." />
                  </Label>
                  <Input
                    id="t-maxblq"
                    type="number"
                    min={1}
                    max={45}
                    placeholder="Auto"
                    value={maxTeachingBlocks}
                    onChange={(e) => setMaxTeachingBlocks(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-daily" className="text-xs">
                    Máx/día
                  </Label>
                  <Input
                    id="t-daily"
                    type="number"
                    min={1}
                    max={12}
                    value={maxDailyHours}
                    onChange={(e) => setMaxDailyHours(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs">
                  Proporción Ley 20.903
                  <HelpTip text="Automático usa la política global del establecimiento (65/35 general o 60/40 en 1°-4° Básico)." />
                </Label>
                <Select
                  value={ley20903Ratio}
                  onValueChange={(v) => setLey20903Ratio(v as TeacherLey20903Override)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTO">Automático (según colegio)</SelectItem>
                    <SelectItem value="65_35">65% lectivo / 35% no lectivo</SelectItem>
                    <SelectItem value="60_40">60% lectivo / 40% no lectivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Niveles habilitados</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(LEVEL_LABELS) as LevelCode[]).map((lvl) => {
                    const checked = levelCodes.includes(lvl);
                    return (
                      <label
                        key={lvl}
                        className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(val) =>
                            setLevelCodes((prev) =>
                              val ? [...prev, lvl] : prev.filter((x) => x !== lvl)
                            )
                          }
                        />
                        <span className="truncate">{LEVEL_LABELS[lvl]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Columna derecha: asignaturas habilitadas + color */}
            <div className="col-span-6 space-y-3.5">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  Asignaturas que puede impartir ({subjectIds.length})
                  <HelpTip text="Al armar el Plan de estudios te mostraremos primero los docentes habilitados para cada asignatura." />
                </Label>
                <ScrollArea className="h-44 rounded-lg border bg-muted/20 p-2">
                  {setup.subjects.length === 0 ? (
                    <p className="p-4 text-center text-xs text-muted-foreground">
                      Primero crea asignaturas en el paso 4.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {setup.subjects.map((subj) => {
                        const checked = subjectIds.includes(subj.id);
                        return (
                          <label
                            key={subj.id}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-background"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(val) =>
                                setSubjectIds((prev) =>
                                  val
                                    ? [...prev, subj.id]
                                    : prev.filter((id) => id !== subj.id)
                                )
                              }
                            />
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: subj.colorHex || "#2563EB" }}
                            />
                            <span className="truncate font-medium">{subj.name}</span>
                            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                              {subj.code}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>

              <ColorPalettePicker
                label="Color del docente"
                value={colorHex}
                onChange={setColorHex}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={busy || !firstName.trim() || !lastName.trim()}
            >
              {editing ? "Guardar cambios" : "Crear docente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
