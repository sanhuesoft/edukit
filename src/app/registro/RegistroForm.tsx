"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Mail, Search, X } from "lucide-react";
import { AuthShell, primaryTactileClass } from "@/components/auth/AuthShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withBasePath } from "@/lib/basePath";
import { cn } from "@/lib/utils";
import type { ProfekitSchool } from "@/lib/profekitOnboarding";

export function RegistroForm({
  email,
  initialName,
  suggestedSchool,
  defaultAcademicYear,
}: Readonly<{
  email: string;
  initialName: { firstName: string; lastName: string };
  suggestedSchool: ProfekitSchool | null;
  defaultAcademicYear: number;
}>) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [academicYear, setAcademicYear] = useState(String(defaultAcademicYear));
  const [school, setSchool] = useState<ProfekitSchool | null>(suggestedSchool);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) {
      setError("Elige tu establecimiento.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(withBasePath("/api/auth/profekit/onboarding"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, rbd: school.rbd, academicYear }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        if (data.code === "onboarding_expired") {
          router.replace("/login?error=onboarding_expired");
          return;
        }
        setError(data.error || "No pudimos crear tu cuenta.");
        return;
      }
      router.replace("/app");
      router.refresh();
    } catch {
      setError("No pudimos comunicarnos con el servidor.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Crea tu cuenta"
      description="Tu cuenta ProfeKit aún no tiene acceso a Horarios. Completa estos datos y elige tu establecimiento."
      error={error}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="registro-email">Correo electrónico</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="registro-email" value={email} readOnly disabled className="h-11 pl-10" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="registro-nombre">Nombre</Label>
            <Input
              id="registro-nombre"
              required
              minLength={2}
              maxLength={60}
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="registro-apellido">Apellido</Label>
            <Input
              id="registro-apellido"
              required
              minLength={2}
              maxLength={60}
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="h-11"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="registro-colegio">Establecimiento</Label>
          <SchoolPicker value={school} onChange={setSchool} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="registro-anio">Año académico</Label>
          <Input
            id="registro-anio"
            type="number"
            required
            min={2020}
            max={2040}
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="h-11"
          />
        </div>

        <button type="submit" disabled={submitting} className={cn(primaryTactileClass, "mt-2")}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {submitting ? "Creando tu cuenta…" : "Crear cuenta y entrar"}
        </button>
      </form>
    </AuthShell>
  );
}

function SchoolPicker({
  value,
  onChange,
}: Readonly<{ value: ProfekitSchool | null; onChange: (school: ProfekitSchool | null) => void }>) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfekitSchool[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (value || q.length < 2) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      try {
        const res = await fetch(withBasePath(`/api/auth/profekit/schools?q=${encodeURIComponent(q)}`));
        const data = (await res.json().catch(() => ({}))) as { schools?: ProfekitSchool[]; error?: string };
        if (id !== requestId.current) return;
        if (!res.ok) {
          setSearchError(data.error || "No pudimos buscar establecimientos.");
          setResults([]);
          return;
        }
        setResults(data.schools ?? []);
      } catch {
        if (id === requestId.current) setSearchError("No pudimos buscar establecimientos.");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, value]);

  if (value) {
    return (
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
        <Building2 className="mt-0.5 size-4 shrink-0 text-[#1f5bff]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug font-medium">{value.name}</p>
          <p className="text-xs text-muted-foreground">
            RBD {value.rbd}
            {value.dgv ? `-${value.dgv}` : ""}
            {value.comuna ? ` · ${value.comuna}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery("");
            setResults([]);
          }}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Cambiar establecimiento"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  const showResults = query.trim().length >= 2;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="registro-colegio"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca por nombre, comuna o RBD"
          autoComplete="off"
          className="h-11 pr-10 pl-10"
          aria-autocomplete="list"
          aria-controls="registro-colegio-resultados"
        />
        {loading && (
          <Loader2 className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {showResults && (
        <ul
          id="registro-colegio-resultados"
          role="listbox"
          className="max-h-56 overflow-y-auto rounded-lg border bg-popover text-sm shadow-sm"
        >
          {searchError ? (
            <li className="px-3 py-2.5 text-destructive">{searchError}</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2.5 text-muted-foreground">
              {loading ? "Buscando…" : "Sin resultados. Prueba con el RBD."}
            </li>
          ) : (
            results.map((item) => (
              <li key={item.rbd} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => onChange(item)}
                  className="flex w-full items-start px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span className="min-w-0">
                    <span className="block leading-snug font-medium">{item.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      RBD {item.rbd}
                      {item.comuna ? ` · ${item.comuna}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
