"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  Building2,
  CalendarClock,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  ReceiptText,
  Send,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const INSTITUTION_ROLES = [
  "Director / Directora",
  "Jefe / Jefa de UTP",
  "Sostenedor / Representante Legal",
  "Coordinador / Coordinadora Académica",
  "Administración / Finanzas",
  "Otro cargo directivo",
];

const SCHOOL_SIZES = [
  "Hasta 12 cursos",
  "13 a 25 cursos",
  "26 a 45 cursos",
  "Más de 45 cursos",
  "Red de colegios / Corporación / SLEP",
];

const TEACHER_PROFILES = [
  "Jefe/a de UTP o Coordinador/a (compra particular)",
  "Docente encargado/a de armar horarios",
  "Consultor/a independiente de horarios escolares",
  "Otro profesional de la educación",
];

interface FormCallbacks {
  onSuccess?: () => void;
}

export function InstitutionContactForm({
  initialWantsMeeting = false,
  onSuccess,
  idPrefix = "inst",
}: FormCallbacks & { initialWantsMeeting?: boolean; idPrefix?: string }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState(INSTITUTION_ROLES[1]);
  const [schoolName, setSchoolName] = useState("");
  const [rbd, setRbd] = useState("");
  const [approxCourses, setApproxCourses] = useState(SCHOOL_SIZES[1]);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [wantsMeeting, setWantsMeeting] = useState(initialWantsMeeting);
  const [meetingAvailability, setMeetingAvailability] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [submittedMeeting, setSubmittedMeeting] = useState(false);

  const resetForm = () => {
    setName("");
    setRole(INSTITUTION_ROLES[1]);
    setSchoolName("");
    setRbd("");
    setApproxCourses(SCHOOL_SIZES[1]);
    setEmail("");
    setPhone("");
    setWantsMeeting(initialWantsMeeting);
    setMeetingAvailability("");
    setMessage("");
    setError(null);
    setSubmittedEmail(null);
    setSubmittedMeeting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (wantsMeeting && meetingAvailability.trim().length < 4) {
      setError(
        "Indícanos tus días u horarios preferidos para coordinar la reunión de demostración."
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "institution",
          name,
          role,
          schoolName,
          rbd,
          approxCourses,
          email,
          phone,
          wantsMeeting,
          meetingAvailability,
          message,
          website,
        }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(
          data.error || "No pudimos enviar tu solicitud. Intenta nuevamente."
        );
      }

      setSubmittedEmail(email);
      setSubmittedMeeting(wantsMeeting);
      onSuccess?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al enviar el formulario."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedEmail) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-6 py-8 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          {submittedMeeting
            ? "¡Solicitud de reunión recibida!"
            : "¡Solicitud institucional enviada!"}
        </h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Gracias por escribir a <strong className="text-foreground">ProfeKit SpA</strong>.
          Revisaremos los antecedentes de tu establecimiento y te contactaremos a{" "}
          <strong className="text-foreground">{submittedEmail}</strong>{" "}
          {submittedMeeting
            ? "para confirmar día y enlace de la reunión de demostración."
            : "con una propuesta formal a la medida."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-5 cursor-pointer"
          onClick={resetForm}
        >
          Enviar otra consulta
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Honeypot */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-name`} className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-primary" />
            Nombre completo *
          </Label>
          <Input
            id={`${idPrefix}-name`}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Carolina Méndez"
            disabled={submitting}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-role`}>Cargo en la institución *</Label>
          <select
            id={`${idPrefix}-role`}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={submitting}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          >
            {INSTITUTION_ROLES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-school`} className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            Colegio, liceo o sostenedor *
          </Label>
          <Input
            id={`${idPrefix}-school`}
            required
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            placeholder="Ej. Liceo Bicentenario San Francisco"
            disabled={submitting}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-rbd`}>RBD (opcional)</Label>
          <Input
            id={`${idPrefix}-rbd`}
            value={rbd}
            onChange={(e) => setRbd(e.target.value)}
            placeholder="Ej. 12345-6"
            disabled={submitting}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-courses`}>Cantidad de cursos</Label>
          <select
            id={`${idPrefix}-courses`}
            value={approxCourses}
            onChange={(e) => setApproxCourses(e.target.value)}
            disabled={submitting}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          >
            {SCHOOL_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-email`} className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-primary" />
            Correo electrónico *
          </Label>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="utp@colegio.cl"
            disabled={submitting}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-phone`} className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-primary" />
            Teléfono / WhatsApp *
          </Label>
          <Input
            id={`${idPrefix}-phone`}
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+56 9 1234 5678"
            disabled={submitting}
          />
        </div>
      </div>

      {/* Meeting request checkbox */}
      <div
        className={cn(
          "rounded-xl border p-3.5 transition-colors",
          wantsMeeting
            ? "border-primary/50 bg-primary/5"
            : "border-border bg-muted/30"
        )}
      >
        <label className="flex cursor-pointer items-start gap-3 select-none">
          <input
            type="checkbox"
            checked={wantsMeeting}
            onChange={(e) => setWantsMeeting(e.target.checked)}
            disabled={submitting}
            className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
          />
          <div className="space-y-0.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <CalendarClock className="h-4 w-4 text-primary" />
              Quiero coordinar una reunión de demostración
            </span>
            <p className="text-xs text-muted-foreground">
              Te mostramos ProfeKit Horarios en vivo por videollamada y resolvemos
              dudas con tu equipo directivo o UTP.
            </p>
          </div>
        </label>

        {wantsMeeting && (
          <div className="mt-3 space-y-1.5 pl-7">
            <Label htmlFor={`${idPrefix}-availability`} className="text-xs">
              ¿Qué días y horarios te acomodan? *
            </Label>
            <Input
              id={`${idPrefix}-availability`}
              required={wantsMeeting}
              value={meetingAvailability}
              onChange={(e) => setMeetingAvailability(e.target.value)}
              placeholder="Ej. Martes o jueves entre 10:00 y 12:30 hrs"
              disabled={submitting}
            />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-message`} className="flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-primary" />
          Comentarios o necesidades del establecimiento (opcional)
        </Label>
        <textarea
          id={`${idPrefix}-message`}
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={submitting}
          placeholder="Cuéntanos si necesitan factura electrónica, cuándo planifican armar el horario o cualquier requerimiento particular..."
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
        />
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={submitting}
        className="w-full cursor-pointer font-semibold"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Enviando solicitud...
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            {wantsMeeting
              ? "Solicitar reunión y cotización institucional"
              : "Solicitar cotización para mi establecimiento"}
          </>
        )}
      </Button>

      <p className="text-center text-[11px] text-muted-foreground">
        Cotización formal emitida por <strong>ProfeKit SpA</strong> · Factura o
        boleta electrónica SII · Sin compromiso.
      </p>
    </form>
  );
}

export function TeacherContactForm({
  onSuccess,
  idPrefix = "teacher",
}: FormCallbacks & { idPrefix?: string }) {
  const [name, setName] = useState("");
  const [profile, setProfile] = useState(TEACHER_PROFILES[0]);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [taxDocument, setTaxDocument] = useState<
    "boleta" | "factura" | "por_definir"
  >("boleta");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setProfile(TEACHER_PROFILES[0]);
    setEmail("");
    setPhone("");
    setTaxDocument("boleta");
    setMessage("");
    setError(null);
    setSubmittedEmail(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "teacher",
          name,
          profile,
          email,
          phone,
          taxDocument,
          message,
          website,
        }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(
          data.error || "No pudimos enviar tu consulta. Intenta nuevamente."
        );
      }

      setSubmittedEmail(email);
      onSuccess?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al enviar el formulario."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedEmail) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-6 py-8 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          ¡Consulta para profesores recibida!
        </h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Gracias por escribirnos. Te responderemos directamente a{" "}
          <strong className="text-foreground">{submittedEmail}</strong> con las
          opciones de licencia individual y emisión de documento electrónico.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-5 cursor-pointer"
          onClick={resetForm}
        >
          Enviar otra consulta
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-name`} className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-primary" />
            Nombre completo *
          </Label>
          <Input
            id={`${idPrefix}-name`}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Rodrigo Valenzuela"
            disabled={submitting}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-profile`} className="flex items-center gap-1.5">
            <GraduationCap className="h-3.5 w-3.5 text-primary" />
            Tu perfil *
          </Label>
          <select
            id={`${idPrefix}-profile`}
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            disabled={submitting}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          >
            {TEACHER_PROFILES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-email`} className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-primary" />
            Correo electrónico *
          </Label>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu.correo@gmail.com"
            disabled={submitting}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-phone`} className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-primary" />
            Teléfono / WhatsApp *
          </Label>
          <Input
            id={`${idPrefix}-phone`}
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+56 9 1234 5678"
            disabled={submitting}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <ReceiptText className="h-3.5 w-3.5 text-primary" />
          Documento tributario que necesitas
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { value: "boleta", label: "Boleta electrónica" },
              { value: "factura", label: "Factura electrónica" },
              { value: "por_definir", label: "Por definir" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTaxDocument(option.value)}
              className={cn(
                "cursor-pointer rounded-lg border px-2.5 py-2 text-xs font-medium transition-all",
                taxDocument === option.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-message`} className="flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-primary" />
          ¿Cómo planeas usar ProfeKit Horarios? *
        </Label>
        <textarea
          id={`${idPrefix}-message`}
          rows={3}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={submitting}
          placeholder="Ej. Soy jefe de UTP y quiero contratarlo por mi cuenta para armar el horario de mi colegio, o armo horarios para varios establecimientos..."
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
        />
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={submitting}
        className="w-full cursor-pointer font-semibold"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Enviando consulta...
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Consultar por licencia para profesores
          </>
        )}
      </Button>

      <p className="text-center text-[11px] text-muted-foreground">
        Atención directa por <strong>ProfeKit SpA</strong> · Boleta o factura
        electrónica SII.
      </p>
    </form>
  );
}

export function ContactFormModal({
  open,
  onOpenChange,
  mode,
  initialWantsMeeting = false,
  onSwitchMode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "institution" | "teacher";
  initialWantsMeeting?: boolean;
  onSwitchMode: (mode: "institution" | "teacher") => void;
}) {
  const isInstitution = mode === "institution";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="space-y-1.5">
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
            {isInstitution ? (
              <>
                <Building2 className="h-3.5 w-3.5" />
                Formulario para Colegios y Empresas
              </>
            ) : (
              <>
                <GraduationCap className="h-3.5 w-3.5" />
                Formulario Exclusivo para Profesores
              </>
            )}
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight">
            {isInstitution
              ? initialWantsMeeting
                ? "Coordina una reunión de demostración"
                : "Cotiza ProfeKit Horarios para tu establecimiento"
              : "Consulta por licencia individual para profesores"}
          </DialogTitle>
          <DialogDescription>
            {isInstitution
              ? "Cada colegio tiene su propia realidad. Déjanos tus datos y te contactaremos con una propuesta a medida y respaldo de ProfeKit SpA."
              : "Pensado para docentes, jefes de UTP, coordinadores o consultores que desean adquirir acceso de forma particular."}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-1">
          {isInstitution ? (
            <InstitutionContactForm
              key={`modal-inst-${String(initialWantsMeeting)}`}
              initialWantsMeeting={initialWantsMeeting}
              idPrefix="modal-inst"
            />
          ) : (
            <TeacherContactForm idPrefix="modal-teacher" />
          )}
        </div>

        <div className="mt-2 border-t border-border pt-3 text-center text-xs text-muted-foreground">
          {isInstitution ? (
            <>
              ¿Buscas una licencia particular como profesor?{" "}
              <button
                type="button"
                onClick={() => onSwitchMode("teacher")}
                className="cursor-pointer font-semibold text-primary underline-offset-2 hover:underline"
              >
                Cambiar al formulario de profesores
              </button>
            </>
          ) : (
            <>
              ¿Representas a un colegio, liceo o sostenedor?{" "}
              <button
                type="button"
                onClick={() => onSwitchMode("institution")}
                className="cursor-pointer font-semibold text-primary underline-offset-2 hover:underline"
              >
                Cambiar al formulario institucional
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
