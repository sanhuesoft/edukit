"use client";

import React, { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import type { LevelCode } from "@prisma/client";
import { LEVEL_LABELS } from "@/lib/scheduling/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import type { CourseDTO, SchoolSetupPayload } from "../types";

interface StepCursosProps {
  setup: SchoolSetupPayload;
  onRefresh: () => Promise<void>;
  onNextStep: () => void;
}

export function StepCursos({ setup, onRefresh, onNextStep }: StepCursosProps) {
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CourseDTO | null>(null);
  const [busy, setBusy] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [levelCode, setLevelCode] = useState<LevelCode>("MEDIA_1_2");
  const [bellScheduleId, setBellScheduleId] = useState(
    setup.bellSchedules[0]?.id ?? ""
  );
  const [studentCount, setStudentCount] = useState(35);
  const [requiresGroundFloor, setRequiresGroundFloor] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setCode("");
    setLevelCode("MEDIA_1_2");
    setBellScheduleId(setup.bellSchedules[0]?.id ?? "");
    setStudentCount(35);
    setRequiresGroundFloor(false);
    setDialogOpen(true);
  };

  const openEdit = (course: CourseDTO) => {
    setEditing(course);
    setName(course.name);
    setCode(course.code);
    setLevelCode(course.levelCode);
    setBellScheduleId(course.bellScheduleId);
    setStudentCount(course.studentCount ?? 35);
    setRequiresGroundFloor(Boolean(course.requiresGroundFloor));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !bellScheduleId) return;
    setBusy(true);
    try {
      const derivedCode =
        code.trim() ||
        name
          .trim()
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 6)
          .toUpperCase();

      const res = await fetch("/api/horarios/setup/entities", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing
            ? {
                entity: "course",
                id: editing.id,
                data: {
                  name: name.trim(),
                  code: derivedCode,
                  levelCode,
                  bellScheduleId,
                  studentCount: Number(studentCount) || 35,
                  requiresGroundFloor,
                },
              }
            : {
                entity: "course",
                data: {
                  name: name.trim(),
                  code: derivedCode,
                  levelCode,
                  bellScheduleId,
                  studentCount: Number(studentCount) || 35,
                  requiresGroundFloor,
                },
              }
        ),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo guardar el curso.");
      showToast({
        variant: "success",
        title: editing ? "Curso actualizado" : "Curso creado",
        description: `"${name.trim()}" guardado correctamente.`,
      });
      setDialogOpen(false);
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error al guardar",
        description: err instanceof Error ? err.message : "Verifica los campos.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (course: CourseDTO) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/horarios/setup/entities?entity=course&id=${course.id}`,
        { method: "DELETE" }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar.");
      showToast({
        variant: "success",
        title: "Curso eliminado",
        description: `Se eliminó "${course.name}".`,
      });
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "No se pudo eliminar",
        description: err instanceof Error ? err.message : "Error al eliminar curso.",
      });
    } finally {
      setBusy(false);
    }
  };

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return setup.courses.filter((c) => {
      if (levelFilter !== "ALL" && c.levelCode !== levelFilter) return false;
      if (q && !c.name.toLowerCase().includes(q) && !c.code.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [setup.courses, search, levelFilter]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold tracking-tight">2. Cursos</h1>
          <Badge variant="secondary">{setup.courses.length}</Badge>
          <HelpTip text="Agrega los cursos del establecimiento. En el siguiente paso (Salas) podrás crear automáticamente una sala fija para cada curso o configurar salas rotativas." />
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={openCreate}
            disabled={setup.bellSchedules.length === 0}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo curso
          </Button>
          <Button size="sm" onClick={onNextStep}>
            Continuar a Salas
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 border-b bg-muted/20 px-6 py-2.5">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar curso o código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="h-8 w-48 text-xs">
            <SelectValue placeholder="Todos los niveles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los niveles</SelectItem>
            {(Object.keys(LEVEL_LABELS) as LevelCode[]).map((lvl) => (
              <SelectItem key={lvl} value={lvl}>
                {LEVEL_LABELS[lvl]}
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
                <TableHead>Curso</TableHead>
                <TableHead className="w-28">Código</TableHead>
                <TableHead className="w-40">Nivel</TableHead>
                <TableHead className="w-44">Jornada</TableHead>
                <TableHead className="w-28">Matrícula</TableHead>
                <TableHead className="w-40">Sala fija</TableHead>
                <TableHead className="w-28">Accesibilidad</TableHead>
                <TableHead className="w-24 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCourses.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No hay cursos registrados. Haz clic en &quot;Nuevo curso&quot; para comenzar.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCourses.map((course) => (
                  <TableRow key={course.id}>
                    <TableCell className="font-medium">{course.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {course.code}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs font-normal">
                        {LEVEL_LABELS[course.levelCode]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {course.bellSchedule.name}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        {course.studentCount ?? 35}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {course.defaultRoom ? (
                        <Badge variant="outline" className="font-normal">
                          {course.defaultRoom.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Sin asignar</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {course.requiresGroundFloor ? (
                        <Badge variant="outline" className="text-[11px]">
                          1° piso
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
                          onClick={() => openEdit(course)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(course)}
                          disabled={busy}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar curso" : "Nuevo curso"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="course-name">Nombre</Label>
                <Input
                  id="course-name"
                  placeholder="Ej. 1° Medio A"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="course-code">Código</Label>
                <Input
                  id="course-code"
                  placeholder="1MA"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nivel</Label>
                <Select
                  value={levelCode}
                  onValueChange={(v) => setLevelCode(v as LevelCode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LEVEL_LABELS) as LevelCode[]).map((lvl) => (
                      <SelectItem key={lvl} value={lvl}>
                        {LEVEL_LABELS[lvl]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Jornada</Label>
                <Select value={bellScheduleId} onValueChange={setBellScheduleId}>
                  <SelectTrigger>
                    <SelectValue />
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
            </div>

            <div className="grid grid-cols-2 items-center gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="course-students">Matrícula (alumnos)</Label>
                <Input
                  id="course-students"
                  type="number"
                  min={1}
                  max={60}
                  value={studentCount}
                  onChange={(e) => setStudentCount(Number(e.target.value))}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3 pt-2.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="course-floor" className="text-xs">
                    Requiere 1° piso
                  </Label>
                  <HelpTip text="Útil para cursos de 1°-2° Básico o con estudiantes con movilidad reducida." />
                </div>
                <Switch
                  id="course-floor"
                  checked={requiresGroundFloor}
                  onCheckedChange={setRequiresGroundFloor}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={busy || !name.trim()}>
              {editing ? "Guardar cambios" : "Crear curso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
