import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, resolveActiveSchoolId } from "@/lib/auth";
import { RULE_TYPE_META, RULE_EXAMPLES } from "@/lib/scheduling/constants";
import type { RuleTargetEntityType, RuleWeight, SchedulingRuleType } from "@prisma/client";

export interface RuleAssistantRecommendation {
  ruleType: SchedulingRuleType;
  weight: RuleWeight;
  penaltyScore: number;
  targetEntityType: RuleTargetEntityType;
  targetEntityId: string | null;
  parameters: Record<string, unknown>;
  summary: string;
}

interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

const VALID_RULE_TYPES = new Set<string>(Object.keys(RULE_TYPE_META));

function buildRuleCatalogPrompt(): string {
  return (Object.keys(RULE_TYPE_META) as SchedulingRuleType[])
    .filter((rt) => rt !== "ROOM_ASSIGNMENT_MODE")
    .map((rt) => {
      const m = RULE_TYPE_META[rt];
      const ex = RULE_EXAMPLES[rt]?.[0] ?? "";
      return `- ${rt} (${m.category}, default ${m.defaultWeight}, penalty ${m.defaultPenalty}): ${m.label}. ${m.description} Ejemplo: ${ex}`;
    })
    .join("\n");
}

function buildFallbackRecommendation(
  message: string,
  teachers: Array<{ id: string; firstName: string; lastName: string }>,
  subjects: Array<{ id: string; name: string; code: string }>
): { reply: string; recommendation: RuleAssistantRecommendation | null } {
  const lower = message.toLowerCase();

  if (lower.includes("no puede") || lower.includes("disponib") || lower.includes("bloqueo") || lower.includes("ausente")) {
    const matchedTeacher = teachers.find(
      (t) =>
        lower.includes(t.firstName.toLowerCase()) ||
        lower.includes(t.lastName.toLowerCase())
    );
    return {
      reply:
        "Para restringir días o bloques en los que un docente no trabaja, debes usar la regla **Bloques no disponibles del profesor** (`TEACHER_UNAVAILABILITY`) con peso **HARD** (obligatoria). Selecciona al docente y marca los días o bloques específicos en la matriz.",
      recommendation: {
        ruleType: "TEACHER_UNAVAILABILITY",
        weight: "HARD",
        penaltyScore: 100,
        targetEntityType: "TEACHER",
        targetEntityId: matchedTeacher?.id ?? null,
        parameters: { unavailableDays: [], unavailableBlocks: [] },
        summary: matchedTeacher
          ? `Indisponibilidad para ${matchedTeacher.firstName} ${matchedTeacher.lastName}`
          : "Indisponibilidad horaria de docente",
      },
    };
  }

  if (lower.includes("mañana") || lower.includes("tarde") || lower.includes("franja")) {
    const matchedSubject = subjects.find((s) => lower.includes(s.name.toLowerCase()));
    const period = lower.includes("tarde") ? "AFTERNOON" : "MORNING";
    return {
      reply:
        `Para priorizar una asignatura en la ${period === "MORNING" ? "mañana" : "tarde"}, utiliza **Franjas horarias prioritarias por asignatura** (\`SUBJECT_PREFERRED_TIME_RANGE\`) con peso **SOFT** y período \`${period}\`.`,
      recommendation: {
        ruleType: "SUBJECT_PREFERRED_TIME_RANGE",
        weight: "SOFT",
        penaltyScore: 20,
        targetEntityType: matchedSubject ? "SUBJECT" : "GLOBAL",
        targetEntityId: matchedSubject?.id ?? null,
        parameters: { period },
        summary: `Priorizar ${matchedSubject ? matchedSubject.name : "asignatura"} en ${period === "MORNING" ? "la mañana" : "la tarde"}`,
      },
    };
  }

  if (lower.includes("fijar") || lower.includes("anclar") || lower.includes("consejo") || lower.includes("orientación")) {
    const matchedSubject = subjects.find((s) => lower.includes(s.name.toLowerCase()));
    return {
      reply:
        "Para fijar una asignatura en un día y bloque exacto (por ejemplo Consejo de Curso), usa **Bloques fijos / anclados** (`FIXED_SUBJECT_SLOT`) con peso **HARD**, indicando el día de la semana (1=Lunes a 5=Viernes) y el número de bloque.",
      recommendation: {
        ruleType: "FIXED_SUBJECT_SLOT",
        weight: "HARD",
        penaltyScore: 100,
        targetEntityType: "SUBJECT",
        targetEntityId: matchedSubject?.id ?? null,
        parameters: { dayOfWeek: 3, blockNumber: 1 },
        summary: `Fijar ${matchedSubject ? matchedSubject.name : "asignatura"} en bloque específico`,
      },
    };
  }

  if (lower.includes("almuerzo") || lower.includes("colación")) {
    return {
      reply:
        "Si necesitas asegurar un bloque libre de almuerzo para docentes con turnos escalonados, usa **Ventana de colación / almuerzo garantizada** (`TEACHER_GUARANTEED_LUNCH_BREAK`) en modo **HARD**. Si lo que quieres es evitar repetir la misma asignatura antes y después de almuerzo, usa `NO_SAME_SUBJECT_AROUND_LUNCH`.",
      recommendation: {
        ruleType: "TEACHER_GUARANTEED_LUNCH_BREAK",
        weight: "HARD",
        penaltyScore: 100,
        targetEntityType: "GLOBAL",
        targetEntityId: null,
        parameters: { startBlock: 4, endBlock: 6, minFreeBlocks: 1 },
        summary: "Garantizar 1 bloque libre de almuerzo entre bloques 4 y 6",
      },
    };
  }

  if (lower.includes("doble") || lower.includes("paread") || lower.includes("consecutiv")) {
    const matchedSubject = subjects.find((s) => lower.includes(s.name.toLowerCase()));
    return {
      reply:
        "Para agrupar clases en bloques dobles (90 minutos), configura **Política de bloques dobles (pareados)** (`CONSECUTIVE_BLOCKS_POLICY`) y opcionalmente activa **Priorizar bloques contiguos entre recreos** (`PRIORITIZE_PAIR_GROUPS`).",
      recommendation: {
        ruleType: "CONSECUTIVE_BLOCKS_POLICY",
        weight: "SOFT",
        penaltyScore: 30,
        targetEntityType: matchedSubject ? "SUBJECT" : "GLOBAL",
        targetEntityId: matchedSubject?.id ?? null,
        parameters: {},
        summary: `Bloques dobles para ${matchedSubject ? matchedSubject.name : "asignaturas seleccionadas"}`,
      },
    };
  }

  return {
    reply:
      "No hay una clave `OPENAI_API_KEY` configurada en el servidor para respuestas generativas libres. Configúrala en `.env` para habilitar el asistente completo de OpenAI. Mientras tanto, puedes describirme si buscas restringir horarios de un docente, fijar una asignatura, priorizar mañana/tarde, asegurar almuerzo o exigir bloques dobles.",
    recommendation: null,
  };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const schoolId = await resolveActiveSchoolId(user);
  if (!schoolId) {
    return NextResponse.json({ error: "No hay establecimiento activo." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      message?: string;
      history?: ChatHistoryMessage[];
    };
    const message = String(body.message || "").trim();
    if (!message) {
      return NextResponse.json({ error: "Escribe una consulta para el asistente." }, { status: 400 });
    }

    const [teachers, subjects, courses, rooms, activeRules, syncGroupsRaw] = await Promise.all([
      prisma.teacher.findMany({
        where: { schoolId },
        select: { id: true, firstName: true, lastName: true },
        orderBy: { lastName: "asc" },
      }),
      prisma.subject.findMany({
        where: { schoolId },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }),
      prisma.course.findMany({
        where: { schoolId },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }),
      prisma.room.findMany({
        where: { schoolId },
        select: { id: true, name: true, roomType: true },
        orderBy: { name: "asc" },
      }),
      prisma.schedulingRule.findMany({
        where: { schoolId },
        select: { ruleType: true, weight: true, targetEntityType: true },
      }),
      prisma.courseSubject.findMany({
        where: { course: { schoolId }, syncGroupCode: { not: null } },
        select: { syncGroupCode: true },
        distinct: ["syncGroupCode"],
      }),
    ]);

    const syncGroups = syncGroupsRaw
      .map((s) => s.syncGroupCode)
      .filter((c): c is string => Boolean(c));

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      const fallback = buildFallbackRecommendation(message, teachers, subjects);
      return NextResponse.json({
        ...fallback,
        provider: "fallback",
      });
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const systemPrompt = [
      "Eres el Asistente de Reglas de Horarios de EduKit, experto en gestión curricular chilena (UTP) y programación de horarios escolares.",
      "Tu trabajo es ayudar al usuario a elegir el tipo de restricción (ruleType) exacto que necesita y explicarle claramente cómo configurarla para que el motor de horarios funcione correctamente.",
      "",
      "CATÁLOGO DE REGLAS DISPONIBLES:",
      buildRuleCatalogPrompt(),
      "",
      "CONTEXTO ACTUAL DEL ESTABLECIMIENTO:",
      `- Docentes (${teachers.length}): ${teachers.slice(0, 40).map((t) => `${t.firstName} ${t.lastName} [id:${t.id}]`).join(", ") || "Ninguno"}`,
      `- Asignaturas (${subjects.length}): ${subjects.slice(0, 40).map((s) => `${s.name} (${s.code}) [id:${s.id}]`).join(", ") || "Ninguna"}`,
      `- Cursos (${courses.length}): ${courses.slice(0, 40).map((c) => `${c.name} [id:${c.id}]`).join(", ") || "Ninguno"}`,
      `- Salas (${rooms.length}): ${rooms.slice(0, 30).map((r) => `${r.name} (${r.roomType}) [id:${r.id}]`).join(", ") || "Ninguna"}`,
      `- Grupos sincronizados: ${syncGroups.join(", ") || "Ninguno"}`,
      `- Reglas ya activas (${activeRules.length}): ${activeRules.map((r) => `${r.ruleType}(${r.weight})`).join(", ") || "Ninguna"}`,
      "",
      "INSTRUCCIONES DE RESPUESTA (DEVUELVE EXCLUSIVAMENTE JSON VÁLIDO):",
      "Debes responder un objeto JSON con exactamente dos claves:",
      '1. "reply": string en español de Chile, claro, directo y práctico (máx 4-6 líneas). Explica qué regla usar, por qué conviene HARD o SOFT, y qué valores poner en los parámetros.',
      '2. "recommendation": objeto o null. Si identificaste una regla concreta para configurar, entrega:',
      '   { "ruleType": "<uno de los enum válidos>", "weight": "HARD" | "SOFT", "penaltyScore": number (100 si HARD, 10-50 si SOFT), "targetEntityType": "GLOBAL" | "TEACHER" | "SUBJECT" | "COURSE" | "ROOM", "targetEntityId": "<id exacto del contexto o null>", "parameters": { ...parámetros válidos para esa regla... }, "summary": "<resumen corto en 1 línea>" }',
      "Parámetros esperados por regla:",
      "- TEACHER_UNAVAILABILITY: { unavailableDays: number[] (1..5), unavailableBlocks: Array<{day:number, block:number}> }",
      "- MAX_TEACHER_WINDOWS / MAX_CONSECUTIVE_TEACHER_BLOCKS / MAX_DAILY_BLOCKS_PER_SUBJECT: { max: number }",
      "- TEACHER_DAY_COMPACTNESS: { maxDays: number }",
      "- TEACHER_DAILY_BLOCKS_LIMIT: { min: number, max: number }",
      "- TEACHER_GUARANTEED_LUNCH_BREAK: { startBlock: number, endBlock: number, minFreeBlocks: number }",
      "- SYNCED_DEPARTMENT_MEETING: { teacherIds: string[], requiredFreeBlocks: number }",
      "- TEACHER_CAMPUS_TRAVEL: { minGapBlocks: number }",
      "- SUBJECT_PREFERRED_TIME_RANGE: { period: 'MORNING' | 'AFTERNOON' }",
      "- EXTENDED_BLOCKS_POLICY: { blockSize: number }",
      "- FIXED_SUBJECT_SLOT: { dayOfWeek: number (1..5), blockNumber: number }",
      "- FIXED_SYNC_GROUP_SLOT: { syncGroupCode: string, dayOfWeek: number (1..5), blockNumbers: number[] }",
      "- SUBJECT_MIN_DAY_SPACING: { minDaysBetween: number }",
      "- MAX_DAILY_COGNITIVE_LOAD: { maxDailyLoad: number }",
      "- SUBJECT_PRECEDENCE: { prerequisiteSubjectId: string, dependentSubjectId: string }",
      "- ROOM_ACCESSIBILITY_FLOOR: { maxFloor: number }",
      "- MINIMIZE_COURSE_ROOM_CHANGES: { maxChangesPerDay: number }",
      "- Otras reglas sin parámetros obligatorios: {}",
      "Nunca inventes IDs que no estén en el contexto; si no corresponde o no estás seguro del ID, usa null en targetEntityId.",
    ].join("\n");

    const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return NextResponse.json(
        {
          error: `OpenAI respondió con estado ${response.status}. ${errText.slice(0, 160)}`,
        },
        { status: 502 }
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      return NextResponse.json({ error: "OpenAI no devolvió contenido." }, { status: 502 });
    }

    const parsed = JSON.parse(rawContent) as {
      reply?: string;
      recommendation?: Partial<RuleAssistantRecommendation> | null;
    };

    let recommendation: RuleAssistantRecommendation | null = null;
    if (
      parsed.recommendation &&
      typeof parsed.recommendation.ruleType === "string" &&
      VALID_RULE_TYPES.has(parsed.recommendation.ruleType)
    ) {
      const ruleType = parsed.recommendation.ruleType as SchedulingRuleType;
      const meta = RULE_TYPE_META[ruleType];
      const weight: RuleWeight =
        parsed.recommendation.weight === "HARD" || parsed.recommendation.weight === "SOFT"
          ? parsed.recommendation.weight
          : meta.defaultWeight;
      const targetEntityType: RuleTargetEntityType =
        parsed.recommendation.targetEntityType &&
        ["GLOBAL", "TEACHER", "SUBJECT", "COURSE", "ROOM"].includes(
          parsed.recommendation.targetEntityType
        )
          ? parsed.recommendation.targetEntityType
          : "GLOBAL";
      recommendation = {
        ruleType,
        weight,
        penaltyScore:
          weight === "HARD"
            ? 100
            : Number.isFinite(Number(parsed.recommendation.penaltyScore))
              ? Number(parsed.recommendation.penaltyScore)
              : meta.defaultPenalty,
        targetEntityType,
        targetEntityId:
          typeof parsed.recommendation.targetEntityId === "string" &&
          parsed.recommendation.targetEntityId.trim()
            ? parsed.recommendation.targetEntityId.trim()
            : null,
        parameters:
          parsed.recommendation.parameters &&
          typeof parsed.recommendation.parameters === "object" &&
          !Array.isArray(parsed.recommendation.parameters)
            ? parsed.recommendation.parameters
            : {},
        summary:
          typeof parsed.recommendation.summary === "string" && parsed.recommendation.summary.trim()
            ? parsed.recommendation.summary.trim()
            : meta.label,
      };
    }

    return NextResponse.json({
      reply: parsed.reply || "No pude formular una respuesta clara. Intenta dar un poco más de detalle.",
      recommendation,
      provider: "openai",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al consultar el asistente IA." },
      { status: 500 }
    );
  }
}
