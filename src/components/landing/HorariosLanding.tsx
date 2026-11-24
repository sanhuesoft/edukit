"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  Clock,
  Cpu,
  FileCheck2,
  FileSpreadsheet,
  GraduationCap,
  Landmark,
  Menu,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  X,
} from "lucide-react";
import { EduKitLogo } from "@/components/EduKitLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TimetableShowcase } from "./TimetableShowcase";
import {
  ContactFormModal,
  InstitutionContactForm,
  TeacherContactForm,
} from "./ContactForms";

const PAIN_POINTS = [
  "Semanas enteras en planillas intentando cuadrar bloques sin choques.",
  "Reclamos docentes por ventanas innecesarias o jornadas desequilibradas.",
  "Dolor de cabeza al compatibilizar horas lectivas y no lectivas (Ley 20.903).",
  "Miedo a mover una sola asignatura y desarmar el resto del colegio.",
  "Versiones repetidas en Excel difíciles de compartir con cursos y profesores.",
];

const OUTCOME_POINTS = [
  "Horarios libres de choques de salas, laboratorios y docentes desde el inicio.",
  "Equilibrio real en cargas, bloques consecutivos y reducción de ventanas.",
  "Reglas adaptadas a la normativa y realidad escolar chilena, incluyendo PIE y CRA.",
  "Ajustes manuales ágiles con validación instantánea y apoyo inteligente.",
  "Exportación limpia en PDF y Excel lista para publicar a toda la comunidad.",
];

const CAPABILITY_PILLARS = [
  {
    icon: Cpu,
    eyebrow: "Precisión matemática",
    title: "Cero superposiciones, incluso en colegios complejos",
    description:
      "Coordina docentes compartidos, salas temáticas, laboratorios, gimnasios y bloques simultáneos sin que tengas que cruzar celdas a mano.",
    highlights: [
      "Sin choques de sala ni docente",
      "Control de salas especiales y talleres",
      "Reducción automática de ventanas",
    ],
  },
  {
    icon: Scale,
    eyebrow: "Normativa y realidad chilena",
    title: "Habla el mismo idioma que tu equipo de UTP",
    description:
      "Construido desde cero para establecimientos de Chile: contempla la proporción lectiva/no lectiva de la Ley 20.903, co-docencia PIE, reuniones de departamento y jornadas reales.",
    highlights: [
      "Respeto a Ley 20.903",
      "Sincronización de co-docencia PIE",
      "Bloques, recreos y almuerzo garantizado",
    ],
  },
  {
    icon: SlidersHorizontal,
    eyebrow: "Control humano + apoyo inteligente",
    title: "Tú decides las reglas, la plataforma resuelve el puzle",
    description:
      "Fija acuerdos particulares de tu comunidad, protege bloques clave y ajusta cualquier detalle con alertas inmediatas antes de confirmar cambios.",
    highlights: [
      "Restricciones flexibles por docente o curso",
      "Asistencia inteligente para destrabar ajustes",
      "Versiones ordenadas sin perder avances",
    ],
  },
  {
    icon: FileSpreadsheet,
    eyebrow: "Listo para publicar",
    title: "De la aprobación de UTP a las salas en un clic",
    description:
      "Genera horarios claros y presentables por curso, por docente y por sala en formatos PDF y Excel listos para imprimir o distribuir digitalmente.",
    highlights: [
      "Vistas por curso, docente y sala",
      "Descarga profesional en PDF y Excel",
      "Presentación ordenada para toda la comunidad",
    ],
  },
];

const FAQ_ITEMS = [
  {
    question: "¿Por qué no publican precios fijos en esta página?",
    answer:
      "Cada establecimiento tiene una realidad distinta: cantidad de cursos, jornadas, sedes y nivel de acompañamiento requerido. Por eso no trabajamos con tarifas rígidas publicadas; evaluamos tu caso mediante el formulario y te enviamos una propuesta formal ajustada exactamente a lo que necesitas.",
  },
  {
    question: "¿Podemos concertar una reunión antes de tomar una decisión?",
    answer:
      "Sí. Al completar el formulario para colegios e instituciones puedes marcar la opción para coordinar una reunión de demostración por videollamada. Ahí revisamos tus requerimientos en vivo y respondemos dudas técnicas o administrativas junto a Dirección o UTP.",
  },
  {
    question: "¿Son una empresa constituida? ¿Emiten boleta o factura electrónica?",
    answer:
      "Sí. ProfeKit Horarios es desarrollado y operado por ProfeKit SpA, una empresa chilena legalmente constituida. Emitimos boleta electrónica y factura electrónica válidas ante el SII, además de cotizaciones formales para revisión del sostenedor o equipo administrativo.",
  },
  {
    question:
      "Soy profesor, jefe de UTP o consultor: ¿puedo contratarlo por mi cuenta sin pasar por el sostenedor?",
    answer:
      "Sí. También ofrecemos licencias individuales para profesores, jefes de UTP, coordinadores o profesionales que arman horarios de manera independiente. Solo debes escribirnos usando el formulario exclusivo para profesores y te enviaremos las condiciones con boleta o factura electrónica.",
  },
  {
    question:
      "¿Sirve para las particularidades de colegios chilenos (Ley 20.903, PIE, talleres, electivos)?",
    answer:
      "Absolutamente. No es una plantilla extranjera adaptada a medias: está diseñado específicamente para la operación escolar chilena, contemplando distribución lectiva y no lectiva, co-docencia PIE, salas compartidas (CRA, laboratorios, talleres TP), electivos y disponibilidad docente.",
  },
  {
    question: "¿Requiere instalar programas en los computadores del colegio?",
    answer:
      "No. Funciona 100% en línea desde cualquier navegador moderno, con cuentas seguras para tu equipo y respaldos constantes en la nube.",
  },
];

export function HorariosLanding() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number>(0);

  // Modal state for CTAs across the page
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"institution" | "teacher">(
    "institution"
  );
  const [modalWantsMeeting, setModalWantsMeeting] = useState(false);

  // Inline bottom contact section switcher
  const [inlineFormTab, setInlineFormTab] = useState<"institution" | "teacher">(
    "institution"
  );
  const [inlineWantsMeeting, setInlineWantsMeeting] = useState(false);

  const openInstitutionModal = (wantsMeeting = false) => {
    setModalMode("institution");
    setModalWantsMeeting(wantsMeeting);
    setModalOpen(true);
  };

  const openTeacherModal = () => {
    setModalMode("teacher");
    setModalWantsMeeting(false);
    setModalOpen(true);
  };

  const scrollToForm = (
    tab: "institution" | "teacher",
    wantsMeeting = false
  ) => {
    setInlineFormTab(tab);
    setInlineWantsMeeting(wantsMeeting);
    setMobileMenuOpen(false);
    document.getElementById("contacto")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/15 selection:text-primary">
      {/* Subtle top architectural backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(ellipse_80%_55%_at_50%_-15%,rgba(29,78,216,0.12),transparent_70%)] dark:bg-[radial-gradient(ellipse_80%_55%_at_50%_-15%,rgba(59,130,246,0.16),transparent_70%)]"
      />

      {/* Sticky Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a
            href="#inicio"
            aria-label="ProfeKit Horarios, ir al inicio"
            className="flex shrink-0 items-center gap-2"
          >
            <EduKitLogo width={142} height={36} imageClassName="h-8 w-auto" />
          </a>

          <nav
            aria-label="Navegación principal"
            className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex"
          >
            <a
              href="#demostracion"
              className="transition-colors hover:text-foreground"
            >
              Demostración
            </a>
            <a
              href="#beneficios"
              className="transition-colors hover:text-foreground"
            >
              Beneficios
            </a>
            <a
              href="#modalidades"
              className="transition-colors hover:text-foreground"
            >
              Modalidades
            </a>
            <a
              href="#respaldo"
              className="transition-colors hover:text-foreground"
            >
              Respaldo formal
            </a>
            <a
              href="#preguntas"
              className="transition-colors hover:text-foreground"
            >
              Preguntas
            </a>
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Iniciar sesión</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              className="cursor-pointer font-semibold"
              onClick={() => openInstitutionModal(true)}
            >
              <CalendarClock className="h-4 w-4" />
              Concertar reunión
            </Button>
          </div>

          <div className="flex items-center gap-1.5 md:hidden">
            <ThemeToggle />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-border bg-background px-4 pb-5 pt-3 shadow-lg md:hidden">
            <nav className="flex flex-col space-y-2.5 text-sm font-medium">
              <a
                href="#demostracion"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Demostración
              </a>
              <a
                href="#beneficios"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Beneficios
              </a>
              <a
                href="#modalidades"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Modalidades
              </a>
              <a
                href="#respaldo"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Respaldo formal
              </a>
              <a
                href="#preguntas"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Preguntas frecuentes
              </a>
            </nav>
            <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
              <Button
                type="button"
                className="w-full cursor-pointer font-semibold"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openInstitutionModal(true);
                }}
              >
                <CalendarClock className="h-4 w-4" />
                Concertar reunión
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full cursor-pointer"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openTeacherModal();
                }}
              >
                <GraduationCap className="h-4 w-4" />
                Formulario para profesores
              </Button>
              <Button variant="ghost" className="w-full" asChild>
                <Link href="/login">Iniciar sesión</Link>
              </Button>
            </div>
          </div>
        )}
      </header>

      <main id="inicio">
        {/* HERO SECTION */}
        <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:px-8 lg:pb-24">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-balance text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem] lg:leading-[1.08]">
              El horario de todo tu colegio,{" "}
              <span className="text-primary">
                sin topones.
                <br className="hidden sm:inline" /> Y sin dolores de cabeza.
              </span>
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              ¿Todavía armas el horario a mano?{" "}
              <strong className="font-semibold text-foreground">
                ProfeKit Horarios
              </strong>{" "}
              cuadra cursos, salas y profesores con una fórmula de optimización
              matemática e inteligencia artificial.
            </p>

            {/* Primary CTAs */}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                type="button"
                size="lg"
                className="h-12 w-full cursor-pointer px-7 text-sm font-semibold shadow-md shadow-primary/20 sm:w-auto"
                onClick={() => openInstitutionModal(false)}
              >
                <Building2 className="h-4 w-4" />
                Cotizar para mi colegio
                <ArrowRight className="h-4 w-4" />
              </Button>

              <Button
                type="button"
                size="lg"
                variant="outline"
                className="h-12 w-full cursor-pointer px-6 text-sm font-semibold sm:w-auto"
                onClick={() => openInstitutionModal(true)}
              >
                <CalendarClock className="h-4 w-4 text-primary" />
                Concertar una reunión
              </Button>
            </div>

            {/* Trust micro-bar + direct path for individual teachers */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck className="h-4 w-4 text-primary" />
                ProfeKit SpA · Empresa real en Chile
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FileCheck2 className="h-4 w-4 text-primary" />
                Boleta y factura electrónica (SII)
              </span>
              <button
                type="button"
                onClick={openTeacherModal}
                className="inline-flex cursor-pointer items-center gap-1 font-semibold text-foreground underline decoration-primary/50 underline-offset-4 transition-colors hover:text-primary"
              >
                ¿Eres profesor? Consulta aquí
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Product Proof */}
          <div id="demostracion" className="mt-14 scroll-mt-24">
            <TimetableShowcase />
          </div>
        </section>

        {/* PAIN VS OUTCOME COMPARISON */}
        <section className="border-y border-border/70 bg-muted/30 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                El costo real de armar horarios a mano
              </p>
              <h2 className="mt-2.5 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Tu equipo directivo no debería perder semanas cuadrando celdas
              </h2>
              <p className="mt-3 text-pretty text-base text-muted-foreground">
                Un buen horario protege el clima docente, el aprendizaje de los
                estudiantes y la tranquilidad de UTP durante todo el año escolar.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Before */}
              <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  El método tradicional en planillas
                </div>
                <ul className="space-y-3.5">
                  {PAIN_POINTS.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground"
                    >
                      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* After */}
              <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card p-6 shadow-lg shadow-primary/5 sm:p-8">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-700 via-blue-500 to-indigo-500"
                />
                <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Con ProfeKit Horarios
                </div>
                <ul className="space-y-3.5">
                  {OUTCOME_POINTS.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-sm leading-relaxed text-foreground"
                    >
                      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CAPABILITIES / OUTCOME PILLARS */}
        <section
          id="beneficios"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-24 lg:px-8"
        >
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
              Diseñado para resolver lo difícil
            </p>
            <h2 className="mt-2.5 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Potencia técnica pensada para la realidad de los colegios chilenos
            </h2>
            <p className="mt-3 text-pretty text-base text-muted-foreground">
              Sin herramientas genéricas que obligan a adaptar tu colegio al
              software. ProfeKit Horarios se adapta a tus reglas, tu equipo y tu
              infraestructura.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
            {CAPABILITY_PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <article
                  key={pillar.title}
                  className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-slate-950/5 sm:p-7 dark:hover:shadow-black/30"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
                        {pillar.eyebrow}
                      </span>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/8 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                    <h3 className="mt-4 text-xl font-bold tracking-tight text-foreground">
                      {pillar.title}
                    </h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                      {pillar.description}
                    </p>
                  </div>

                  <ul className="mt-6 space-y-2 border-t border-border/70 pt-4">
                    {pillar.highlights.map((h) => (
                      <li
                        key={h}
                        className="flex items-center gap-2 text-xs font-medium text-foreground/90"
                      >
                        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>

        {/* TWO PATHS / CONTRACTING (ZERO PUBLIC PRICES) */}
        <section
          id="modalidades"
          className="scroll-mt-20 border-y border-border/70 bg-muted/30 py-20 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                Modalidades de contratación
              </p>
              <h2 className="mt-2.5 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Cotización a medida, según quién lo necesita
              </h2>
              <p className="mt-3 text-pretty text-base text-muted-foreground">
                No trabajamos con planes rígidos ni precios publicados. Evaluamos
                tu caso directamente a través de nuestro formulario para darte una
                propuesta clara y formal.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Primary Card: Institutions / Companies */}
              <article className="relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-primary bg-card p-7 shadow-xl shadow-primary/10 sm:p-9 lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    Opción principal · Instituciones
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    Factura electrónica SII
                  </span>
                </div>

                <div className="mt-6">
                  <h3 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    Para Colegios, Liceos y Sostenedores
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    Diseñamos una propuesta formal ajustada al tamaño y realidad
                    de tu establecimiento o red educacional, con demostración en
                    vivo antes de contratar.
                  </p>
                </div>

                <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    "Reunión de demostración en vivo por videollamada",
                    "Cotización formal lista para Dirección o Sostenedor",
                    "Emisión de factura electrónica (o boleta) SII",
                    "Acceso completo para tu equipo de gestión/UTP",
                    "Soporte directo en Chile por el equipo de ProfeKit",
                    "Acompañamiento inicial para partir sin fricción",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-sm text-foreground"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row">
                  <Button
                    type="button"
                    size="lg"
                    className="flex-1 cursor-pointer font-semibold"
                    onClick={() => openInstitutionModal(false)}
                  >
                    Solicitar cotización institucional
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="cursor-pointer font-semibold"
                    onClick={() => openInstitutionModal(true)}
                  >
                    <CalendarClock className="h-4 w-4 text-primary" />
                    Concertar reunión
                  </Button>
                </div>
              </article>

              {/* Secondary Card: Individual Teachers (Explicitly Separate Form) */}
              <article className="flex flex-col justify-between rounded-2xl border border-border bg-card p-7 shadow-sm sm:p-9 lg:col-span-5">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-foreground">
                      <GraduationCap className="h-3.5 w-3.5 text-primary" />
                      También vendemos a profesores
                    </span>
                  </div>

                  <h3 className="mt-6 text-2xl font-bold tracking-tight text-foreground">
                    Licencia Individual para Profesores y UTP
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    ¿Eres profesor, jefe de UTP o coordinador y prefieres
                    adquirirlo por tu cuenta sin esperar aprobación del
                    sostenedor, o prestas servicios de armado de horarios?
                  </p>

                  <div className="mt-5 rounded-xl border border-border/80 bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
                    <strong className="font-semibold text-foreground">
                      Atención por canal separado:
                    </strong>{" "}
                    Las consultas de profesores se gestionan a través de un{" "}
                    <strong className="text-foreground">
                      formulario independiente
                    </strong>{" "}
                    al de colegios y empresas, con emisión de boleta o factura
                    electrónica.
                  </div>

                  <ul className="mt-5 space-y-2.5">
                    {[
                      "Compra particular sin trámites institucionales",
                      "Ideal para UTP, coordinadores o consultores",
                      "Boleta o factura electrónica a tu nombre",
                      "Respuesta directa con opciones a tu medida",
                    ].map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2.5 text-sm text-foreground/90"
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8 border-t border-border pt-6">
                  <Button
                    type="button"
                    size="lg"
                    variant="secondary"
                    className="w-full cursor-pointer font-semibold"
                    onClick={openTeacherModal}
                  >
                    <GraduationCap className="h-4 w-4 text-primary" />
                    Ir al formulario para profesores
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* REAL COMPANY & FORMAL TRUST SECTION */}
        <section
          id="respaldo"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-24 lg:px-8"
        >
          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-12">
              <div className="flex flex-col justify-between bg-slate-950 p-8 text-white sm:p-10 lg:col-span-5 dark:bg-zinc-900">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-200">
                    <Landmark className="h-3.5 w-3.5" />
                    Respaldo empresarial real
                  </span>
                  <h2 className="mt-5 text-balance text-2xl font-bold tracking-tight sm:text-3xl">
                    Somos una empresa real, constituida en Chile.
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-slate-300">
                    Sabemos que un establecimiento educacional no puede confiar
                    una pieza tan crítica del año escolar a un proyecto anónimo.
                    Detrás de ProfeKit Horarios está{" "}
                    <strong className="font-semibold text-white">
                      ProfeKit SpA
                    </strong>
                    , con operación formal, facturación electrónica y trato
                    directo de persona a persona.
                  </p>
                </div>

                <div className="mt-8 border-t border-white/15 pt-5 text-xs text-slate-300">
                  <p className="font-semibold text-white">ProfeKit SpA</p>
                  <p className="mt-0.5">
                    Ecosistema de software educativo desarrollado en Chile.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 p-8 sm:grid-cols-2 sm:p-10 lg:col-span-7">
                <div className="space-y-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FileCheck2 className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">
                    Boleta y factura electrónica (SII)
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Emitimos documentación tributaria electrónica válida ante el
                    Servicio de Impuestos Internos, tanto para sostenedores y
                    colegios como para compras particulares.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">
                    Cotización formal para aprobación
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Preparamos propuestas claras y formales que puedes presentar
                    directamente a Dirección, Administración o Sostenedor para
                    respaldar la decisión de compra.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <CalendarClock className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">
                    Reuniones de demostración en vivo
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Antes de contratar puedes agendar una videollamada con
                    nosotros para ver la herramienta funcionando y validar que
                    encaja con tu colegio.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <UserCheck className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">
                    Soporte directo en tu mismo horario
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Atención cercana, en español y con pleno conocimiento del
                    calendario y exigencias del sistema escolar chileno.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ SECTION */}
        <section
          id="preguntas"
          className="scroll-mt-20 border-t border-border/70 bg-muted/20 py-20 sm:py-24"
        >
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                Preguntas frecuentes
              </p>
              <h2 className="mt-2.5 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Resolvemos tus dudas antes de conversar
              </h2>
            </div>

            <div className="mt-10 divide-y divide-border rounded-2xl border border-border bg-card">
              {FAQ_ITEMS.map((item, index) => {
                const isOpen = openFaq === index;
                return (
                  <div key={item.question} className="px-6 py-4 sm:px-7">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? -1 : index)}
                      aria-expanded={isOpen}
                      className="flex w-full cursor-pointer items-center justify-between gap-4 py-1 text-left text-sm font-semibold text-foreground transition-colors hover:text-primary sm:text-base"
                    >
                      <span>{item.question}</span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                          isOpen && "rotate-180 text-primary"
                        )}
                      />
                    </button>
                    {isOpen && (
                      <div className="mt-2.5 pb-1 pr-6 text-sm leading-relaxed text-muted-foreground">
                        <p>{item.answer}</p>
                        {index === 1 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-3 cursor-pointer"
                            onClick={() => scrollToForm("institution", true)}
                          >
                            <CalendarClock className="h-3.5 w-3.5 text-primary" />
                            Coordinar reunión ahora
                          </Button>
                        )}
                        {index === 3 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-3 cursor-pointer"
                            onClick={() => scrollToForm("teacher", false)}
                          >
                            <GraduationCap className="h-3.5 w-3.5 text-primary" />
                            Abrir formulario para profesores
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* FINAL DUAL-FORM CONTACT SECTION */}
        <section
          id="contacto"
          className="scroll-mt-20 border-t border-border/70 py-20 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12">
              {/* Left persuasive column */}
              <div className="space-y-6 lg:col-span-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                    Conversemos sobre tu horario
                  </p>
                  <h2 className="mt-2.5 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    Elige el formulario que corresponde a tu caso
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    Mantenemos dos canales separados para atenderte más rápido:
                    uno pensado para{" "}
                    <strong className="font-semibold text-foreground">
                      colegios, liceos y sostenedores
                    </strong>{" "}
                    (con opción de reunión) y otro exclusivo para{" "}
                    <strong className="font-semibold text-foreground">
                      profesores
                    </strong>{" "}
                    que desean contratarlo de forma particular.
                  </p>
                </div>

                <div className="space-y-3 rounded-2xl border border-border bg-muted/35 p-5">
                  <div className="flex items-start gap-3">
                    <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Propuesta formal y transparente
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Evaluamos tu requerimiento y te enviamos una cotización
                        clara emitida por ProfeKit SpA.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Boleta o factura electrónica SII
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Documentación tributaria electrónica disponible en ambas
                        modalidades.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Reunión de demostración opcional
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Marca la casilla en el formulario institucional y
                        coordinamos una videollamada en tu horario preferido.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right dual-form card */}
              <div className="rounded-2xl border border-border bg-card p-6 shadow-xl shadow-slate-950/5 sm:p-8 lg:col-span-7 dark:shadow-black/30">
                {/* Explicit two-form switcher */}
                <div
                  role="tablist"
                  aria-label="Seleccionar tipo de formulario"
                  className="mb-6 grid grid-cols-1 gap-2 rounded-xl border border-border bg-muted/50 p-1.5 sm:grid-cols-2"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={inlineFormTab === "institution"}
                    onClick={() => setInlineFormTab("institution")}
                    className={cn(
                      "flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all",
                      inlineFormTab === "institution"
                        ? "bg-background text-primary shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Building2 className="h-4 w-4" />
                    Colegios y Empresas
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={inlineFormTab === "teacher"}
                    onClick={() => setInlineFormTab("teacher")}
                    className={cn(
                      "flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all",
                      inlineFormTab === "teacher"
                        ? "bg-background text-primary shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <GraduationCap className="h-4 w-4" />
                    Formulario para Profesores
                  </button>
                </div>

                {inlineFormTab === "institution" ? (
                  <div>
                    <div className="mb-5">
                      <h3 className="text-lg font-bold text-foreground">
                        Formulario para Colegios, Liceos y Sostenedores
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Solicita una cotización a medida o marca la opción para
                        concertar una reunión de demostración.
                      </p>
                    </div>
                    <InstitutionContactForm
                      key={`inline-inst-${String(inlineWantsMeeting)}`}
                      initialWantsMeeting={inlineWantsMeeting}
                      idPrefix="inline-inst"
                    />
                  </div>
                ) : (
                  <div>
                    <div className="mb-5">
                      <h3 className="text-lg font-bold text-foreground">
                        Formulario exclusivo para Profesores (Licencia
                        Individual)
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Para docentes, jefes de UTP, coordinadores o consultores
                        que desean contratar acceso por su cuenta.
                      </p>
                    </div>
                    <TeacherContactForm idPrefix="inline-teacher" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-border bg-muted/25">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div className="space-y-2">
              <EduKitLogo width={132} height={34} imageClassName="h-7 w-auto" />
              <p className="text-xs text-muted-foreground">
                Optimización inteligente de horarios escolares para Chile.
              </p>
            </div>

            <nav
              aria-label="Enlaces del pie de página"
              className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-muted-foreground"
            >
              <a href="#demostracion" className="hover:text-foreground">
                Demostración
              </a>
              <a href="#beneficios" className="hover:text-foreground">
                Beneficios
              </a>
              <a href="#modalidades" className="hover:text-foreground">
                Modalidades
              </a>
              <a href="#respaldo" className="hover:text-foreground">
                ProfeKit SpA
              </a>
              <a href="#contacto" className="hover:text-foreground">
                Contacto
              </a>
              <Link href="/login" className="font-semibold text-foreground hover:text-primary">
                Iniciar sesión
              </Link>
            </nav>
          </div>

          <div className="mt-8 flex flex-col items-start justify-between gap-2 border-t border-border/70 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
            <span>
              © {new Date().getFullYear()} ProfeKit SpA · Todos los derechos
              reservados.
            </span>
            <span>
              Boleta y factura electrónica SII · Desarrollado en Chile por{" "}
              <a
                href="https://www.fabiansanhueza.cl"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-foreground underline-offset-2 hover:underline"
              >
                Fabián Sanhueza
              </a>
            </span>
          </div>
        </div>
      </footer>

      {/* Dedicated Modal for Institutions vs. Teachers */}
      <ContactFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode={modalMode}
        initialWantsMeeting={modalWantsMeeting}
        onSwitchMode={(nextMode) => {
          setModalMode(nextMode);
          setModalWantsMeeting(false);
        }}
      />
    </div>
  );
}
