import type {
  LevelCode,
  NonTeachingActivityType,
  RoomType,
  SchedulingRuleType,
  TeacherAssignmentRole,
} from "@prisma/client";

export const DAYS_OF_WEEK = [
  { value: 1, label: "Lunes", short: "Lun" },
  { value: 2, label: "Martes", short: "Mar" },
  { value: 3, label: "Miércoles", short: "Mié" },
  { value: 4, label: "Jueves", short: "Jue" },
  { value: 5, label: "Viernes", short: "Vie" },
] as const;

export const LEVEL_LABELS: Record<LevelCode, string> = {
  BASIC_1_4: "Básica 1° a 4°",
  BASIC_5_8: "Básica 5° a 8°",
  MEDIA_1_2: "Media 1° y 2°",
  MEDIA_3_4: "Media 3° y 4°",
};

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  CLASSROOM: "Sala de Clases",
  LAB: "Laboratorio de Ciencias",
  GYM: "Gimnasio / Cancha",
  COMPUTER_LAB: "Sala de Computación",
};

export const TEACHER_ROLE_LABELS: Record<TeacherAssignmentRole, string> = {
  LEAD: "Docente Titular",
  CO_TEACHER: "Codocente",
  PIE_SUPPORT: "Apoyo PIE",
};

export const ACTIVITY_TYPE_LABELS: Record<NonTeachingActivityType, string> = {
  STAFF_MEETING: "Consejo de Profesores",
  DEPARTMENT_MEETING: "Reunión de Departamento",
  PARENT_MEETING: "Atención de Apoderados",
  PLANNING: "Planificación / No Lectivo",
};

export const RULE_TYPE_META: Record<
  SchedulingRuleType,
  {
    label: string;
    category: "DOCENTE" | "PEDAGOGICA" | "INFRAESTRUCTURA" | "ESPECIAL";
    description: string;
    defaultWeight: "HARD" | "SOFT";
    defaultPenalty: number;
  }
> = {
  TEACHER_UNAVAILABILITY: {
    label: "Bloques no disponibles del profesor",
    category: "DOCENTE",
    description: "Días o bloques exactos en que el docente no trabaja en el establecimiento.",
    defaultWeight: "HARD",
    defaultPenalty: 100,
  },
  MAX_TEACHER_WINDOWS: {
    label: "Minimización de ventanas docentes",
    category: "DOCENTE",
    description: "Opcional: por defecto las ventanas libres de profesores no descuentan puntaje, salvo que asignes una penalización.",
    defaultWeight: "SOFT",
    defaultPenalty: 0,
  },
  MAX_CONSECUTIVE_TEACHER_BLOCKS: {
    label: "Límite de bloques consecutivos por docente",
    category: "DOCENTE",
    description: "Descuenta puntaje si un docente supera el máximo de bloques seguidos sin pausa (por defecto 4 bloques).",
    defaultWeight: "SOFT",
    defaultPenalty: 25,
  },
  FIRST_LAST_BLOCK_EQUITY: {
    label: "Equidad en primera y última hora",
    category: "DOCENTE",
    description: "Evita concentrar primeros bloques (08:00) o últimos bloques en el mismo docente.",
    defaultWeight: "SOFT",
    defaultPenalty: 15,
  },
  TEACHER_DAY_COMPACTNESS: {
    label: "Compactación de días docentes (minimizar días asistidos)",
    category: "DOCENTE",
    description: "Ideal para docentes por hora o profesores taxi: limita el máximo de días a la semana en que asiste el docente.",
    defaultWeight: "SOFT",
    defaultPenalty: 35,
  },
  TEACHER_DAILY_BLOCKS_LIMIT: {
    label: "Mínimo y máximo de bloques diarios por docente",
    category: "DOCENTE",
    description: "Evita que un docente asista por 1 solo bloque aislado o tenga jornadas diarias sobrecargadas.",
    defaultWeight: "SOFT",
    defaultPenalty: 25,
  },
  TEACHER_GUARANTEED_LUNCH_BREAK: {
    label: "Ventana de colación / almuerzo garantizada",
    category: "DOCENTE",
    description: "Garantiza al menos N bloques libres dentro de la franja de almuerzo cuando el colegio tiene turnos escalonados.",
    defaultWeight: "HARD",
    defaultPenalty: 100,
  },
  SYNCED_DEPARTMENT_MEETING: {
    label: "Reuniones / horas no lectivas sincronizadas",
    category: "DOCENTE",
    description: "Reserva al menos N bloques semanales donde todo un equipo o departamento docente esté libre simultáneamente.",
    defaultWeight: "HARD",
    defaultPenalty: 100,
  },
  TEACHER_CAMPUS_TRAVEL: {
    label: "Traslado entre sedes o anexos",
    category: "DOCENTE",
    description: "Exige bloques libres (o cambio en almuerzo) cuando un docente cambia de sede/anexo en el mismo día.",
    defaultWeight: "HARD",
    defaultPenalty: 100,
  },
  SUBJECT_PREFERRED_TIME_RANGE: {
    label: "Franjas horarias prioritarias por asignatura",
    category: "PEDAGOGICA",
    description: "Prioriza asignaturas de alta carga cognitiva en la mañana o talleres en la tarde.",
    defaultWeight: "SOFT",
    defaultPenalty: 18,
  },
  MAX_DAILY_BLOCKS_PER_SUBJECT: {
    label: "Máximo de bloques diarios por asignatura",
    category: "PEDAGOGICA",
    description: "Limita cuántas horas de una misma asignatura puede tener un curso en un día.",
    defaultWeight: "HARD",
    defaultPenalty: 50,
  },
  CONSECUTIVE_BLOCKS_POLICY: {
    label: "Política de bloques dobles (pareados)",
    category: "PEDAGOGICA",
    description: "Exige o prefiere pares consecutivos (90 min) para laboratorios, Ed. Física o artes.",
    defaultWeight: "SOFT",
    defaultPenalty: 30,
  },
  PRIORITIZE_PAIR_GROUPS: {
    label: "Priorizar bloques contiguos entre recreos",
    category: "PEDAGOGICA",
    description: "Alinea bloques dobles dentro del mismo pair_group_id (1-2, 3-4, 5-6, 7-8).",
    defaultWeight: "SOFT",
    defaultPenalty: 22,
  },
  WEEKLY_SPREAD_BALANCE: {
    label: "Distribución equilibrada semanal",
    category: "PEDAGOGICA",
    description: "Evita concentrar asignaturas de 4+ bloques en días seguidos.",
    defaultWeight: "SOFT",
    defaultPenalty: 15,
  },
  NO_SAME_SUBJECT_AROUND_LUNCH: {
    label: "No repetir asignatura antes y después de almuerzo",
    category: "PEDAGOGICA",
    description: "Impide repetir la misma materia en el último bloque AM y el primero PM.",
    defaultWeight: "SOFT",
    defaultPenalty: 20,
  },
  NO_ADJACENT_SIMILAR_SUBJECTS: {
    label: "Evitar asignaturas similares contiguas",
    category: "PEDAGOGICA",
    description: "Evita dos idiomas seguidos (Lenguaje + Inglés) o materias de alta densidad seguidas.",
    defaultWeight: "SOFT",
    defaultPenalty: 14,
  },
  EXTENDED_BLOCKS_POLICY: {
    label: "Bloques extendidos (triples / cuádruples / TP)",
    category: "PEDAGOGICA",
    description: "Agrupa sesiones continuas de 3, 4 o más bloques para talleres Técnico-Profesionales o laboratorios.",
    defaultWeight: "HARD",
    defaultPenalty: 90,
  },
  FIXED_SUBJECT_SLOT: {
    label: "Bloques fijos / anclados (Hard pinning)",
    category: "PEDAGOGICA",
    description: "Fija una asignatura (ej. Consejo de Curso u Orientación) en un día y bloque específico de la semana.",
    defaultWeight: "HARD",
    defaultPenalty: 100,
  },
  SUBJECT_MIN_DAY_SPACING: {
    label: "Separación mínima entre días (espaciamiento)",
    category: "PEDAGOGICA",
    description: "Evita que una asignatura se dicte en días consecutivos, dejando al menos N días entre sesiones.",
    defaultWeight: "SOFT",
    defaultPenalty: 22,
  },
  MAX_DAILY_COGNITIVE_LOAD: {
    label: "Carga cognitiva máxima diaria",
    category: "PEDAGOGICA",
    description: "Topa la suma de pesos cognitivos diarios de un curso para evitar días saturados de asignaturas densas.",
    defaultWeight: "SOFT",
    defaultPenalty: 25,
  },
  NO_SUBJECT_POST_LUNCH: {
    label: "Restricción post-almuerzo por asignatura",
    category: "PEDAGOGICA",
    description: "Evita programar ciertas asignaturas (ej. Educación Física) inmediatamente después del almuerzo.",
    defaultWeight: "SOFT",
    defaultPenalty: 30,
  },
  SUBJECT_PRECEDENCE: {
    label: "Precedencia (Teoría antes de Taller/Laboratorio)",
    category: "PEDAGOGICA",
    description: "Exige que la asignatura teórica ocurra antes en la semana que su taller o laboratorio asociado.",
    defaultWeight: "SOFT",
    defaultPenalty: 30,
  },
  SHARED_ROOM_CAPACITY: {
    label: "Capacidad de espacios compartidos",
    category: "INFRAESTRUCTURA",
    description: "Controla la ocupación simultánea de Gimnasio, Laboratorios y Computación.",
    defaultWeight: "HARD",
    defaultPenalty: 100,
  },
  ROOM_TRAVEL_TIME: {
    label: "Tiempo de traslado entre salas/pabellones",
    category: "INFRAESTRUCTURA",
    description: "Evita cambios de recinto especial en bloques consecutivos sin recreo intermedio.",
    defaultWeight: "SOFT",
    defaultPenalty: 12,
  },
  ROOM_ACCESSIBILITY_FLOOR: {
    label: "Accesibilidad / restricción de piso",
    category: "INFRAESTRUCTURA",
    description: "Restringe cursos pequeños o con movilidad reducida a salas en primer piso (o piso máximo configurado).",
    defaultWeight: "HARD",
    defaultPenalty: 100,
  },
  ROOM_STUDENT_CAPACITY: {
    label: "Aforo / capacidad de alumnos por sala",
    category: "INFRAESTRUCTURA",
    description: "Valida que la matrícula del curso no supere la capacidad máxima de la sala asignada.",
    defaultWeight: "HARD",
    defaultPenalty: 100,
  },
  ROOM_EQUIPMENT_REQUIREMENT: {
    label: "Equipamiento obligatorio de sala",
    category: "INFRAESTRUCTURA",
    description: "Exige que la sala asignada cuente con la etiqueta de equipamiento requerida por la asignatura.",
    defaultWeight: "HARD",
    defaultPenalty: 100,
  },
  MINIMIZE_COURSE_ROOM_CHANGES: {
    label: "Minimizar cambios de sala por curso",
    category: "INFRAESTRUCTURA",
    description: "Reduce los traslados de sala de un mismo curso durante la jornada diaria.",
    defaultWeight: "SOFT",
    defaultPenalty: 18,
  },
  SYNC_GROUP_SIMULTANEITY: {
    label: "Bloques sincronizados (Electivos / Subgrupos)",
    category: "ESPECIAL",
    description: "Fuerza simultaneidad en filas con el mismo sync_group_code en salas distintas.",
    defaultWeight: "HARD",
    defaultPenalty: 100,
  },
  FIXED_SYNC_GROUP_SLOT: {
    label: "Bloques fijos / anclados por grupo sincronizado (Hard pinning)",
    category: "ESPECIAL",
    description: "Fija un grupo sincronizado (ej. Taller JEC) en un día y bloque(s) específico(s) de la semana de forma obligatoria (HARD).",
    defaultWeight: "HARD",
    defaultPenalty: 100,
  },
  PIE_CO_TEACHING_SYNC: {
    label: "Codocencia PIE simultánea",
    category: "ESPECIAL",
    description: "Garantiza disponibilidad simultánea del titular y educadora diferencial.",
    defaultWeight: "HARD",
    defaultPenalty: 100,
  },
  ALLOW_COURSE_WINDOWS: {
    label: "Habilitar ventanas en horario de cursos",
    category: "PEDAGOGICA",
    description: "Por defecto los cursos no pueden tener bloques libres entre clases. Activa esta regla solo si el establecimiento permite ventanas en cursos.",
    defaultWeight: "SOFT",
    defaultPenalty: 0,
  },
  ROOM_ASSIGNMENT_MODE: {
    label: "Modo de asignación de salas",
    category: "INFRAESTRUCTURA",
    description: "Define si cada curso mantiene siempre su sala fija (estándar en Chile), si rota solo a recintos especiales (Gimnasio/Lab) o si las salas son temáticas por asignatura.",
    defaultWeight: "HARD",
    defaultPenalty: 100,
  },
  LEY_20903_POLICY: {
    label: "Política Ley 20.903 (65/35 y 60/40)",
    description:
      "Configura proporción lectiva/no lectiva, imputación de recreos, duración de bloques y exigencia estricta.",
    category: "DOCENTE",
    defaultWeight: "HARD",
    defaultPenalty: 100,
  },
};

export type RoomAssignmentMode =
  | "FIXED_COURSE_STRICT"
  | "FIXED_COURSE_WITH_SPECIALS"
  | "BY_SUBJECT";

export const ROOM_ASSIGNMENT_MODE_LABELS: Record<
  RoomAssignmentMode,
  { label: string; description: string }
> = {
  FIXED_COURSE_STRICT: {
    label: "Sala fija por curso (estándar Chile)",
    description: "Cada curso permanece siempre en su sala base asignada; los docentes rotan.",
  },
  FIXED_COURSE_WITH_SPECIALS: {
    label: "Sala fija por curso + recintos especiales",
    description: "Usa la sala del curso y solo traslada a Gimnasio, Laboratorio o Computación.",
  },
  BY_SUBJECT: {
    label: "Salas por asignatura (rotativas)",
    description: "Asigna salas según los requerimientos de cada asignatura y disponibilidad.",
  },
};

export type Ley20903RatioMode = "65_35" | "60_40";
export type TeacherLey20903Override = "AUTO" | "65_35" | "60_40";

export interface Ley20903Policy {
  /** Proporción base del establecimiento: 65/35 (general) o 60/40 (≥ 80% prioritarios). */
  defaultRatio: Ley20903RatioMode;
  /** Aplica automáticamente 60/40 a docentes que imparten clases en 1° a 4° básico (BASIC_1_4). */
  apply6040ToBasic1to4: boolean;
  /** Imputa recreos proporcionales dentro del porcentaje lectivo (estándar MINEDUC). */
  includeBreaksInTeaching: boolean;
  /** Minutos de recreo proporcional por bloque pedagógico (4 min = tabla oficial MINEDUC para bloques de 45 min). */
  breakMinutesPerBlock: number;
  /** Duración del bloque pedagógico en minutos (0 = detectar automáticamente desde la Jornada/BellSchedule, fallback 45). */
  blockDurationMinutes: number;
  /** Si es true, exceder el tope legal genera conflicto DURO / ERROR en lugar de advertencia. */
  strictEnforcement: boolean;
}

export const DEFAULT_LEY_20903_POLICY: Ley20903Policy = {
  defaultRatio: "65_35",
  apply6040ToBasic1to4: false,
  includeBreaksInTeaching: true,
  breakMinutesPerBlock: 4,
  blockDurationMinutes: 0,
  strictEnforcement: false,
};

export const LEY_20903_RATIO_LABELS: Record<Ley20903RatioMode, string> = {
  "65_35": "65/35",
  "60_40": "60/40",
};

export function normalizeTeacherLey20903Override(raw: unknown): TeacherLey20903Override {
  const s = String(raw ?? "AUTO").toUpperCase();
  if (s === "65_35" || s === "65/35") return "65_35";
  if (s === "60_40" || s === "60/40") return "60_40";
  return "AUTO";
}

export function extractLey20903Policy(
  rules: Array<{ ruleType: string; parameters?: unknown }>
): Ley20903Policy {
  const rule = rules.find((r) => r.ruleType === "LEY_20903_POLICY");
  if (!rule || typeof rule.parameters !== "object" || rule.parameters === null) {
    return { ...DEFAULT_LEY_20903_POLICY };
  }
  const p = rule.parameters as Partial<Ley20903Policy>;
  const defaultRatio: Ley20903RatioMode = p.defaultRatio === "60_40" ? "60_40" : "65_35";
  const breakMin =
    typeof p.breakMinutesPerBlock === "number" && Number.isFinite(p.breakMinutesPerBlock)
      ? Math.max(0, Math.min(20, p.breakMinutesPerBlock))
      : DEFAULT_LEY_20903_POLICY.breakMinutesPerBlock;
  const blockMin =
    typeof p.blockDurationMinutes === "number" && Number.isFinite(p.blockDurationMinutes)
      ? Math.max(0, Math.min(120, Math.round(p.blockDurationMinutes)))
      : DEFAULT_LEY_20903_POLICY.blockDurationMinutes;

  return {
    defaultRatio,
    apply6040ToBasic1to4:
      typeof p.apply6040ToBasic1to4 === "boolean"
        ? p.apply6040ToBasic1to4
        : DEFAULT_LEY_20903_POLICY.apply6040ToBasic1to4,
    includeBreaksInTeaching:
      typeof p.includeBreaksInTeaching === "boolean"
        ? p.includeBreaksInTeaching
        : DEFAULT_LEY_20903_POLICY.includeBreaksInTeaching,
    breakMinutesPerBlock: breakMin,
    blockDurationMinutes: blockMin,
    strictEnforcement:
      typeof p.strictEnforcement === "boolean"
        ? p.strictEnforcement
        : DEFAULT_LEY_20903_POLICY.strictEnforcement,
  };
}

/**
 * Resuelve la duración efectiva de un bloque pedagógico (min) a partir de la política o de los TimeSlots de clase.
 */
export function resolveBlockDurationMinutes(
  bellSchedules: Array<{ timeSlots?: Array<{ slotType: string; durationMinutes: number }> }>,
  policy?: Pick<Ley20903Policy, "blockDurationMinutes">
): number {
  if (policy && policy.blockDurationMinutes > 0) {
    return policy.blockDurationMinutes;
  }
  const counts = new Map<number, number>();
  for (const bs of bellSchedules) {
    for (const s of bs.timeSlots ?? []) {
      if (s.slotType === "CLASS" && s.durationMinutes > 0) {
        counts.set(s.durationMinutes, (counts.get(s.durationMinutes) ?? 0) + 1);
      }
    }
  }
  if (counts.size === 0) return 45;
  let bestDur = 45;
  let bestCount = -1;
  for (const [dur, cnt] of counts) {
    if (cnt > bestCount) {
      bestCount = cnt;
      bestDur = dur;
    }
  }
  return bestDur;
}

export function resolveTeacherLey20903Ratio(
  teacherOverride: string | null | undefined,
  teachesBasic1to4: boolean,
  policy: Ley20903Policy = DEFAULT_LEY_20903_POLICY
): Ley20903RatioMode {
  const norm = normalizeTeacherLey20903Override(teacherOverride);
  if (norm === "65_35" || norm === "60_40") return norm;
  if (policy.defaultRatio === "60_40") return "60_40";
  if (policy.apply6040ToBasic1to4 && teachesBasic1to4) return "60_40";
  return "65_35";
}

export interface Ley20903CalcOptions {
  ratio?: Ley20903RatioMode;
  blockDurationMinutes?: number;
  includeBreaksInTeaching?: boolean;
  breakMinutesPerBlock?: number;
}

export interface Ley20903Breakdown {
  ratio: Ley20903RatioMode;
  ratioLabel: string;
  teachingPct: number;
  nonTeachingPct: number;
  contractHours: number;
  contractMinutes: number;
  blockDurationMinutes: number;
  breakMinutesPerBlock: number;
  effectiveBlockMinutes: number;
  maxTeachingChronologicalMinutes: number;
  minNonTeachingChronologicalMinutes: number;
  legalMaxTeachingBlocks: number;
  assignedTeachingBlocks: number;
  assignedTeachingMinutes: number;
  actualTeachingPct: number;
  actualNonTeachingPct: number;
  scheduledNonTeachingBlocks: number;
  scheduledNonTeachingMinutes: number;
  remainingNonTeachingMinutes: number;
  exceedsLegalLimit: boolean;
}

/**
 * Ley 20.903 (Chile) — Proporción 65/35 (o 60/40 en alta vulnerabilidad).
 * Calcula el tope legal de bloques pedagógicos a partir de las horas cronológicas de contrato,
 * considerando duración del bloque e imputación opcional de recreos proporcionales (tabla MINEDUC).
 */
export function calculateLegalMaxTeachingBlocks(
  contractHours: number,
  options: Ley20903CalcOptions = {}
): number {
  if (contractHours <= 0) return 0;
  const teachingPct = options.ratio === "60_40" ? 0.6 : 0.65;
  const blockDur =
    options.blockDurationMinutes && options.blockDurationMinutes > 0
      ? options.blockDurationMinutes
      : 45;
  const includeBreaks =
    options.includeBreaksInTeaching ?? DEFAULT_LEY_20903_POLICY.includeBreaksInTeaching;
  const breakMin = includeBreaks
    ? (options.breakMinutesPerBlock ?? DEFAULT_LEY_20903_POLICY.breakMinutesPerBlock)
    : 0;
  const effectiveBlockMinutes = blockDur + Math.max(0, breakMin);
  if (effectiveBlockMinutes <= 0) return 0;
  const maxTeachingMinutes = contractHours * teachingPct * 60;
  return Math.floor(maxTeachingMinutes / effectiveBlockMinutes);
}

/**
 * Desglose completo Ley 20.903 para un docente: horas cronológicas lectivas/no lectivas,
 * tope de bloques pedagógicos, porcentaje real asignado y saldo no lectivo.
 */
export function calculateLey20903Breakdown(params: {
  contractHours: number;
  ratio?: Ley20903RatioMode;
  blockDurationMinutes?: number;
  includeBreaksInTeaching?: boolean;
  breakMinutesPerBlock?: number;
  assignedTeachingBlocks?: number;
  scheduledNonTeachingBlocks?: number;
}): Ley20903Breakdown {
  const ratio: Ley20903RatioMode = params.ratio === "60_40" ? "60_40" : "65_35";
  const teachingPct = ratio === "60_40" ? 0.6 : 0.65;
  const nonTeachingPct = ratio === "60_40" ? 0.4 : 0.35;
  const contractHours = Math.max(0, params.contractHours);
  const contractMinutes = Math.round(contractHours * 60);
  const blockDurationMinutes =
    params.blockDurationMinutes && params.blockDurationMinutes > 0
      ? params.blockDurationMinutes
      : 45;
  const includeBreaks =
    params.includeBreaksInTeaching ?? DEFAULT_LEY_20903_POLICY.includeBreaksInTeaching;
  const breakMinutesPerBlock = includeBreaks
    ? Math.max(0, params.breakMinutesPerBlock ?? DEFAULT_LEY_20903_POLICY.breakMinutesPerBlock)
    : 0;
  const effectiveBlockMinutes = blockDurationMinutes + breakMinutesPerBlock;

  const maxTeachingChronologicalMinutes = Math.round(contractMinutes * teachingPct);
  const minNonTeachingChronologicalMinutes = contractMinutes - maxTeachingChronologicalMinutes;
  const legalMaxTeachingBlocks =
    effectiveBlockMinutes > 0
      ? Math.floor((contractHours * teachingPct * 60) / effectiveBlockMinutes)
      : 0;

  const assignedTeachingBlocks = Math.max(0, params.assignedTeachingBlocks ?? 0);
  const assignedTeachingMinutes = Math.round(assignedTeachingBlocks * effectiveBlockMinutes);
  const actualTeachingPct =
    contractMinutes > 0 ? Math.round((assignedTeachingMinutes / contractMinutes) * 1000) / 10 : 0;
  const actualNonTeachingPct = Math.max(0, Math.round((100 - actualTeachingPct) * 10) / 10);

  const scheduledNonTeachingBlocks = Math.max(0, params.scheduledNonTeachingBlocks ?? 0);
  const scheduledNonTeachingMinutes = Math.round(
    scheduledNonTeachingBlocks * blockDurationMinutes
  );
  const remainingNonTeachingMinutes = Math.max(
    0,
    minNonTeachingChronologicalMinutes - scheduledNonTeachingMinutes
  );

  return {
    ratio,
    ratioLabel: LEY_20903_RATIO_LABELS[ratio],
    teachingPct,
    nonTeachingPct,
    contractHours,
    contractMinutes,
    blockDurationMinutes,
    breakMinutesPerBlock,
    effectiveBlockMinutes,
    maxTeachingChronologicalMinutes,
    minNonTeachingChronologicalMinutes,
    legalMaxTeachingBlocks,
    assignedTeachingBlocks,
    assignedTeachingMinutes,
    actualTeachingPct,
    actualNonTeachingPct,
    scheduledNonTeachingBlocks,
    scheduledNonTeachingMinutes,
    remainingNonTeachingMinutes,
    exceedsLegalLimit: assignedTeachingBlocks > legalMaxTeachingBlocks,
  };
}

export function formatChronologicalMinutes(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function formatMinutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * 60-color wheel palette (12 hue families × 5 tint levels, vivid to pastel).
 */
export const TEACHER_COLOR_FAMILIES = [
  { name: "Rojos", colors: ["#FE0000", "#FF4C21", "#FF7D59", "#FFA485", "#FFD0BC"] },
  { name: "Naranjos", colors: ["#FEA500", "#FFB725", "#FFC768", "#FFD998", "#FFEBCA"] },
  { name: "Amarillos", colors: ["#F2F100", "#F4F43C", "#F8F67D", "#F8F9AB", "#FBFBD5"] },
  { name: "Verde Amarillento", colors: ["#8AD20E", "#A1DA4F", "#B9E37F", "#D0EAA9", "#E4F5D1"] },
  { name: "Verdes", colors: ["#50C948", "#7AD06D", "#9EDA90", "#BEE6B2", "#DDF1D6"] },
  { name: "Verde Azulado", colors: ["#50CAA5", "#7BD4B6", "#9FDDC6", "#BDE8D7", "#DDF1E8"] },
  { name: "Azules", colors: ["#00B7F0", "#59C2F2", "#8ACFF8", "#B1DFF9", "#D8EDFE"] },
  { name: "Azul Violáceo", colors: ["#3F69BD", "#667EC8", "#8797D2", "#A9B4E1", "#D1D5F0"] },
  { name: "Violetas", colors: ["#6147A8", "#7A62B6", "#9481C3", "#B3A5D6", "#D6CDEA"] },
  { name: "Malvas", colors: ["#9141A4", "#A263B4", "#B284C4", "#CBA7D5", "#E0D0EA"] },
  { name: "Rosa Malva", colors: ["#DF269B", "#E562AE", "#EB88BE", "#EFADD3", "#F7D4E8"] },
  { name: "Rosas", colors: ["#FF0175", "#FF488B", "#FF7EA4", "#FFA8C0", "#FED3DD"] },
] as const;

export const TEACHER_COLOR_WHEEL_60: string[] = TEACHER_COLOR_FAMILIES.flatMap(
  (family) => [...family.colors]
);

/**
 * Curated 24-color subset (vivid + medium rings) for automatic assignment on bulk import.
 */
export const TEACHER_AUTO_PALETTE: string[] = [
  ...TEACHER_COLOR_FAMILIES.map((family) => family.colors[1]),
  ...TEACHER_COLOR_FAMILIES.map((family) => family.colors[0]),
];
