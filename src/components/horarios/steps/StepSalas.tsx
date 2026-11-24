"use client";

import React, { useMemo, useState } from "react";
import { withBasePath } from "@/lib/basePath";
import {
  Building2,
  CheckCircle2,
  DoorOpen,
  GraduationCap,
  Pencil,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { RoomType } from "@prisma/client";
import {
  ROOM_ASSIGNMENT_MODE_LABELS,
  ROOM_TYPE_LABELS,
  type RoomAssignmentMode,
} from "@/lib/scheduling/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import type { CourseDTO, RoomDTO, SchoolSetupPayload } from "../types";

interface StepSalasProps {
  setup: SchoolSetupPayload;
  onRefresh: () => Promise<void>;
  onNextStep: () => void;
}

export function StepSalas({ setup, onRefresh, onNextStep }: StepSalasProps) {
  const { showToast } = useToast();
  const [subTab, setSubTab] = useState<string>("modalidad");
  const [busy, setBusy] = useState(false);

  // Room modal state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomDTO | null>(null);
  const [roomName, setRoomName] = useState("");
  const [capacity, setCapacity] = useState(40);
  const [roomType, setRoomType] = useState<RoomType>("CLASSROOM");
  const [floor, setFloor] = useState(1);
  const [campus, setCampus] = useState("");

  const roomModeRule = useMemo(
    () => setup.rules.find((r) => r.ruleType === "ROOM_ASSIGNMENT_MODE"),
    [setup.rules]
  );

  const currentMode: RoomAssignmentMode = useMemo(() => {
    const raw = roomModeRule?.parameters?.mode;
    if (
      raw === "FIXED_COURSE_STRICT" ||
      raw === "FIXED_COURSE_WITH_SPECIALS" ||
      raw === "BY_SUBJECT"
    ) {
      return raw;
    }
    return "FIXED_COURSE_WITH_SPECIALS";
  }, [roomModeRule]);

  const coursesWithoutRoom = useMemo(
    () => setup.courses.filter((c) => !c.defaultRoomId),
    [setup.courses]
  );

  const handleChangeRoomMode = async (mode: RoomAssignmentMode) => {
    setBusy(true);
    try {
      const res = await fetch(withBasePath("/api/horarios/setup/entities"), {
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
      if (!res.ok) throw new Error("No se pudo actualizar la modalidad de salas.");
      showToast({
        variant: "success",
        title: "Modalidad actualizada",
        description: ROOM_ASSIGNMENT_MODE_LABELS[mode].label,
      });
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "Error al guardar modalidad.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleBulkCreateCourseRooms = async () => {
    if (coursesWithoutRoom.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(withBasePath("/api/horarios/setup/entities"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "bulkCreateCourseRooms",
          data: { courseIds: coursesWithoutRoom.map((c) => c.id) },
        }),
      });
      const data = (await res.json()) as { createdCount?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudieron crear las salas.");
      showToast({
        variant: "success",
        title: "Salas sugeridas creadas",
        description: `Se crearon y vincularon ${data.createdCount ?? 0} salas fijas para tus cursos.`,
      });
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudieron crear las salas.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAssignCourseRoom = async (course: CourseDTO, roomId: string) => {
    setBusy(true);
    try {
      const res = await fetch(withBasePath("/api/horarios/setup/entities"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "course",
          id: course.id,
          data: { defaultRoomId: roomId === "__NONE__" ? null : roomId },
        }),
      });
      if (!res.ok) throw new Error("No se pudo asignar la sala al curso.");
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo vincular la sala.",
      });
    } finally {
      setBusy(false);
    }
  };

  const openCreateRoom = (defaultType: RoomType = "CLASSROOM") => {
    setEditingRoom(null);
    setRoomName("");
    setCapacity(40);
    setRoomType(defaultType);
    setFloor(1);
    setCampus("");
    setDialogOpen(true);
  };

  const openEditRoom = (room: RoomDTO) => {
    setEditingRoom(room);
    setRoomName(room.name);
    setCapacity(room.capacity);
    setRoomType(room.roomType);
    setFloor(room.floor ?? 1);
    setCampus(room.campus ?? "");
    setDialogOpen(true);
  };

  const handleSaveRoom = async () => {
    if (!roomName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(withBasePath("/api/horarios/setup/entities"), {
        method: editingRoom ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingRoom
            ? {
                entity: "room",
                id: editingRoom.id,
                data: {
                  name: roomName.trim(),
                  capacity: Number(capacity) || 40,
                  roomType,
                  floor: Number(floor) || 1,
                  campus: campus.trim() || null,
                },
              }
            : {
                entity: "room",
                data: {
                  name: roomName.trim(),
                  capacity: Number(capacity) || 40,
                  roomType,
                  floor: Number(floor) || 1,
                  campus: campus.trim() || null,
                },
              }
        ),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo guardar la sala.");
      showToast({
        variant: "success",
        title: editingRoom ? "Sala actualizada" : "Sala creada",
        description: `"${roomName.trim()}" guardada correctamente.`,
      });
      setDialogOpen(false);
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "Verifica los datos de la sala.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRoom = async (room: RoomDTO) => {
    setBusy(true);
    try {
      const res = await fetch(
        withBasePath(`/api/horarios/setup/entities?entity=room&id=${room.id}`),
        { method: "DELETE" }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar.");
      showToast({
        variant: "success",
        title: "Sala eliminada",
        description: `Se eliminó "${room.name}".`,
      });
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "La sala está en uso.",
      });
    } finally {
      setBusy(false);
    }
  };

  const classrooms = useMemo(
    () => setup.rooms.filter((r) => r.roomType === "CLASSROOM"),
    [setup.rooms]
  );

  return (
    <div className="flex h-full flex-col">
      <Tabs value={subTab} onValueChange={setSubTab} className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b bg-background px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight">3. Salas</h1>
              <Badge variant="secondary">{setup.rooms.length}</Badge>
              <HelpTip text="Define si los cursos tienen una sala fija o si los estudiantes rotan por asignatura, crea salas sugeridas por curso y agrega recintos adicionales (laboratorios, gimnasio, computación)." />
            </div>
            <TabsList className="h-8">
              <TabsTrigger value="modalidad" className="gap-1.5 text-xs">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Modalidad
              </TabsTrigger>
              <TabsTrigger value="por_curso" className="gap-1.5 text-xs">
                <GraduationCap className="h-3.5 w-3.5" />
                Salas por curso ({setup.courses.filter((c) => c.defaultRoomId).length}/
                {setup.courses.length})
              </TabsTrigger>
              <TabsTrigger value="catalogo" className="gap-1.5 text-xs">
                <DoorOpen className="h-3.5 w-3.5" />
                Todas las salas ({setup.rooms.length})
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => openCreateRoom("LAB")}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nueva sala
            </Button>
            <Button size="sm" onClick={onNextStep}>
              Continuar a Asignaturas
            </Button>
          </div>
        </div>

        {/* Sub-paso 3.1: Modalidad de uso de salas */}
        <TabsContent value="modalidad" className="m-0 flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {(
                [
                  "FIXED_COURSE_WITH_SPECIALS",
                  "FIXED_COURSE_STRICT",
                  "BY_SUBJECT",
                ] as RoomAssignmentMode[]
              ).map((mode) => {
                const info = ROOM_ASSIGNMENT_MODE_LABELS[mode];
                const isSelected = currentMode === mode;
                return (
                  <Card
                    key={mode}
                    onClick={() => handleChangeRoomMode(mode)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/[0.03] ring-1 ring-primary/30"
                        : "hover:border-foreground/30"
                    }`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm font-semibold leading-snug">
                          {info.label}
                        </CardTitle>
                        {isSelected && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {info.description}
                      </p>
                      <Badge variant={isSelected ? "default" : "outline"} className="text-[11px]">
                        {isSelected ? "Activa" : "Seleccionar"}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {currentMode !== "BY_SUBJECT" && coursesWithoutRoom.length > 0 && (
              <Card className="border-primary/30 bg-primary/[0.03]">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {coursesWithoutRoom.length} cursos aún no tienen sala fija asignada
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Podemos crear automáticamente una sala base (ej. &quot;Sala{" "}
                        {coursesWithoutRoom[0]?.name}&quot;) para cada curso pendiente.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleBulkCreateCourseRooms}
                    disabled={busy}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Crear salas sugeridas ({coursesWithoutRoom.length})
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end gap-2">
              {currentMode !== "BY_SUBJECT" && (
                <Button variant="outline" size="sm" onClick={() => setSubTab("por_curso")}>
                  Revisar salas por curso
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setSubTab("catalogo")}>
                Agregar salas adicionales (Lab, Gimnasio, etc.)
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Sub-paso 3.2: Salas por curso */}
        <TabsContent value="por_curso" className="m-0 flex-1 overflow-auto p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Asignación de sala fija por curso</span>
                <HelpTip text="Vincula una sala base a cada curso. Si usas modalidad rotativa, esta asignación es opcional." />
              </div>
              {coursesWithoutRoom.length > 0 && (
                <Button size="sm" onClick={handleBulkCreateCourseRooms} disabled={busy}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Crear salas faltantes ({coursesWithoutRoom.length})
                </Button>
              )}
            </div>

            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Curso</TableHead>
                    <TableHead className="w-28">Matrícula</TableHead>
                    <TableHead>Sala fija asignada</TableHead>
                    <TableHead className="w-32">Capacidad sala</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {setup.courses.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="h-24 text-center text-sm text-muted-foreground"
                      >
                        Primero agrega cursos en el paso 2 para asignarles salas.
                      </TableCell>
                    </TableRow>
                  ) : (
                    setup.courses.map((course) => (
                      <TableRow key={course.id}>
                        <TableCell className="font-medium">{course.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {course.studentCount ?? 35} est.
                        </TableCell>
                        <TableCell>
                          <Select
                            value={course.defaultRoomId ?? "__NONE__"}
                            onValueChange={(val) => handleAssignCourseRoom(course, val)}
                            disabled={busy}
                          >
                            <SelectTrigger className="h-8 w-72 text-xs">
                              <SelectValue placeholder="Sin sala fija" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__NONE__">Sin sala fija</SelectItem>
                              {classrooms.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  {r.name} (cap. {r.capacity})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {course.defaultRoom ? `${course.defaultRoom.capacity} cupos` : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* Sub-paso 3.3: Catálogo completo de salas (fijas + adicionales) */}
        <TabsContent value="catalogo" className="m-0 flex-1 overflow-auto p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Inventario de salas y recintos</span>
                <HelpTip text="Incluye tanto salas de clases como recintos especiales (Laboratorios, Gimnasio, Sala de Computación)." />
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => openCreateRoom("CLASSROOM")}>
                  <DoorOpen className="mr-1.5 h-3.5 w-3.5" />
                  + Sala de clases
                </Button>
                <Button size="sm" variant="outline" onClick={() => openCreateRoom("LAB")}>
                  <Building2 className="mr-1.5 h-3.5 w-3.5" />
                  + Recinto especial
                </Button>
              </div>
            </div>

            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="w-52">Tipo de sala</TableHead>
                    <TableHead className="w-28">Capacidad</TableHead>
                    <TableHead className="w-24">Piso</TableHead>
                    <TableHead className="w-36">Sede</TableHead>
                    <TableHead className="w-24 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {setup.rooms.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-28 text-center text-sm text-muted-foreground"
                      >
                        No hay salas creadas todavía.
                      </TableCell>
                    </TableRow>
                  ) : (
                    setup.rooms.map((room) => (
                      <TableRow key={room.id}>
                        <TableCell className="font-medium">{room.name}</TableCell>
                        <TableCell>
                          <Badge
                            variant={room.roomType === "CLASSROOM" ? "secondary" : "outline"}
                            className="text-xs font-normal"
                          >
                            {ROOM_TYPE_LABELS[room.roomType]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{room.capacity} est.</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          Piso {room.floor ?? 1}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {room.campus || "Central"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditRoom(room)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteRoom(room)}
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
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRoom ? "Editar sala" : "Nueva sala"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="room-name">Nombre de la sala</Label>
              <Input
                id="room-name"
                placeholder="Ej. Laboratorio de Ciencias 1"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo de sala</Label>
                <Select
                  value={roomType}
                  onValueChange={(v) => setRoomType(v as RoomType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((rt) => (
                      <SelectItem key={rt} value={rt}>
                        {ROOM_TYPE_LABELS[rt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="room-capacity">Capacidad</Label>
                <Input
                  id="room-capacity"
                  type="number"
                  min={1}
                  max={200}
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="room-floor">Piso</Label>
                <Input
                  id="room-floor"
                  type="number"
                  min={1}
                  max={10}
                  value={floor}
                  onChange={(e) => setFloor(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="room-campus" className="flex items-center gap-1.5">
                  Sede / Pabellón
                  <HelpTip text="Opcional. Útil si el colegio tiene anexo o varios edificios." />
                </Label>
                <Input
                  id="room-campus"
                  placeholder="Central"
                  value={campus}
                  onChange={(e) => setCampus(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveRoom} disabled={busy || !roomName.trim()}>
              {editingRoom ? "Guardar cambios" : "Crear sala"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
