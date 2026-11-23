import Link from "next/link";
import { ArrowRight, CalendarDays, Cpu, FileSpreadsheet, ShieldCheck, Sparkles } from "lucide-react";
import { AppNavbar } from "@/components/AppNavbar";
import { AppFooter } from "@/components/AppFooter";
import { EduKitLogo } from "@/components/EduKitLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="page-wrapper relative">
      <div className="bg-mesh" aria-hidden="true" />
      <AppNavbar user={user} />

      <main className="relative z-10 flex-1 py-12 sm:py-16">
        <div className="container space-y-10">
          <section className="mx-auto max-w-3xl text-center space-y-4">
            <h1 className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-4xl sm:text-5xl font-bold tracking-tight text-[var(--text-primary)]">
              <span>Bienvenido a</span>
              <EduKitLogo
                width={260}
                height={73}
                className="translate-y-[0.12em]"
                imageClassName="h-11 sm:h-14"
              />
            </h1>
            <p className="text-base sm:text-lg text-[var(--text-secondary)]">
              Suite de herramientas para equipos directivos, UTP e Inspectoría General.
            </p>
          </section>

          <section className="mx-auto max-w-3xl">
            <Card className="overflow-hidden border-[var(--border-accent)]">
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0353a4] to-[#1d74d8] text-white shadow-[var(--shadow-btn)]">
                      <CalendarDays className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl">
                        Generador de Horarios
                      </CardTitle>
                      <CardDescription>
                        Módulo #1 · Optimización por restricciones + Asistente IA
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="default">Activo</Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  Administra jornadas diferenciadas, docentes (proporción 65/35 Ley 20.903),
                  codocencia PIE, electivos sincronizados y espacios compartidos. Genera horarios
                  sin topones, edita con drag &amp; drop, audita con IA y exporta en PDF o ZIP.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-subtle)] p-3 flex items-start gap-2.5">
                    <Cpu className="h-4 w-4 text-[var(--accent-1)] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">Motor CSP</p>
                      <p className="text-[var(--text-muted)]">Reglas duras, blandas y bloques pareados.</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-subtle)] p-3 flex items-start gap-2.5">
                    <Sparkles className="h-4 w-4 text-[var(--accent-1)] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">Asistente IA</p>
                      <p className="text-[var(--text-muted)]">Resolución de topones y auditoría UTP.</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-subtle)] p-3 flex items-start gap-2.5">
                    <FileSpreadsheet className="h-4 w-4 text-[var(--accent-1)] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">Import &amp; Export</p>
                      <p className="text-[var(--text-muted)]">Carga Excel/CSV y reportes PDF + ZIP.</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <ShieldCheck className="h-4 w-4 text-[var(--color-success)]" />
                    <span>Control multi-colegio y edición colaborativa segura</span>
                  </div>
                  <Button asChild>
                    <Link href={user ? "/horarios" : "/login"}>
                      {user ? "Abrir Generador de Horarios" : "Iniciar sesión para acceder"}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
