"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  DoorOpen,
  FileSpreadsheet,
  GraduationCap,
  Layers,
  Loader2,
  LogOut,
  Moon,
  SlidersHorizontal,
  Sun,
  Upload,
  Users,
} from "lucide-react";
import { EduKitLogo } from "@/components/EduKitLogo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useTheme } from "@/context/ThemeContext";
import { StepJornada } from "./steps/StepJornada";
import { StepCursos } from "./steps/StepCursos";
import { StepSalas } from "./steps/StepSalas";
import { StepAsignaturas } from "./steps/StepAsignaturas";
import { StepDocentes } from "./steps/StepDocentes";
import { StepPlanEstudios } from "./steps/StepPlanEstudios";
import { StepReglas } from "./steps/StepReglas";
import { StepResultado } from "./steps/StepResultado";
import type {
  ConflictAuditResult,
  PreconditionResult,
  ScheduleVersionDetailDTO,
  SchoolSetupPayload,
} from "./types";
import type { SessionUser } from "@/lib/auth";

type StepId =
  | "jornada"
  | "cursos"
  | "salas"
  | "asignaturas"
  | "docentes"
  | "plan"
  | "reglas"
  | "resultado";

const STEPS_ORDER: StepId[] = [
  "jornada",
  "cursos",
  "salas",
  "asignaturas",
  "docentes",
  "plan",
  "reglas",
  "resultado",
];

export function HorariosWorkspace({ user }: { user: SessionUser }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();

  const [activeStep, setActiveStep] = useState<StepId>("jornada");
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<SchoolSetupPayload | null>(null);
  const [schools, setSchools] = useState<
    Array<{ id: string; name: string; rbd: string; commune: string; academicYear: number }>
  >([]);
  const [activeVersionId, setActiveVersionId] = useState<string>("");
  const [versionDetail, setVersionDetail] = useState<ScheduleVersionDetailDTO | null>(null);
  const [audit, setAudit] = useState<ConflictAuditResult | null>(null);
  const [preconditions, setPreconditions] = useState<PreconditionResult | null>(null);
  const [generating, setGenerating] = useState(false);

  // Import Excel modal
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const loadVersion = useCallback(async (versionId: string) => {
    if (!versionId) {
      setVersionDetail(null);
      setAudit(null);
      return;
    }
    const res = await fetch(`/api/horarios/versions/${versionId}`);
    if (res.ok) {
      const data = (await res.json()) as {
        version: ScheduleVersionDetailDTO;
        audit: ConflictAuditResult;
      };
      setVersionDetail(data.version);
      setAudit(data.audit);
    }
  }, []);

  const loadAll = useCallback(
    async (preferredVersionId?: string, showSpinner = false) => {
      if (showSpinner) setLoading(true);
      try {
        const [setupRes, schoolsRes] = await Promise.all([
          fetch("/api/horarios/setup"),
          fetch("/api/schools"),
        ]);
        if (schoolsRes.ok) {
          const sData = (await schoolsRes.json()) as {
            schools: Array<{
              id: string;
              name: string;
              rbd: string;
              commune: string;
              academicYear: number;
            }>;
          };
          setSchools(sData.schools ?? []);
        }
        if (setupRes.ok) {
          const data = (await setupRes.json()) as SchoolSetupPayload;
          setSetup(data);
          const nextVerId =
            preferredVersionId && data.versions.some((v) => v.id === preferredVersionId)
              ? preferredVersionId
              : activeVersionId && data.versions.some((v) => v.id === activeVersionId)
                ? activeVersionId
                : data.versions[0]?.id ?? "";
          setActiveVersionId(nextVerId);
          await loadVersion(nextVerId);
        }
      } finally {
        setLoading(false);
      }
    },
    [activeVersionId, loadVersion]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      if (!active) return;
      await loadAll(undefined, false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectVersion = async (versionId: string) => {
    setActiveVersionId(versionId);
    await loadVersion(versionId);
  };

  const handleSwitchSchool = async (schoolId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/schools", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeSchoolId: schoolId }),
      });
      if (res.ok) {
        setActiveVersionId("");
        await loadAll(undefined, true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    const res = await fetch("/api/horarios/validate", { method: "POST" });
    if (res.ok) {
      const data = (await res.json()) as PreconditionResult;
      setPreconditions(data);
      showToast({
        variant: data.ready ? "success" : "error",
        title: data.ready ? "Precondiciones válidas" : "Observaciones detectadas",
        description: data.ready
          ? `${data.stats.totalBlocksToSchedule} bloques listos en ${data.stats.courses} cursos.`
          : `Se encontraron ${data.issues.length} observaciones antes de generar.`,
      });
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/horarios/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseVersionId: activeVersionId || undefined,
        }),
      });
      const data = (await res.json()) as {
        version?: { id: string; name: string };
        placedCount?: number;
        unplacedCount?: number;
        error?: string;
      };
      if (!res.ok || !data.version) {
        showToast({
          variant: "error",
          title: "Error al generar horario",
          description: data.error || "Revisa las precondiciones.",
        });
        return;
      }
      showToast({
        variant: "success",
        title: "Horario generado",
        description: `${data.placedCount ?? 0} bloques ubicados${
          data.unplacedCount ? ` (${data.unplacedCount} pendientes)` : ""
        }.`,
      });
      setPreconditions(null);
      await loadAll(data.version.id, false);
    } finally {
      setGenerating(false);
    }
  };

  const handleExcelImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("mode", "commit");
      const res = await fetch("/api/horarios/setup/import", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as {
        imported?: boolean;
        error?: string;
        dryRun?: { summary?: { teachers: number; rooms: number; subjects: number; courses: number } };
      };
      if (!res.ok || data.imported === false) {
        throw new Error(data.error || "El archivo tiene errores de validación.");
      }
      showToast({
        variant: "success",
        title: "Importación completada",
        description: "Los datos académicos desde Excel fueron cargados correctamente.",
      });
      setImportFile(null);
      setImportOpen(false);
      await loadAll(undefined, false);
    } catch (err) {
      showToast({
        variant: "error",
        title: "No se pudo importar",
        description: err instanceof Error ? err.message : "Verifica el formato del archivo.",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const stepMeta = useMemo(() => {
    const totalPlan =
      setup?.courses.reduce((sum, c) => sum + c.courseSubjects.length, 0) ?? 0;
    const activeRules =
      setup?.rules.filter((r) => r.ruleType !== "ROOM_ASSIGNMENT_MODE").length ?? 0;

    return [
      {
        id: "jornada" as StepId,
        num: 1,
        label: "Jornada",
        icon: Clock,
        count: setup?.bellSchedules.length ?? 0,
        done: (setup?.bellSchedules.some((b) => b.timeSlots.length > 0) ?? false),
      },
      {
        id: "cursos" as StepId,
        num: 2,
        label: "Cursos",
        icon: GraduationCap,
        count: setup?.courses.length ?? 0,
        done: (setup?.courses.length ?? 0) > 0,
      },
      {
        id: "salas" as StepId,
        num: 3,
        label: "Salas",
        icon: DoorOpen,
        count: setup?.rooms.length ?? 0,
        done: (setup?.rooms.length ?? 0) > 0,
      },
      {
        id: "asignaturas" as StepId,
        num: 4,
        label: "Asignaturas",
        icon: BookOpen,
        count: setup?.subjects.length ?? 0,
        done: (setup?.subjects.length ?? 0) > 0,
      },
      {
        id: "docentes" as StepId,
        num: 5,
        label: "Docentes",
        icon: Users,
        count: setup?.teachers.length ?? 0,
        done: (setup?.teachers.length ?? 0) > 0,
      },
      {
        id: "plan" as StepId,
        num: 6,
        label: "Plan de estudios",
        icon: Layers,
        count: totalPlan,
        done: totalPlan > 0,
      },
      {
        id: "reglas" as StepId,
        num: 7,
        label: "Reglas",
        icon: SlidersHorizontal,
        count: activeRules,
        done: activeRules > 0,
      },
      {
        id: "resultado" as StepId,
        num: 8,
        label: "Resultado",
        icon: CalendarCheck2,
        count: setup?.versions.length ?? 0,
        done: (setup?.versions.length ?? 0) > 0,
      },
    ];
  }, [setup]);

  const goNextStep = () => {
    const idx = STEPS_ORDER.indexOf(activeStep);
    if (idx >= 0 && idx < STEPS_ORDER.length - 1) {
      setActiveStep(STEPS_ORDER[idx + 1]);
    }
  };

  if (loading || !setup) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Cargando espacio de trabajo...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Sidebar fija izquierda con los 8 pasos */}
      <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
        {/* Marca */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <EduKitLogo width={120} height={32} imageClassName="h-6 w-auto" />
          <Badge variant="outline" className="text-[10px] font-normal">
            {setup.school?.academicYear ?? 2026}
          </Badge>
        </div>

        {/* Selector de establecimiento */}
        <div className="border-b px-3 py-2.5">
          {user.role === "SUPER_ADMIN" && schools.length > 1 ? (
            <Select
              value={setup.school?.id ?? ""}
              onValueChange={handleSwitchSchool}
            >
              <SelectTrigger className="h-8 bg-background text-xs">
                <SelectValue placeholder="Establecimiento" />
              </SelectTrigger>
              <SelectContent>
                {schools.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="px-1">
              <p className="truncate text-xs font-semibold">
                {setup.school?.name ?? "Establecimiento"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                RBD {setup.school?.rbd} · {setup.school?.commune}
              </p>
            </div>
          )}
        </div>

        {/* Navegación de los 8 pasos */}
        <nav className="flex-1 space-y-1 overflow-auto p-3" aria-label="Pasos de configuración">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Configuración paso a paso
          </p>
          {stepMeta.map((step) => {
            const Icon = step.icon;
            const isActive = activeStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStep(step.id)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : step.done
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step.done && !isActive ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    step.num
                  )}
                </span>
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                <span className="flex-1 truncate">{step.label}</span>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                    isActive
                      ? "bg-primary-foreground/15 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step.count}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Acciones secundarias y perfil en la parte inferior */}
        <div className="shrink-0 space-y-2 border-t p-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full justify-start text-xs"
            onClick={() => setImportOpen(true)}
          >
            <FileSpreadsheet className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            Importar desde Excel
          </Button>

          <Separator />

          <div className="flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                {user.firstName} {user.lastName}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {user.email}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleTheme}
                aria-label="Cambiar tema"
              >
                {theme === "dark" ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={handleLogout}
                aria-label="Cerrar sesión"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Contenido principal 100% fluido */}
      <main className="h-full min-w-0 flex-1 overflow-hidden bg-background">
        {activeStep === "jornada" && (
          <StepJornada
            setup={setup}
            onRefresh={() => loadAll(undefined, false)}
            onNextStep={goNextStep}
          />
        )}
        {activeStep === "cursos" && (
          <StepCursos
            setup={setup}
            onRefresh={() => loadAll(undefined, false)}
            onNextStep={goNextStep}
          />
        )}
        {activeStep === "salas" && (
          <StepSalas
            setup={setup}
            onRefresh={() => loadAll(undefined, false)}
            onNextStep={goNextStep}
          />
        )}
        {activeStep === "asignaturas" && (
          <StepAsignaturas
            setup={setup}
            onRefresh={() => loadAll(undefined, false)}
            onNextStep={goNextStep}
          />
        )}
        {activeStep === "docentes" && (
          <StepDocentes
            setup={setup}
            onRefresh={() => loadAll(undefined, false)}
            onNextStep={goNextStep}
          />
        )}
        {activeStep === "plan" && (
          <StepPlanEstudios
            setup={setup}
            onRefresh={() => loadAll(undefined, false)}
            onNextStep={goNextStep}
          />
        )}
        {activeStep === "reglas" && (
          <StepReglas
            setup={setup}
            onRefresh={() => loadAll(undefined, false)}
            onNextStep={goNextStep}
          />
        )}
        {activeStep === "resultado" && (
          <StepResultado
            setup={setup}
            activeVersionId={activeVersionId}
            versionDetail={versionDetail}
            audit={audit}
            preconditions={preconditions}
            generating={generating}
            onSelectVersion={handleSelectVersion}
            onValidate={handleValidate}
            onGenerate={handleGenerate}
            onVersionMutated={() => loadAll(activeVersionId, false)}
          />
        )}
      </main>

      {/* Dialog Importación Excel */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              Importar datos desde Excel / CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Sube un libro Excel con hojas <strong>Profesores</strong>,{" "}
              <strong>Salas</strong>, <strong>Asignaturas</strong> y/o{" "}
              <strong>Cursos</strong> para cargar registros masivamente.
            </p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 p-6 text-center transition-colors hover:bg-muted/40">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-xs font-medium">
                {importFile ? importFile.name : "Haz clic para seleccionar archivo (.xlsx / .csv)"}
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleExcelImport}
              disabled={!importFile || importing}
            >
              {importing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Importar ahora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
