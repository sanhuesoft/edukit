"use client";

import React, { useMemo, useState } from "react";
import { withBasePath } from "@/lib/basePath";
import {
  Baby,
  BookMarked,
  BookOpen,
  Check,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import type { RoomType } from "@prisma/client";
import {
  MINEDUC_SUBJECT_CATALOG,
  ROOM_TYPE_LABELS,
  type MineducCatalogCategory,
} from "@/lib/scheduling/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ColorPalettePicker } from "../ColorPalettePicker";
import type { SchoolSetupPayload, SubjectDTO } from "../types";

interface StepAsignaturasProps {
  setup: SchoolSetupPayload;
  onRefresh: () => Promise<void>;
  onNextStep: () => void;
}

type AsignaturasTab = "PARVULARIA" | "PLAN_COMUN" | "ELECTIVO" | "TP" | "mis_asignaturas";

const CATALOG_TABS: ReadonlySet<string> = new Set([
  "PARVULARIA",
  "PLAN_COMUN",
  "ELECTIVO",
  "TP",
]);

export function StepAsignaturas({
  setup,
  onRefresh,
  onNextStep,
}: StepAsignaturasProps) {
  const { showToast } = useToast();
  const [subTab, setSubTab] = useState<AsignaturasTab>(
    setup.subjects.length === 0 ? "PLAN_COMUN" : "mis_asignaturas"
  );
  const [subGroupFilter, setSubGroupFilter] = useState<string>("ALL");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [selectedPresetCodes, setSelectedPresetCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Dialog crear/editar asignatura
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectDTO | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [colorHex, setColorHex] = useState("#3F69BD");
  const [requiresRoomType, setRequiresRoomType] = useState<string>("__NONE__");
  const [cognitiveWeight, setCognitiveWeight] = useState<number>(2);

  const existingCodes = useMemo(
    () => new Set(setup.subjects.map((s) => s.code.toUpperCase())),
    [setup.subjects]
  );

  const isCatalogTab = CATALOG_TABS.has(subTab);
  const activeCategory = isCatalogTab
    ? (subTab as MineducCatalogCategory)
    : "PLAN_COMUN";

  const availableSubGroups = useMemo(() => {
    const set = new Set<string>();
    for (const item of MINEDUC_SUBJECT_CATALOG) {
      if (item.category === activeCategory) {
        set.add(item.subGroup);
      }
    }
    return Array.from(set);
  }, [activeCategory]);

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return MINEDUC_SUBJECT_CATALOG.filter((item) => {
      if (item.category !== activeCategory) return false;
      if (subGroupFilter !== "ALL" && item.subGroup !== subGroupFilter) return false;
      if (
        q &&
        !item.name.toLowerCase().includes(q) &&
        !item.code.toLowerCase().includes(q) &&
        !item.subGroup.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [activeCategory, subGroupFilter, catalogSearch]);

  const handleTabChange = (next: string) => {
    setSubTab(next as AsignaturasTab);
    setSubGroupFilter("ALL");
    setCatalogSearch("");
  };

  const togglePreset = (presetCode: string) => {
    setSelectedPresetCodes((prev) =>
      prev.includes(presetCode)
        ? prev.filter((c) => c !== presetCode)
        : [...prev, presetCode]
    );
  };

  const handleAddSelectedPresets = async () => {
    const items = MINEDUC_SUBJECT_CATALOG.filter(
      (p) => selectedPresetCodes.includes(p.code) && !existingCodes.has(p.code)
    );
    if (items.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(withBasePath("/api/horarios/setup/entities"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "bulkCreateSubjects",
          data: { items },
        }),
      });
      const data = (await res.json()) as { createdCount?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudieron agregar.");
      showToast({
        variant: "success",
        title: "Asignaturas MINEDUC agregadas",
        description: `Se incorporaron ${data.createdCount ?? items.length} asignaturas.`,
      });
      setSelectedPresetCodes([]);
      await onRefresh();
      setSubTab("mis_asignaturas");
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "Error al agregar asignaturas.",
      });
    } finally {
      setBusy(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setName("");
    setCode("");
    setColorHex("#3F69BD");
    setRequiresRoomType("__NONE__");
    setCognitiveWeight(2);
    setDialogOpen(true);
  };

  const openEdit = (subject: SubjectDTO) => {
    setEditing(subject);
    setName(subject.name);
    setCode(subject.code);
    setColorHex(subject.colorHex || "#3F69BD");
    setRequiresRoomType(subject.requiresRoomType ?? "__NONE__");
    setCognitiveWeight(subject.cognitiveWeight ?? 2);
    setDialogOpen(true);
  };

  const handleSaveSubject = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const derivedCode =
        code.trim() ||
        name
          .trim()
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 4)
          .toUpperCase();

      const res = await fetch(withBasePath("/api/horarios/setup/entities"), {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing
            ? {
                entity: "subject",
                id: editing.id,
                data: {
                  name: name.trim(),
                  code: derivedCode,
                  colorHex,
                  requiresRoomType:
                    requiresRoomType === "__NONE__" ? null : (requiresRoomType as RoomType),
                  cognitiveWeight,
                },
              }
            : {
                entity: "subject",
                data: {
                  name: name.trim(),
                  code: derivedCode,
                  colorHex,
                  requiresRoomType:
                    requiresRoomType === "__NONE__" ? null : (requiresRoomType as RoomType),
                  cognitiveWeight,
                },
              }
        ),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo guardar la asignatura.");
      showToast({
        variant: "success",
        title: editing ? "Asignatura actualizada" : "Asignatura creada",
        description: `"${name.trim()}" guardada correctamente.`,
      });
      setDialogOpen(false);
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "Verifica el código y nombre.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (subject: SubjectDTO) => {
    setBusy(true);
    try {
      const res = await fetch(
        withBasePath(`/api/horarios/setup/entities?entity=subject&id=${subject.id}`),
        { method: "DELETE" }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar.");
      showToast({
        variant: "success",
        title: "Asignatura eliminada",
        description: `Se eliminó "${subject.name}".`,
      });
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "Tiene asignaciones asociadas.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Tabs value={subTab} onValueChange={handleTabChange} className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b bg-background px-6 py-3">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex shrink-0 items-center gap-2">
              <h1 className="whitespace-nowrap text-base font-semibold tracking-tight">
                4. Asignaturas
              </h1>
              <Badge variant="secondary">{setup.subjects.length}</Badge>
              <HelpTip text="Elige asignaturas del catálogo oficial MINEDUC (Parvularia, Plan común, Electivos HC o especialidades TP) o crea nuevas, y asígnales un color para identificarlas en la grilla." />
            </div>
            <TabsList className="h-8 shrink-0">
              <TabsTrigger value="PARVULARIA" className="gap-1.5 text-xs">
                <Baby className="h-3.5 w-3.5" />
                Parvularia
              </TabsTrigger>
              <TabsTrigger value="PLAN_COMUN" className="gap-1.5 text-xs">
                <BookMarked className="h-3.5 w-3.5" />
                Plan común
              </TabsTrigger>
              <TabsTrigger value="ELECTIVO" className="gap-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5" />
                Electivos
              </TabsTrigger>
              <TabsTrigger value="TP" className="gap-1.5 text-xs">
                <Wrench className="h-3.5 w-3.5" />
                TP
              </TabsTrigger>
              <TabsTrigger value="mis_asignaturas" className="gap-1.5 text-xs">
                <BookOpen className="h-3.5 w-3.5" />
                Mis asignaturas ({setup.subjects.length})
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nueva asignatura
            </Button>
            <Button size="sm" onClick={onNextStep}>
              Continuar a Docentes
            </Button>
          </div>
        </div>

        {/* Catálogo MINEDUC (Parvularia, Plan común, Electivos, TP) */}
        {isCatalogTab && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b bg-muted/20 px-6 py-2.5">
              <div className="flex items-center gap-3">
                <div className="relative w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar en esta pestaña..."
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                {availableSubGroups.length > 1 && (
                  <Select value={subGroupFilter} onValueChange={setSubGroupFilter}>
                    <SelectTrigger className="h-8 w-56 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos los grupos</SelectItem>
                      {availableSubGroups.map((sg) => (
                        <SelectItem key={sg} value={sg}>
                          {sg}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const available = filteredCatalog
                      .filter((p) => !existingCodes.has(p.code))
                      .map((p) => p.code);
                    setSelectedPresetCodes((prev) =>
                      Array.from(new Set([...prev, ...available]))
                    );
                  }}
                >
                  Seleccionar visibles
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddSelectedPresets}
                  disabled={busy || selectedPresetCodes.length === 0}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Agregar seleccionadas ({selectedPresetCodes.length})
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <div className="grid grid-cols-4 gap-3">
                {filteredCatalog.map((preset) => {
                  const alreadyAdded = existingCodes.has(preset.code);
                  const checked = selectedPresetCodes.includes(preset.code);
                  return (
                    <label
                      key={preset.code}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                        alreadyAdded
                          ? "cursor-default border-emerald-500/30 bg-emerald-500/[0.04] opacity-80"
                          : checked
                            ? "border-primary bg-primary/[0.04]"
                            : "bg-card hover:border-foreground/30"
                      }`}
                    >
                      {alreadyAdded ? (
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-emerald-600 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      ) : (
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => togglePreset(preset.code)}
                          className="mt-0.5"
                        />
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: preset.colorHex }}
                          />
                          <span className="truncate text-xs font-medium">{preset.name}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {preset.code}
                          </span>
                          <Badge
                            variant="secondary"
                            className="max-w-full truncate px-1.5 py-0 text-[10px] font-normal"
                          >
                            {preset.subGroup}
                          </Badge>
                          {alreadyAdded && (
                            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                              Agregada
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Mis asignaturas */}
        <TabsContent value="mis_asignaturas" className="m-0 flex-1 overflow-auto p-6">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Color</TableHead>
                  <TableHead>Asignatura</TableHead>
                  <TableHead className="w-28">Código</TableHead>
                  <TableHead className="w-52">Sala requerida</TableHead>
                  <TableHead className="w-36">Carga cognitiva</TableHead>
                  <TableHead className="w-24 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {setup.subjects.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-28 text-center text-sm text-muted-foreground"
                    >
                      Aún no agregas asignaturas. Elige desde las pestañas MINEDUC o crea una nueva.
                    </TableCell>
                  </TableRow>
                ) : (
                  setup.subjects.map((subject) => (
                    <TableRow key={subject.id}>
                      <TableCell>
                        <span
                          className="inline-block h-5 w-5 rounded-md border border-black/15"
                          style={{ backgroundColor: subject.colorHex || "#2563EB" }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{subject.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {subject.code}
                      </TableCell>
                      <TableCell className="text-xs">
                        {subject.requiresRoomType ? (
                          <Badge variant="outline" className="font-normal">
                            {ROOM_TYPE_LABELS[subject.requiresRoomType]}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">Sala estándar</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs font-normal">
                          {subject.cognitiveWeight === 3
                            ? "Alta (3)"
                            : subject.cognitiveWeight === 2
                              ? "Media (2)"
                              : "Baja (1)"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(subject)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(subject)}
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
        </TabsContent>
      </Tabs>

      {/* Dialog Crear/Editar Asignatura */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar asignatura" : "Nueva asignatura"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="subj-name">Nombre</Label>
                <Input
                  id="subj-name"
                  placeholder="Ej. Taller de Robótica"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subj-code">Código</Label>
                <Input
                  id="subj-code"
                  placeholder="ROB"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  Tipo de sala especial
                  <HelpTip text="Si esta asignatura requiere Gimnasio, Laboratorio, Taller TP, etc., indícalo aquí." />
                </Label>
                <Select value={requiresRoomType} onValueChange={setRequiresRoomType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NONE__">Sala normal / curso</SelectItem>
                    {(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((rt) => (
                      <SelectItem key={rt} value={rt}>
                        {ROOM_TYPE_LABELS[rt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  Carga cognitiva
                  <HelpTip text="Se usa para reglas pedagógicas de equilibrio diario (ej. 3 = Matemática/Lenguaje, 1 = Artes/Orientación)." />
                </Label>
                <Select
                  value={String(cognitiveWeight)}
                  onValueChange={(v) => setCognitiveWeight(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 — Baja</SelectItem>
                    <SelectItem value="2">2 — Media</SelectItem>
                    <SelectItem value="3">3 — Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ColorPalettePicker
              label="Color de la asignatura"
              value={colorHex}
              onChange={setColorHex}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveSubject} disabled={busy || !name.trim()}>
              {editing ? "Guardar cambios" : "Crear asignatura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
