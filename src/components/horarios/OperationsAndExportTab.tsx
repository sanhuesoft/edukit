"use client";

import React, { useState } from "react";
import {
  Building2,
  Download,
  FileArchive,
  FileText,
  Loader2,
  Plus,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { DAYS_OF_WEEK } from "@/lib/scheduling/constants";
import type {
  ScheduleVersionDetailDTO,
  SchoolSetupPayload,
  SubstitutionSlotPlan,
} from "./types";

interface OperationsAndExportTabProps {
  userRole: "SUPER_ADMIN" | "SCHOOL_ADMIN";
  setup: SchoolSetupPayload;
  activeVersion: ScheduleVersionDetailDTO | null;
  schools: Array<{ id: string; name: string; rbd: string; commune: string; academicYear: number }>;
  onSchoolChanged: () => Promise<void>;
}

export function OperationsAndExportTab({
  userRole,
  setup,
  activeVersion,
  schools,
  onSchoolChanged,
}: OperationsAndExportTabProps) {
  const { showToast } = useToast();

  // Substitution plan state
  const [absentTeacherId, setAbsentTeacherId] = useState(setup.teachers[0]?.id ?? "");
  const [startDate, setStartDate] = useState("2026-03-09");
  const [endDate, setEndDate] = useState("2026-03-11");
  const [subPlan, setSubPlan] = useState<SubstitutionSlotPlan[] | null>(null);
  const [loadingSub, setLoadingSub] = useState(false);

  // Export selectors
  const [exportCourseId, setExportCourseId] = useState(setup.courses[0]?.id ?? "");
  const [exportTeacherId, setExportTeacherId] = useState(setup.teachers[0]?.id ?? "");
  const [exportRoomId, setExportRoomId] = useState(setup.rooms[0]?.id ?? "");

  // SUPER_ADMIN new school form
  const [sName, setSName] = useState("");
  const [sRbd, setSRbd] = useState("");
  const [sCommune, setSCommune] = useState("");
  const [sYear, setSYear] = useState(2026);
  const [aFirst, setAFirst] = useState("");
  const [aLast, setALast] = useState("");
  const [aEmail, setAEmail] = useState("");
  const [aPass, setAPass] = useState("");
  const [savingSchool, setSavingSchool] = useState(false);

  const handleGenerateSubstitution = async () => {
    if (!activeVersion || !absentTeacherId) return;
    setLoadingSub(true);
    try {
      const res = await fetch(`/api/horarios/versions/${activeVersion.id}/substitutions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ absentTeacherId, startDate, endDate }),
      });
      const data = (await res.json()) as {
        plan?: SubstitutionSlotPlan[];
        error?: string;
      };
      if (!res.ok) {
        showToast({ variant: "error", title: "Error", description: data.error || "Error" });
        return;
      }
      setSubPlan(data.plan ?? []);
    } finally {
      setLoadingSub(false);
    }
  };

  const triggerDownload = (type: string, entityId?: string) => {
    if (!activeVersion) return;
    const qs = new URLSearchParams({ type });
    if (entityId) qs.set("entityId", entityId);
    window.open(`/api/horarios/versions/${activeVersion.id}/export?${qs.toString()}`, "_blank");
  };

  const handleCreateSchool = async () => {
    setSavingSchool(true);
    try {
      const res = await fetch("/api/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school: { name: sName, rbd: sRbd, commune: sCommune, academicYear: sYear },
          admin: { firstName: aFirst, lastName: aLast, email: aEmail, password: aPass },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({ variant: "error", title: "Error al crear colegio", description: data.error || "Error" });
        return;
      }
      showToast({
        variant: "success",
        title: "Establecimiento creado",
        description: `Se creó "${sName}" junto a su cuenta SCHOOL_ADMIN (${aEmail}).`,
      });
      setSName("");
      setSRbd("");
      setSCommune("");
      setAFirst("");
      setALast("");
      setAEmail("");
      setAPass("");
      await onSchoolChanged();
    } finally {
      setSavingSchool(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* PLAN DE REEMPLAZOS */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-[var(--accent-1)]" />
              Plan de Reemplazos y Licencias (generateSubstitutionPlan)
            </CardTitle>
            <CardDescription>
              Detecta automáticamente docentes disponibles con ventanas contiguas y habilitación curricular.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="space-y-1.5">
                <Label htmlFor="sub-absent-teacher">Docente ausente</Label>
                <Select value={absentTeacherId || undefined} onValueChange={setAbsentTeacherId}>
                  <SelectTrigger id="sub-absent-teacher" className="text-xs">
                    <SelectValue placeholder="Selecciona docente" />
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
                <Label htmlFor="sub-start-date">Fecha de inicio</Label>
                <Input
                  id="sub-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sub-end-date">Fecha de término</Label>
                <Input
                  id="sub-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <Button
              size="sm"
              disabled={loadingSub || !activeVersion || !absentTeacherId}
              onClick={() => void handleGenerateSubstitution()}
            >
              {loadingSub && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Buscar Cobertura Disponible
            </Button>

            {subPlan && (
              <div className="space-y-2 max-h-[360px] overflow-y-auto">
                {subPlan.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    El docente no tiene bloques lectivos asignados en el rango de fechas seleccionado.
                  </p>
                ) : (
                  subPlan.map((slot, idx) => (
                    <div
                      key={`${slot.date}-${slot.blockNumber}-${idx}`}
                      className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-subtle)] p-3 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[var(--text-primary)]">
                          {slot.date} ({DAYS_OF_WEEK.find((d) => d.value === slot.dayOfWeek)?.short}) · Bloque{" "}
                          {slot.blockNumber} ({slot.startTime})
                        </span>
                        <Badge variant="secondary">
                          {slot.courseName} · {slot.subjectName}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {slot.candidates.length === 0 ? (
                          <span className="text-[11px] text-red-400">
                            Sin docentes disponibles en este bloque.
                          </span>
                        ) : (
                          slot.candidates.slice(0, 3).map((c) => (
                            <span
                              key={c.teacherId}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-700 dark:text-emerald-300"
                            >
                              <strong>{c.teacherName}</strong> ({c.score}pts · {c.reasons[0]})
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* EXPORTACION PDF Y ZIP */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-[var(--accent-1)]" />
              Exportación y Reportes (ScheduleExportService)
            </CardTitle>
            <CardDescription>
              Descarga reportes individuales en PDF, Sábana Maestra en tamaño Carta o el paquete completo en ZIP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="export-course">Curso</Label>
                <div className="flex items-center gap-2">
                  <Select value={exportCourseId || undefined} onValueChange={setExportCourseId}>
                    <SelectTrigger id="export-course" className="flex-1 text-xs">
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
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!activeVersion || !exportCourseId}
                    onClick={() => triggerDownload("course", exportCourseId)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF Curso
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="export-teacher">Docente</Label>
                <div className="flex items-center gap-2">
                  <Select value={exportTeacherId || undefined} onValueChange={setExportTeacherId}>
                    <SelectTrigger id="export-teacher" className="flex-1 text-xs">
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
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!activeVersion || !exportTeacherId}
                    onClick={() => triggerDownload("teacher", exportTeacherId)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF Docente
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="export-room">Sala o recinto</Label>
                <div className="flex items-center gap-2">
                  <Select value={exportRoomId || undefined} onValueChange={setExportRoomId}>
                    <SelectTrigger id="export-room" className="flex-1 text-xs">
                      <SelectValue placeholder="Selecciona una sala" />
                    </SelectTrigger>
                    <SelectContent>
                      {setup.rooms.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!activeVersion || !exportRoomId}
                    onClick={() => triggerDownload("room", exportRoomId)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF Sala
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <Button
                variant="neonOutline"
                disabled={!activeVersion}
                onClick={() => triggerDownload("master")}
              >
                <FileText className="h-4 w-4" />
                Sábana Maestra Carta (PDF)
              </Button>
              <Button disabled={!activeVersion} onClick={() => triggerDownload("bundle")}>
                <FileArchive className="h-4 w-4" />
                Paquete Completo (.ZIP)
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* PANEL MULTI-COLEGIO SOLO SUPER_ADMIN */}
      {userRole === "SUPER_ADMIN" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[var(--accent-1)]" />
              Administración Multi-Colegio (SUPER_ADMIN)
            </CardTitle>
            <CardDescription>
              Crea nuevos establecimientos junto a su cuenta SCHOOL_ADMIN inicial en una transacción atómica.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Nuevo Establecimiento + Admin
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <Label htmlFor="school-name">Nombre del colegio</Label>
                  <Input
                    id="school-name"
                    value={sName}
                    onChange={(e) => setSName(e.target.value)}
                    placeholder="Ej. Liceo Bicentenario"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="school-rbd">RBD</Label>
                  <Input
                    id="school-rbd"
                    value={sRbd}
                    onChange={(e) => setSRbd(e.target.value)}
                    placeholder="Ej. 9988-1"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="school-commune">Comuna</Label>
                  <Input
                    id="school-commune"
                    value={sCommune}
                    onChange={(e) => setSCommune(e.target.value)}
                    placeholder="Ej. Providencia"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="school-year">Año escolar</Label>
                  <Input
                    id="school-year"
                    type="number"
                    value={sYear}
                    onChange={(e) => setSYear(Number(e.target.value))}
                    placeholder="Ej. 2026"
                    className="text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <Label htmlFor="admin-first-name">Nombre del administrador</Label>
                  <Input
                    id="admin-first-name"
                    value={aFirst}
                    onChange={(e) => setAFirst(e.target.value)}
                    placeholder="Ej. Ana"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-last-name">Apellido del administrador</Label>
                  <Input
                    id="admin-last-name"
                    value={aLast}
                    onChange={(e) => setALast(e.target.value)}
                    placeholder="Ej. Torres"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-email">Correo del administrador</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={aEmail}
                    onChange={(e) => setAEmail(e.target.value)}
                    placeholder="Ej. utp@colegio.cl"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-password">Contraseña inicial</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    value={aPass}
                    onChange={(e) => setAPass(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="text-xs"
                  />
                </div>
              </div>
              <Button
                size="sm"
                disabled={savingSchool || !sName || !sRbd || !aEmail || !aPass}
                onClick={() => void handleCreateSchool()}
              >
                <Plus className="h-3.5 w-3.5" />
                Crear Colegio y Admin
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Establecimientos Registrados ({schools.length})
              </p>
              {schools.map((sch) => (
                <div
                  key={sch.id}
                  className="flex items-center justify-between rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-subtle)] p-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-[var(--text-primary)]">{sch.name}</div>
                    <div className="text-[var(--text-muted)]">
                      RBD {sch.rbd} · {sch.commune} · {sch.academicYear}
                    </div>
                  </div>
                  {setup.school?.id === sch.id ? (
                    <Badge variant="default">Activo</Badge>
                  ) : (
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={async () => {
                        await fetch("/api/schools", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ schoolId: sch.id }),
                        });
                        await onSchoolChanged();
                      }}
                    >
                      Cambiar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
