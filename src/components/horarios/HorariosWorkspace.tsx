"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Cpu,
  Download,
  Loader2,
  Play,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { ScheduleGridView } from "./ScheduleGridView";
import { AcademicSetupTab } from "./AcademicSetupTab";
import { RulesAndAITab } from "./RulesAndAITab";
import { OperationsAndExportTab } from "./OperationsAndExportTab";
import type {
  ConflictAuditResult,
  PreconditionResult,
  ScheduleVersionDetailDTO,
  SchoolSetupPayload,
} from "./types";
import type { SessionUser } from "@/lib/auth";

type MainTab = "grid" | "setup" | "rules_ai" | "operations";

export function HorariosWorkspace({ user }: { user: SessionUser }) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<MainTab>("grid");
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
            schools: Array<{ id: string; name: string; rbd: string; commune: string; academicYear: number }>;
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

  const handleValidate = async () => {
    const res = await fetch("/api/horarios/validate", { method: "POST" });
    if (res.ok) {
      const data = (await res.json()) as PreconditionResult;
      setPreconditions(data);
      showToast({
        variant: data.ready ? "success" : "error",
        title: data.ready ? "Precondiciones válidas" : "Inconsistencias detectadas",
        description: data.ready
          ? `${data.stats.totalBlocksToSchedule} bloques listos para programar en ${data.stats.courses} cursos.`
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
        audit?: ConflictAuditResult;
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
        title: `Nueva versión generada: ${data.version.name}`,
        description: `${data.placedCount} bloques ubicados · Fitness ${data.audit?.fitnessScore ?? 0}/100.`,
      });
      await loadAll(data.version.id);
      setTab("grid");
    } finally {
      setGenerating(false);
    }
  };

  const handlePublishToggle = async () => {
    if (!versionDetail) return;
    const nextStatus = versionDetail.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    const res = await fetch(`/api/horarios/versions/${versionDetail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) {
      showToast({
        variant: "success",
        title: nextStatus === "PUBLISHED" ? "Horario Oficial Publicado" : "Movido a Borrador",
        description: `Estado de "${versionDetail.name}" actualizado.`,
      });
      await loadAll(versionDetail.id);
    }
  };

  if (loading || !setup) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-1)]" />
          Cargando Generador de Horarios...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header del módulo */}
      <div className="flex flex-col gap-4 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {setup.school?.name ?? "Sin establecimiento"}
            </h1>
            {setup.school && (
              <Badge variant="secondary">
                RBD {setup.school.rbd} · Año {setup.school.academicYear}
              </Badge>
            )}
            {versionDetail && (
              <Badge variant={versionDetail.status === "PUBLISHED" ? "default" : "outline"}>
                {versionDetail.status === "PUBLISHED" ? "Oficial Publicado" : "Borrador"} · Lock v
                {versionDetail.versionLockNumber}
              </Badge>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            {setup.courses.length} cursos · {setup.teachers.length} docentes · {setup.rooms.length} salas ·{" "}
            {setup.rules.length} reglas configuradas
            {audit ? ` · Fitness actual: ${audit.fitnessScore}/100` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {setup.versions.length > 0 && (
            <select
              aria-label="Versión de horario activa"
              value={activeVersionId}
              onChange={(e) => {
                setActiveVersionId(e.target.value);
                void loadVersion(e.target.value);
              }}
              className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]"
            >
              {setup.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.fitnessScore} pts · {v.status})
                </option>
              ))}
            </select>
          )}

          <Button size="sm" variant="secondary" onClick={() => void handleValidate()}>
            <ShieldCheck className="h-4 w-4" />
            Validar
          </Button>

          <Button size="sm" disabled={generating} onClick={() => void handleGenerate()}>
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Generar Horario
          </Button>

          {versionDetail && (
            <Button size="sm" variant="neonOutline" onClick={() => void handlePublishToggle()}>
              {versionDetail.status === "PUBLISHED" ? "Pasar a Borrador" : "Publicar Oficial"}
            </Button>
          )}
        </div>
      </div>

      {/* Resultado de precondiciones si se ejecutó */}
      {preconditions && (
        <Card className={preconditions.ready ? "border-emerald-500/35" : "border-amber-500/40"}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {preconditions.ready ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
                <span>
                  Diagnóstico Pre-Generación ({preconditions.stats.totalBlocksToSchedule} bloques a asignar)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreconditions(null)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Cerrar
              </button>
            </div>
            {preconditions.issues.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {preconditions.issues.map((iss, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg px-2.5 py-1.5 text-xs ${
                      iss.severity === "ERROR"
                        ? "bg-red-500/10 text-red-500"
                        : "bg-amber-500/10 text-amber-500"
                    }`}
                  >
                    <strong>[{iss.code}]</strong> {iss.message}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navegación principal por pestañas */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--border-subtle)] pb-3">
        <Button
          size="sm"
          variant={tab === "grid" ? "default" : "ghost"}
          onClick={() => setTab("grid")}
        >
          <CalendarDays className="h-4 w-4" />
          Grilla Interactiva
        </Button>
        <Button
          size="sm"
          variant={tab === "setup" ? "default" : "ghost"}
          onClick={() => setTab("setup")}
        >
          <Settings2 className="h-4 w-4" />
          Configuración Académica
        </Button>
        <Button
          size="sm"
          variant={tab === "rules_ai" ? "default" : "ghost"}
          onClick={() => setTab("rules_ai")}
        >
          <Sparkles className="h-4 w-4" />
          Reglas y Asistente IA
        </Button>
        <Button
          size="sm"
          variant={tab === "operations" ? "default" : "ghost"}
          onClick={() => setTab("operations")}
        >
          <Download className="h-4 w-4" />
          Reemplazos, PDF y Gestión
        </Button>
      </div>

      {/* Contenido de la pestaña activa */}
      {tab === "grid" && (
        versionDetail && audit ? (
          <ScheduleGridView
            setup={setup}
            version={versionDetail}
            audit={audit}
            onVersionMutated={() => loadVersion(versionDetail.id)}
          />
        ) : (
          <Card>
            <CardContent className="p-10 text-center space-y-3">
              <Cpu className="mx-auto h-8 w-8 text-[var(--accent-1)]" />
              <p className="text-sm font-semibold">Aún no hay una versión de horario generada.</p>
              <Button onClick={() => void handleGenerate()} disabled={generating}>
                Generar primer horario
              </Button>
            </CardContent>
          </Card>
        )
      )}

      {tab === "setup" && (
        <AcademicSetupTab
          setup={setup}
          activeVersion={versionDetail}
          onRefresh={() => loadAll(activeVersionId)}
        />
      )}

      {tab === "rules_ai" && (
        <RulesAndAITab
          setup={setup}
          activeVersion={versionDetail}
          onRefresh={() => loadAll(activeVersionId)}
        />
      )}

      {tab === "operations" && (
        <OperationsAndExportTab
          userRole={user.role}
          setup={setup}
          activeVersion={versionDetail}
          schools={schools}
          onSchoolChanged={() => loadAll()}
        />
      )}
    </div>
  );
}
