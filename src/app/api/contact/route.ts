import { NextResponse } from "next/server";
import { z } from "zod";
import { sendContactEmail } from "@/lib/mailer";

const institutionSchema = z
  .object({
    type: z.literal("institution"),
    name: z.string().trim().min(2, "Ingresa tu nombre completo.").max(120),
    role: z.string().trim().min(2, "Selecciona o indica tu cargo.").max(80),
    schoolName: z
      .string()
      .trim()
      .min(2, "Ingresa el nombre del establecimiento o institución.")
      .max(160),
    rbd: z.string().trim().max(30).optional().default(""),
    approxCourses: z.string().trim().max(60).optional().default(""),
    email: z.string().trim().email("Ingresa un correo electrónico válido."),
    phone: z
      .string()
      .trim()
      .min(6, "Ingresa un teléfono o WhatsApp de contacto válido.")
      .max(40),
    wantsMeeting: z.boolean().default(false),
    meetingAvailability: z.string().trim().max(240).optional().default(""),
    message: z.string().trim().max(2000).optional().default(""),
    website: z.string().optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (data.wantsMeeting && data.meetingAvailability.trim().length < 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["meetingAvailability"],
        message:
          "Indícanos tus días u horarios preferidos para coordinar la reunión.",
      });
    }
  });

const teacherSchema = z.object({
  type: z.literal("teacher"),
  name: z.string().trim().min(2, "Ingresa tu nombre completo.").max(120),
  profile: z.string().trim().min(2, "Selecciona tu perfil.").max(100),
  email: z.string().trim().email("Ingresa un correo electrónico válido."),
  phone: z
    .string()
    .trim()
    .min(6, "Ingresa un teléfono o WhatsApp de contacto válido.")
    .max(40),
  taxDocument: z.enum(["boleta", "factura", "por_definir"]).default("boleta"),
  message: z
    .string()
    .trim()
    .min(5, "Cuéntanos brevemente cómo planeas usar ProfeKit Horarios.")
    .max(2000),
  website: z.string().optional().default(""),
});

const contactPayloadSchema = z.discriminatedUnion("type", [
  institutionSchema,
  teacherSchema,
]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const TAX_DOC_LABELS: Record<"boleta" | "factura" | "por_definir", string> = {
  boleta: "Boleta electrónica",
  factura: "Factura electrónica",
  por_definir: "Por definir",
};

export async function POST(request: Request) {
  try {
    const rawBody: unknown = await request.json();
    const parsed = contactPayloadSchema.safeParse(rawBody);

    if (!parsed.success) {
      const firstError =
        parsed.error.issues[0]?.message ||
        "Revisa los campos del formulario e intenta nuevamente.";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const data = parsed.data;

    // Anti-spam honeypot: silent success
    if (data.website && data.website.trim().length > 0) {
      return NextResponse.json({ ok: true });
    }

    if (data.type === "institution") {
      const subjectPrefix = data.wantsMeeting
        ? "[ProfeKit Horarios · Reunión + Cotización]"
        : "[ProfeKit Horarios · Colegio/Institución]";
      const subject = `${subjectPrefix} ${data.schoolName} — ${data.name}`;

      const rows = [
        ["Tipo de formulario", "Colegios, Liceos e Instituciones"],
        ["Nombre", data.name],
        ["Cargo", data.role],
        ["Establecimiento / Institución", data.schoolName],
        ["RBD", data.rbd || "No indicado"],
        ["Tamaño aproximado", data.approxCourses || "No indicado"],
        ["Correo", data.email],
        ["Teléfono / WhatsApp", data.phone],
        [
          "¿Solicita reunión de demostración?",
          data.wantsMeeting ? "SÍ — Coordinar reunión" : "No por ahora",
        ],
        ...(data.wantsMeeting
          ? [["Disponibilidad horaria", data.meetingAvailability]]
          : []),
        ["Mensaje", data.message || "Sin comentarios adicionales"],
      ];

      const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; color: #09090b;">
          <div style="background: #1d4ed8; color: #ffffff; padding: 20px 24px; border-radius: 12px 12px 0 0;">
            <p style="margin: 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">ProfeKit Horarios · Contacto Institucional</p>
            <h2 style="margin: 6px 0 0; font-size: 20px;">${escapeHtml(data.schoolName)}</h2>
          </div>
          <div style="border: 1px solid #e4e4e7; border-top: 0; border-radius: 0 0 12px 12px; padding: 20px 24px; background: #ffffff;">
            ${
              data.wantsMeeting
                ? `<div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 14px; margin-bottom: 16px; color: #1e40af; font-size: 14px;">
                    <strong>Solicita reunión de demostración</strong><br/>
                    Disponibilidad indicada: ${escapeHtml(data.meetingAvailability)}
                  </div>`
                : ""
            }
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              ${rows
                .map(
                  ([label, value]) => `
                <tr>
                  <td style="padding: 8px 10px 8px 0; border-bottom: 1px solid #f4f4f5; color: #71717a; width: 38%; vertical-align: top;">${escapeHtml(label)}</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #f4f4f5; color: #09090b; font-weight: 500; white-space: pre-wrap;">${escapeHtml(value)}</td>
                </tr>`
                )
                .join("")}
            </table>
          </div>
        </div>
      `;

      const result = await sendContactEmail({
        subject,
        replyTo: data.email,
        text,
        html,
      });

      return NextResponse.json({ ok: true, mode: result.mode });
    }

    // Teacher form
    const subject = `[ProfeKit Horarios · Profesor Individual] ${data.name}`;
    const rows = [
      ["Tipo de formulario", "Licencia Individual para Profesores"],
      ["Nombre", data.name],
      ["Perfil", data.profile],
      ["Correo", data.email],
      ["Teléfono / WhatsApp", data.phone],
      ["Documento tributario preferido", TAX_DOC_LABELS[data.taxDocument]],
      ["Consulta / Caso de uso", data.message],
    ];

    const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; color: #09090b;">
        <div style="background: #0f172a; color: #ffffff; padding: 20px 24px; border-radius: 12px 12px 0 0;">
          <p style="margin: 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">ProfeKit Horarios · Consulta de Profesor</p>
          <h2 style="margin: 6px 0 0; font-size: 20px;">${escapeHtml(data.name)}</h2>
        </div>
        <div style="border: 1px solid #e4e4e7; border-top: 0; border-radius: 0 0 12px 12px; padding: 20px 24px; background: #ffffff;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            ${rows
              .map(
                ([label, value]) => `
              <tr>
                <td style="padding: 8px 10px 8px 0; border-bottom: 1px solid #f4f4f5; color: #71717a; width: 38%; vertical-align: top;">${escapeHtml(label)}</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #f4f4f5; color: #09090b; font-weight: 500; white-space: pre-wrap;">${escapeHtml(value)}</td>
              </tr>`
              )
              .join("")}
          </table>
        </div>
      </div>
    `;

    const result = await sendContactEmail({
      subject,
      replyTo: data.email,
      text,
      html,
    });

    return NextResponse.json({ ok: true, mode: result.mode });
  } catch (error) {
    console.error("Error procesando formulario de contacto:", error);
    const message =
      error instanceof Error
        ? error.message
        : "No pudimos enviar tu solicitud. Intenta nuevamente en unos minutos.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
