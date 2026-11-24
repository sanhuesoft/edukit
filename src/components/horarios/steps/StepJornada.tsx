"use client";

import React, { useMemo, useState } from "react";
import { withBasePath } from "@/lib/basePath";
import { Check, Clock, Coffee, Plus, Sparkles, Trash2, Utensils } from "lucide-react";
import type { LevelCode } from "@prisma/client";
import { DAYS_OF_WEEK, LEVEL_LABELS } from "@/lib/scheduling/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { BellScheduleDTO, SchoolSetupPayload } from "../types";

interface StepJornadaProps {
  setup: SchoolSetupPayload;
  onRefresh: () => Promise<void>;
  onNextStep: () => void;
}

interface BreakConfig {
  afterBlock: number;
  durationMinutes: number;
  type: "BREAK" | "LUNCH";
}

function extractConfigFromBell(bell: BellScheduleDTO | undefined) {
  if (!bell || bell.timeSlots.length === 0) {
    return {
      startTime: "08:00",
      blockDurationMinutes: 45,
      blocksByDay: { 1: 8, 2: 8, 3: 8, 4: 8, 5: 6 } as Record<number, number>,
      breaks: [
        { afterBlock: 2, durationMinutes: 15, type: "BREAK" as const },
        { afterBlock: 4, durationMinutes: 15, type: "BREAK" as const },
        { afterBlock: 6, durationMinutes: 45, type: "LUNCH" as const },
      ],
    };
  }

  const classSlots = bell.timeSlots.filter((s) => s.slotType === "CLASS");
  const day1Class = classSlots
    .filter((s) => s.dayOfWeek === 1)
    .sort((a, b) => a.blockNumber - b.blockNumber);
  const firstSlot = day1Class[0] ?? classSlots[0];

  const blocksByDay: Record<number, number> = { 1: 8, 2: 8, 3: 8, 4: 8, 5: 8 };
  for (const d of [1, 2, 3, 4, 5]) {
    const count = classSlots.filter((s) => s.dayOfWeek === d).length;
    if (count > 0) blocksByDay[d] = count;
  }

  const breakSlots = bell.timeSlots
    .filter((s) => s.dayOfWeek === 1 && (s.slotType === "BREAK" || s.slotType === "LUNCH"))
    .sort((a, b) => a.blockNumber - b.blockNumber);

  const breaks: BreakConfig[] = breakSlots.map((b) => ({
    afterBlock: Math.floor(b.blockNumber / 100),
    durationMinutes: b.durationMinutes,
    type: b.slotType === "LUNCH" ? "LUNCH" : "BREAK",
  }));

  return {
    startTime: firstSlot?.startTime || "08:00",
    blockDurationMinutes: firstSlot?.durationMinutes || 45,
    blocksByDay,
    breaks:
      breaks.length > 0
        ? breaks
        : [
            { afterBlock: 2, durationMinutes: 15, type: "BREAK" as const },
            { afterBlock: 4, durationMinutes: 15, type: "BREAK" as const },
            { afterBlock: 6, durationMinutes: 45, type: "LUNCH" as const },
          ],
  };
}

export function StepJornada({ setup, onRefresh, onNextStep }: StepJornadaProps) {
  const { showToast } = useToast();
  const [selectedBellId, setSelectedBellId] = useState<string>(
    setup.bellSchedules[0]?.id ?? ""
  );
  const [busy, setBusy] = useState(false);

  // Dialog nueva jornada
  const [createOpen, setCreateOpen] = useState(false);
  const [newBellName, setNewBellName] = useState("");
  const [newBellLevels, setNewBellLevels] = useState<LevelCode[]>([
    "BASIC_1_4",
    "BASIC_5_8",
    "MEDIA_1_2",
    "MEDIA_3_4",
  ]);

  const activeBell = useMemo(
    () =>
      setup.bellSchedules.find((b) => b.id === selectedBellId) ??
      setup.bellSchedules[0],
    [setup.bellSchedules, selectedBellId]
  );

  const initialCfg = useMemo(() => extractConfigFromBell(activeBell), [activeBell]);
  const [startTime, setStartTime] = useState(initialCfg.startTime);
  const [blockDuration, setBlockDuration] = useState(initialCfg.blockDurationMinutes);
  const [blocksByDay, setBlocksByDay] = useState<Record<number, number>>(initialCfg.blocksByDay);
  const [breaks, setBreaks] = useState<BreakConfig[]>(initialCfg.breaks);

  const syncFormToBell = (bell: BellScheduleDTO) => {
    setSelectedBellId(bell.id);
    const cfg = extractConfigFromBell(bell);
    setStartTime(cfg.startTime);
    setBlockDuration(cfg.blockDurationMinutes);
    setBlocksByDay(cfg.blocksByDay);
    setBreaks(cfg.breaks);
  };

  const handleCreateBell = async () => {
    if (!newBellName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(withBasePath("/api/horarios/setup/entities"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "bellSchedule",
          data: {
            name: newBellName.trim(),
            applicableLevels: newBellLevels,
            gridConfig: {
              startTime: "08:00",
              blockDurationMinutes: 45,
              blocksPerDay: 8,
              blocksPerDayByDay: { 1: 8, 2: 8, 3: 8, 4: 8, 5: 6 },
              breaks: [
                { afterBlock: 2, durationMinutes: 15, type: "BREAK" },
                { afterBlock: 4, durationMinutes: 15, type: "BREAK" },
                { afterBlock: 6, durationMinutes: 45, type: "LUNCH" },
              ],
            },
          },
        }),
      });
      const data = (await res.json()) as { item?: BellScheduleDTO; error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo crear la jornada.");
      showToast({
        variant: "success",
        title: "Jornada creada",
        description: `"${newBellName.trim()}" quedó lista con su grilla base.`,
      });
      setNewBellName("");
      setCreateOpen(false);
      await onRefresh();
      if (data.item) {
        syncFormToBell(data.item);
      }
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "Error al crear jornada.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBell = async (
    e: React.MouseEvent,
    bell: BellScheduleDTO
  ) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const res = await fetch(
        withBasePath(`/api/horarios/setup/entities?entity=bellSchedule&id=${bell.id}`),
        { method: "DELETE" }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar.");
      showToast({
        variant: "success",
        title: "Jornada eliminada",
        description: `Se eliminó "${bell.name}".`,
      });
      await onRefresh();
      const remaining = setup.bellSchedules.filter((b) => b.id !== bell.id);
      if (activeBell?.id === bell.id && remaining[0]) {
        syncFormToBell(remaining[0]);
      }
    } catch (err) {
      showToast({
        variant: "error",
        title: "No se pudo eliminar",
        description: err instanceof Error ? err.message : "Tiene cursos asociados.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveTimeGrid = async () => {
    if (!activeBell) return;
    setBusy(true);
    try {
      const maxBlocks = Math.max(...Object.values(blocksByDay));
      const res = await fetch(withBasePath("/api/horarios/setup/entities"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "timeGrid",
          data: {
            bellScheduleId: activeBell.id,
            config: {
              startTime,
              blockDurationMinutes: Number(blockDuration) || 45,
              blocksPerDay: maxBlocks,
              blocksPerDayByDay: blocksByDay,
              days: [1, 2, 3, 4, 5],
              breaks,
            },
          },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo guardar la grilla.");
      showToast({
        variant: "success",
        title: "Bloques actualizados",
        description: `Se actualizó la estructura horaria de "${activeBell.name}".`,
      });
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error al guardar bloques",
        description: err instanceof Error ? err.message : "Verifica los parámetros.",
      });
    } finally {
      setBusy(false);
    }
  };

  const day1PreviewSlots = useMemo(() => {
    if (!activeBell) return [];
    return activeBell.timeSlots
      .filter((s) => s.dayOfWeek === 1)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [activeBell]);

  return (
    <div className="flex h-full flex-col">
      {/* Header del paso */}
      <div className="flex items-center justify-between gap-3 border-b bg-background px-6 py-3">
        <div className="flex items-center gap-2">
          <h1 className="whitespace-nowrap text-base font-semibold tracking-tight">
            1. Jornada
          </h1>
          <Badge variant="secondary">{setup.bellSchedules.length}</Badge>
          <HelpTip text="Define las jornadas horarias del establecimiento (ej. Básica, Media o General) y sus bloques pedagógicos, recreos y almuerzo." />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nueva jornada
          </Button>
          <Button size="sm" onClick={onNextStep}>
            Continuar a Cursos
          </Button>
        </div>
      </div>

      {/* Columnas estilo sidebar maestro-detalle */}
      <div className="flex flex-1 overflow-hidden">
        {/* Columna izquierda: lista de jornadas */}
        <aside className="flex w-72 shrink-0 flex-col border-r bg-muted/20">
          <div className="border-b px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Jornadas del colegio
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-1.5 p-2.5">
              {setup.bellSchedules.map((bell) => {
                const classCount = bell.timeSlots.filter((s) => s.slotType === "CLASS").length;
                const mondayCount = bell.timeSlots.filter(
                  (s) => s.dayOfWeek === 1 && s.slotType === "CLASS"
                ).length;
                const isSelected = activeBell?.id === bell.id;

                return (
                  <div
                    key={bell.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => syncFormToBell(bell)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        syncFormToBell(bell);
                      }
                    }}
                    className={`group cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "border-primary bg-background shadow-xs"
                        : "border-transparent hover:bg-background/70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-sm font-medium">{bell.name}</span>
                      {setup.bellSchedules.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                          onClick={(e) => handleDeleteBell(e, bell)}
                          disabled={busy}
                          aria-label={`Eliminar ${bell.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {bell.applicableLevels.map((lvl) => (
                        <Badge
                          key={lvl}
                          variant="secondary"
                          className="px-1.5 py-0 text-[10px] font-normal"
                        >
                          {LEVEL_LABELS[lvl]}
                        </Badge>
                      ))}
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {classCount} blq/sem
                      </span>
                      <span>{mondayCount} blq/lun</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </aside>

        {/* Columna derecha: bloques y recreos de la jornada seleccionada */}
        <section className="flex-1 overflow-auto bg-background p-6">
          {!activeBell ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Crea una jornada para configurar sus bloques y recreos.
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-6">
              {/* Parámetros de bloques */}
              <div className="col-span-6 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-1.5 text-sm">
                      Parámetros de bloques — {activeBell.name}
                      <HelpTip text="Al guardar se regeneran los bloques horarios de Lunes a Viernes agrupando automáticamente los pares entre recreos." />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="start-time">Hora de inicio</Label>
                        <Input
                          id="start-time"
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="block-duration" className="flex items-center gap-1.5">
                          Duración bloque (min)
                          <HelpTip text="Estándar MINEDUC: 45 minutos por hora pedagógica." />
                        </Label>
                        <Input
                          id="block-duration"
                          type="number"
                          min={20}
                          max={90}
                          value={blockDuration}
                          onChange={(e) => setBlockDuration(Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        Bloques de clase por día
                        <HelpTip text="Permite configurar días más cortos (por ejemplo, Viernes con 6 bloques)." />
                      </Label>
                      <div className="grid grid-cols-5 gap-2">
                        {DAYS_OF_WEEK.map((day) => (
                          <div key={day.value} className="space-y-1">
                            <span className="block text-center text-xs text-muted-foreground">
                              {day.short}
                            </span>
                            <Input
                              type="number"
                              min={1}
                              max={12}
                              className="text-center"
                              value={blocksByDay[day.value] ?? 8}
                              onChange={(e) =>
                                setBlocksByDay((prev) => ({
                                  ...prev,
                                  [day.value]: Number(e.target.value) || 1,
                                }))
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-1.5">
                          Recreos y almuerzo
                          <HelpTip text="Se insertan después del número de bloque indicado." />
                        </Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() =>
                            setBreaks((prev) => [
                              ...prev,
                              { afterBlock: 2, durationMinutes: 15, type: "BREAK" },
                            ])
                          }
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Agregar pausa
                        </Button>
                      </div>

                      <div className="overflow-hidden rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                              <TableHead className="h-8 w-36 text-xs font-medium">
                                Tipo de pausa
                              </TableHead>
                              <TableHead className="h-8 w-36 text-xs font-medium">
                                Ocurre después de
                              </TableHead>
                              <TableHead className="h-8 w-28 text-xs font-medium">
                                Duración (min)
                              </TableHead>
                              <TableHead className="h-8 w-10 text-right" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {breaks.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={4}
                                  className="h-16 text-center text-xs text-muted-foreground"
                                >
                                  Sin pausas configuradas. Haz clic en &quot;Agregar pausa&quot;.
                                </TableCell>
                              </TableRow>
                            ) : (
                              breaks.map((brk, idx) => {
                                const maxBlockOption = Math.max(
                                  11,
                                  ...Object.values(blocksByDay).map((n) => n - 1)
                                );
                                return (
                                  <TableRow key={idx}>
                                    <TableCell className="py-1.5">
                                      <Select
                                        value={brk.type}
                                        onValueChange={(v) =>
                                          setBreaks((prev) =>
                                            prev.map((item, i) =>
                                              i === idx
                                                ? { ...item, type: v as "BREAK" | "LUNCH" }
                                                : item
                                            )
                                          )
                                        }
                                      >
                                        <SelectTrigger className="h-8 w-full text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="BREAK">
                                            <span className="flex items-center gap-1.5">
                                              <Coffee className="h-3.5 w-3.5 text-muted-foreground" />
                                              Recreo
                                            </span>
                                          </SelectItem>
                                          <SelectItem value="LUNCH">
                                            <span className="flex items-center gap-1.5">
                                              <Utensils className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                              Almuerzo
                                            </span>
                                          </SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </TableCell>
                                    <TableCell className="py-1.5">
                                      <Select
                                        value={String(brk.afterBlock)}
                                        onValueChange={(v) =>
                                          setBreaks((prev) =>
                                            prev.map((item, i) =>
                                              i === idx
                                                ? { ...item, afterBlock: Number(v) || 1 }
                                                : item
                                            )
                                          )
                                        }
                                      >
                                        <SelectTrigger className="h-8 w-full text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {Array.from(
                                            { length: maxBlockOption },
                                            (_, k) => k + 1
                                          ).map((bNum) => (
                                            <SelectItem key={bNum} value={String(bNum)}>
                                              Bloque {bNum}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </TableCell>
                                    <TableCell className="py-1.5">
                                      <Input
                                        type="number"
                                        min={5}
                                        max={90}
                                        className="h-8 text-center text-xs"
                                        aria-label="Duración en minutos"
                                        value={brk.durationMinutes}
                                        onChange={(e) =>
                                          setBreaks((prev) =>
                                            prev.map((item, i) =>
                                              i === idx
                                                ? {
                                                    ...item,
                                                    durationMinutes:
                                                      Number(e.target.value) || 15,
                                                  }
                                                : item
                                            )
                                          )
                                        }
                                      />
                                    </TableCell>
                                    <TableCell className="py-1.5 text-right">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                        aria-label="Eliminar pausa"
                                        onClick={() =>
                                          setBreaks((prev) =>
                                            prev.filter((_, i) => i !== idx)
                                          )
                                        }
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    <Button
                      className="w-full"
                      onClick={handleSaveTimeGrid}
                      disabled={busy}
                    >
                      <Check className="mr-1.5 h-4 w-4" />
                      Guardar bloques de {activeBell.name}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Estructura diaria guardada */}
              <div className="col-span-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between text-sm">
                      <span>Estructura diaria guardada — {activeBell.name}</span>
                      <Badge variant="outline" className="font-normal">
                        {day1PreviewSlots.filter((s) => s.slotType === "CLASS").length} bloques base
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-28">Bloque</TableHead>
                          <TableHead>Horario</TableHead>
                          <TableHead className="w-28">Duración</TableHead>
                          <TableHead className="w-32">Tipo</TableHead>
                          <TableHead className="w-24 text-right">Par</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {day1PreviewSlots.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="h-24 text-center text-sm text-muted-foreground"
                            >
                              Guarda la configuración de la izquierda para generar los bloques.
                            </TableCell>
                          </TableRow>
                        ) : (
                          day1PreviewSlots.map((slot) => (
                            <TableRow
                              key={slot.id}
                              className={
                                slot.slotType !== "CLASS" ? "bg-muted/40" : ""
                              }
                            >
                              <TableCell className="font-medium">
                                {slot.slotType === "CLASS" ? (
                                  `Bloque ${slot.blockNumber}`
                                ) : slot.slotType === "LUNCH" ? (
                                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                                    <Utensils className="h-3.5 w-3.5" /> Almuerzo
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1.5 text-muted-foreground">
                                    <Coffee className="h-3.5 w-3.5" /> Recreo
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {slot.startTime} – {slot.endTime}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {slot.durationMinutes} min
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    slot.slotType === "CLASS"
                                      ? "secondary"
                                      : "outline"
                                  }
                                  className="text-[11px]"
                                >
                                  {slot.slotType === "CLASS"
                                    ? "Lectivo"
                                    : slot.slotType === "LUNCH"
                                      ? "Colación"
                                      : "Pausa"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">
                                {slot.pairGroupId ? `Par ${slot.pairGroupId}` : "—"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Dialog Nueva Jornada */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Nueva jornada horaria
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-bell-name">Nombre de la jornada</Label>
              <Input
                id="new-bell-name"
                placeholder="Ej. Jornada Enseñanza Media"
                value={newBellName}
                onChange={(e) => setNewBellName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Niveles aplicables</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(LEVEL_LABELS) as LevelCode[]).map((lvl) => {
                  const checked = newBellLevels.includes(lvl);
                  return (
                    <label
                      key={lvl}
                      className="flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-xs hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(val) =>
                          setNewBellLevels((prev) =>
                            val ? [...prev, lvl] : prev.filter((x) => x !== lvl)
                          )
                        }
                      />
                      <span>{LEVEL_LABELS[lvl]}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateBell} disabled={busy || !newBellName.trim()}>
              Crear jornada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
