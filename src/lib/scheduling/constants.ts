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
  LIBRARY_CRA: "Biblioteca / CRA",
  PIE_ROOM: "Sala de Apoyo / PIE",
  LAB: "Laboratorio de Ciencias",
  COMPUTER_LAB: "Sala de Computación",
  LANGUAGE_LAB: "Laboratorio de Idiomas",
  ART_ROOM: "Sala de Artes",
  MUSIC_ROOM: "Sala de Música",
  MULTIPURPOSE: "Sala Multiuso / Taller",
  WORKSHOP_TP: "Taller Técnico-Profesional",
  GYM: "Gimnasio",
  PATIO: "Patio / Multicancha",
  AUDITORIUM: "Auditorio / Salón de Actos",
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

export const RULE_WEIGHT_META: Record<
  "HARD" | "SOFT",
  { label: string; description: string }
> = {
  HARD: {
    label: "Estricta",
    description:
      "Regla obligatoria: el generador la cumplirá siempre; si es imposible, no generará un horario inválido.",
  },
  SOFT: {
    label: "Flexible",
    description:
      "Regla prioritaria: el generador intentará cumplirla, y si hay conflicto descontará puntaje según su penalización.",
  },
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
    description: "Fija un grupo sincronizado (ej. Taller JEC) en un día y bloque(s) específico(s) de la semana de forma obligatoria (Estricta).",
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

/**
 * Calcula los bloques efectivos semanales de un curso agrupando las asignaturas
 * que comparten un mismo `syncGroupCode` (ya que ocurren de forma simultánea).
 */
export function calculateEffectiveCourseBlocks(
  courseSubjects: Array<{ weeklyBlocks: number; syncGroupCode?: string | null }>
): number {
  let regularBlocks = 0;
  const syncGroupMax = new Map<string, number>();

  for (const cs of courseSubjects) {
    const code = cs.syncGroupCode?.trim();
    if (code) {
      const prev = syncGroupMax.get(code) ?? 0;
      if (cs.weeklyBlocks > prev) {
        syncGroupMax.set(code, cs.weeklyBlocks);
      }
    } else {
      regularBlocks += cs.weeklyBlocks;
    }
  }

  let syncBlocks = 0;
  for (const val of syncGroupMax.values()) {
    syncBlocks += val;
  }
  return regularBlocks + syncBlocks;
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

export type MineducCatalogCategory = "PARVULARIA" | "PLAN_COMUN" | "ELECTIVO" | "TP";

export interface MineducSubjectPreset {
  name: string;
  code: string;
  category: MineducCatalogCategory;
  subGroup: string;
  colorHex: string;
  requiresRoomType: RoomType | null;
  cognitiveWeight: number;
}

export const MINEDUC_SUBJECT_CATALOG: MineducSubjectPreset[] = [
  // ─── 1. Educación Parvularia (8 Núcleos de Aprendizaje — BCEP) ───
  { name: "Identidad y Autonomía", code: "PIA", category: "PARVULARIA", subGroup: "Desarrollo Personal y Social", colorHex: "#FFB725", requiresRoomType: null, cognitiveWeight: 1 },
  { name: "Convivencia y Ciudadanía", code: "PCC", category: "PARVULARIA", subGroup: "Desarrollo Personal y Social", colorHex: "#FFC768", requiresRoomType: null, cognitiveWeight: 1 },
  { name: "Corporalidad y Movimiento", code: "PCM", category: "PARVULARIA", subGroup: "Desarrollo Personal y Social", colorHex: "#8AD20E", requiresRoomType: "PATIO", cognitiveWeight: 1 },
  { name: "Lenguaje Verbal", code: "PLV", category: "PARVULARIA", subGroup: "Comunicación Integral", colorHex: "#3F69BD", requiresRoomType: null, cognitiveWeight: 2 },
  { name: "Lenguajes Artísticos", code: "PLA", category: "PARVULARIA", subGroup: "Comunicación Integral", colorHex: "#E562AE", requiresRoomType: "ART_ROOM", cognitiveWeight: 1 },
  { name: "Exploración del Entorno Natural", code: "PEN", category: "PARVULARIA", subGroup: "Interacción y Comprensión del Entorno", colorHex: "#50C948", requiresRoomType: null, cognitiveWeight: 2 },
  { name: "Comprensión del Entorno Sociocultural", code: "PES", category: "PARVULARIA", subGroup: "Interacción y Comprensión del Entorno", colorHex: "#FEA500", requiresRoomType: null, cognitiveWeight: 2 },
  { name: "Pensamiento Matemático", code: "PPM", category: "PARVULARIA", subGroup: "Interacción y Comprensión del Entorno", colorHex: "#FF4C21", requiresRoomType: null, cognitiveWeight: 2 },

  // ─── 2. Plan Común (Básica, Media y Transversal) ───
  { name: "Lenguaje y Comunicación", code: "LEN", category: "PLAN_COMUN", subGroup: "Básica", colorHex: "#3F69BD", requiresRoomType: null, cognitiveWeight: 3 },
  { name: "Lengua y Literatura", code: "LYL", category: "PLAN_COMUN", subGroup: "Media", colorHex: "#3F69BD", requiresRoomType: null, cognitiveWeight: 3 },
  { name: "Matemática", code: "MAT", category: "PLAN_COMUN", subGroup: "Transversal", colorHex: "#FF4C21", requiresRoomType: null, cognitiveWeight: 3 },
  { name: "Historia, Geografía y Ciencias Sociales", code: "HIS", category: "PLAN_COMUN", subGroup: "Transversal", colorHex: "#FFB725", requiresRoomType: null, cognitiveWeight: 2 },
  { name: "Ciencias Naturales", code: "CNAT", category: "PLAN_COMUN", subGroup: "Básica", colorHex: "#50C948", requiresRoomType: "LAB", cognitiveWeight: 2 },
  { name: "Biología", code: "BIO", category: "PLAN_COMUN", subGroup: "Media", colorHex: "#50C948", requiresRoomType: "LAB", cognitiveWeight: 3 },
  { name: "Física", code: "FIS", category: "PLAN_COMUN", subGroup: "Media", colorHex: "#00B7F0", requiresRoomType: "LAB", cognitiveWeight: 3 },
  { name: "Química", code: "QUI", category: "PLAN_COMUN", subGroup: "Media", colorHex: "#50CAA5", requiresRoomType: "LAB", cognitiveWeight: 3 },
  { name: "Ciencias para la Ciudadanía", code: "CPC", category: "PLAN_COMUN", subGroup: "Media", colorHex: "#7AD06D", requiresRoomType: "LAB", cognitiveWeight: 2 },
  { name: "Inglés", code: "ING", category: "PLAN_COMUN", subGroup: "Transversal", colorHex: "#6147A8", requiresRoomType: "LANGUAGE_LAB", cognitiveWeight: 2 },
  { name: "Francés", code: "FRA", category: "PLAN_COMUN", subGroup: "Idiomas", colorHex: "#7A62B6", requiresRoomType: "LANGUAGE_LAB", cognitiveWeight: 2 },
  { name: "Alemán", code: "ALE", category: "PLAN_COMUN", subGroup: "Idiomas", colorHex: "#9481C3", requiresRoomType: "LANGUAGE_LAB", cognitiveWeight: 2 },
  { name: "Educación Física y Salud", code: "EFI", category: "PLAN_COMUN", subGroup: "Transversal", colorHex: "#8AD20E", requiresRoomType: "GYM", cognitiveWeight: 1 },
  { name: "Artes Visuales", code: "ART", category: "PLAN_COMUN", subGroup: "Transversal", colorHex: "#E562AE", requiresRoomType: "ART_ROOM", cognitiveWeight: 1 },
  { name: "Música", code: "MUS", category: "PLAN_COMUN", subGroup: "Transversal", colorHex: "#9141A4", requiresRoomType: "MUSIC_ROOM", cognitiveWeight: 1 },
  { name: "Danza", code: "DAN", category: "PLAN_COMUN", subGroup: "Artística", colorHex: "#DF269B", requiresRoomType: "MULTIPURPOSE", cognitiveWeight: 1 },
  { name: "Teatro", code: "TEA", category: "PLAN_COMUN", subGroup: "Artística", colorHex: "#FF488B", requiresRoomType: "AUDITORIUM", cognitiveWeight: 1 },
  { name: "Tecnología", code: "TEC", category: "PLAN_COMUN", subGroup: "Transversal", colorHex: "#59C2F2", requiresRoomType: "COMPUTER_LAB", cognitiveWeight: 1 },
  { name: "Orientación", code: "ORI", category: "PLAN_COMUN", subGroup: "Transversal", colorHex: "#7BD4B6", requiresRoomType: null, cognitiveWeight: 1 },
  { name: "Consejo de Curso", code: "CC", category: "PLAN_COMUN", subGroup: "Transversal", colorHex: "#9FDDC6", requiresRoomType: null, cognitiveWeight: 1 },
  { name: "Religión", code: "REL", category: "PLAN_COMUN", subGroup: "Transversal", colorHex: "#FFD998", requiresRoomType: null, cognitiveWeight: 1 },
  { name: "Educación Ciudadana", code: "ECI", category: "PLAN_COMUN", subGroup: "Media", colorHex: "#FEA500", requiresRoomType: null, cognitiveWeight: 2 },
  { name: "Filosofía", code: "FIL", category: "PLAN_COMUN", subGroup: "Media", colorHex: "#7A62B6", requiresRoomType: null, cognitiveWeight: 2 },
  { name: "Lengua y Cultura de los Pueblos Originarios Ancestrales", code: "LPO", category: "PLAN_COMUN", subGroup: "Básica", colorHex: "#FFC768", requiresRoomType: null, cognitiveWeight: 1 },

  // ─── 3. Electivos — Plan Diferenciado HC 3° y 4° Medio (27 asignaturas oficiales) ───
  // Área A: Lengua, Humanidades y Ciencias Sociales
  { name: "Lectura y Escritura Especializadas", code: "LEE", category: "ELECTIVO", subGroup: "Área A · Lenguaje", colorHex: "#3F69BD", requiresRoomType: null, cognitiveWeight: 3 },
  { name: "Participación y Argumentación en Democracia", code: "PAD", category: "ELECTIVO", subGroup: "Área A · Lenguaje", colorHex: "#667EC8", requiresRoomType: null, cognitiveWeight: 3 },
  { name: "Taller de Literatura", code: "TLI", category: "ELECTIVO", subGroup: "Área A · Lenguaje", colorHex: "#8797D2", requiresRoomType: null, cognitiveWeight: 2 },
  { name: "Estética", code: "EST", category: "ELECTIVO", subGroup: "Área A · Filosofía", colorHex: "#6147A8", requiresRoomType: null, cognitiveWeight: 2 },
  { name: "Filosofía Política", code: "FPO", category: "ELECTIVO", subGroup: "Área A · Filosofía", colorHex: "#7A62B6", requiresRoomType: null, cognitiveWeight: 3 },
  { name: "Seminario de Filosofía", code: "SFI", category: "ELECTIVO", subGroup: "Área A · Filosofía", colorHex: "#9481C3", requiresRoomType: null, cognitiveWeight: 3 },
  { name: "Comprensión Histórica del Presente", code: "CHP", category: "ELECTIVO", subGroup: "Área A · Historia", colorHex: "#DF269B", requiresRoomType: null, cognitiveWeight: 2 },
  { name: "Economía y Sociedad", code: "EYS", category: "ELECTIVO", subGroup: "Área A · Historia", colorHex: "#FF488B", requiresRoomType: null, cognitiveWeight: 2 },
  { name: "Geografía, Territorio y Desafíos Socioambientales", code: "GTD", category: "ELECTIVO", subGroup: "Área A · Historia", colorHex: "#FFB725", requiresRoomType: null, cognitiveWeight: 2 },
  // Área B: Matemática y Ciencias Naturales
  { name: "Geometría 3D", code: "G3D", category: "ELECTIVO", subGroup: "Área B · Matemática", colorHex: "#FF4C21", requiresRoomType: null, cognitiveWeight: 3 },
  { name: "Límites, Derivadas e Integrales", code: "LDI", category: "ELECTIVO", subGroup: "Área B · Matemática", colorHex: "#FE0000", requiresRoomType: null, cognitiveWeight: 3 },
  { name: "Pensamiento Computacional y Programación", code: "PCP", category: "ELECTIVO", subGroup: "Área B · Matemática", colorHex: "#00B7F0", requiresRoomType: "COMPUTER_LAB", cognitiveWeight: 3 },
  { name: "Probabilidades y Estadística Descriptiva e Inferencial", code: "PED", category: "ELECTIVO", subGroup: "Área B · Matemática", colorHex: "#FF7D59", requiresRoomType: null, cognitiveWeight: 3 },
  { name: "Biología Celular y Molecular", code: "BCM", category: "ELECTIVO", subGroup: "Área B · Ciencias", colorHex: "#50C948", requiresRoomType: "LAB", cognitiveWeight: 3 },
  { name: "Biología de los Ecosistemas", code: "BEC", category: "ELECTIVO", subGroup: "Área B · Ciencias", colorHex: "#7AD06D", requiresRoomType: "LAB", cognitiveWeight: 2 },
  { name: "Ciencias de la Salud", code: "CSA", category: "ELECTIVO", subGroup: "Área B · Ciencias", colorHex: "#9EDA90", requiresRoomType: "LAB", cognitiveWeight: 2 },
  { name: "Física (Profundización)", code: "FISD", category: "ELECTIVO", subGroup: "Área B · Ciencias", colorHex: "#59C2F2", requiresRoomType: "LAB", cognitiveWeight: 3 },
  { name: "Química (Profundización)", code: "QUID", category: "ELECTIVO", subGroup: "Área B · Ciencias", colorHex: "#50CAA5", requiresRoomType: "LAB", cognitiveWeight: 3 },
  // Área C: Artes, Educación Física y Salud
  { name: "Artes Visuales, Audiovisuales y Multimediales", code: "AVM", category: "ELECTIVO", subGroup: "Área C · Artes", colorHex: "#E562AE", requiresRoomType: "ART_ROOM", cognitiveWeight: 1 },
  { name: "Creación y Composición Musical", code: "CCM", category: "ELECTIVO", subGroup: "Área C · Artes", colorHex: "#9141A4", requiresRoomType: "MUSIC_ROOM", cognitiveWeight: 1 },
  { name: "Diseño y Arquitectura", code: "DYA", category: "ELECTIVO", subGroup: "Área C · Artes", colorHex: "#A263B4", requiresRoomType: "ART_ROOM", cognitiveWeight: 2 },
  { name: "Interpretación Musical", code: "IMU", category: "ELECTIVO", subGroup: "Área C · Artes", colorHex: "#B284C4", requiresRoomType: "MUSIC_ROOM", cognitiveWeight: 1 },
  { name: "Interpretación y Creación en Danza", code: "ICD", category: "ELECTIVO", subGroup: "Área C · Artes", colorHex: "#EB88BE", requiresRoomType: "MULTIPURPOSE", cognitiveWeight: 1 },
  { name: "Interpretación y Creación en Teatro", code: "ICT", category: "ELECTIVO", subGroup: "Área C · Artes", colorHex: "#FF0175", requiresRoomType: "AUDITORIUM", cognitiveWeight: 1 },
  { name: "Ciencias del Ejercicio Físico y Deportivo", code: "CEF", category: "ELECTIVO", subGroup: "Área C · Ed. Física", colorHex: "#8AD20E", requiresRoomType: "GYM", cognitiveWeight: 2 },
  { name: "Expresión Corporal", code: "ECO", category: "ELECTIVO", subGroup: "Área C · Ed. Física", colorHex: "#A1DA4F", requiresRoomType: "GYM", cognitiveWeight: 1 },
  { name: "Promoción de Estilos de Vida Activos y Saludables", code: "PEV", category: "ELECTIVO", subGroup: "Área C · Ed. Física", colorHex: "#7BD4B6", requiresRoomType: "GYM", cognitiveWeight: 1 },

  // ─── 4. Educación Media Técnico-Profesional (35 especialidades oficiales en 15 sectores) ───
  { name: "Administración", code: "TP_ADM", category: "TP", subGroup: "Administración y Comercio", colorHex: "#3F69BD", requiresRoomType: "COMPUTER_LAB", cognitiveWeight: 2 },
  { name: "Contabilidad", code: "TP_CON", category: "TP", subGroup: "Administración y Comercio", colorHex: "#667EC8", requiresRoomType: "COMPUTER_LAB", cognitiveWeight: 2 },
  { name: "Agropecuaria", code: "TP_AGR", category: "TP", subGroup: "Agropecuario", colorHex: "#50C948", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Elaboración Industrial de Alimentos", code: "TP_EIA", category: "TP", subGroup: "Alimentación", colorHex: "#FFB725", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Gastronomía", code: "TP_GAS", category: "TP", subGroup: "Alimentación", colorHex: "#FEA500", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Vestuario y Confección Textil", code: "TP_VCT", category: "TP", subGroup: "Confección", colorHex: "#E562AE", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Construcción", code: "TP_CST", category: "TP", subGroup: "Construcción", colorHex: "#FF7D59", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Instalaciones Sanitarias", code: "TP_ISA", category: "TP", subGroup: "Construcción", colorHex: "#FFA485", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Montaje Industrial", code: "TP_MIN", category: "TP", subGroup: "Construcción", colorHex: "#FF4C21", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Refrigeración y Climatización", code: "TP_REF", category: "TP", subGroup: "Construcción", colorHex: "#59C2F2", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Electricidad", code: "TP_ELE", category: "TP", subGroup: "Electricidad", colorHex: "#F2F100", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Electrónica", code: "TP_ELN", category: "TP", subGroup: "Electricidad", colorHex: "#F4F43C", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Gráfica", code: "TP_GRA", category: "TP", subGroup: "Gráfico", colorHex: "#DF269B", requiresRoomType: "COMPUTER_LAB", cognitiveWeight: 2 },
  { name: "Dibujo Técnico", code: "TP_DIB", category: "TP", subGroup: "Gráfico", colorHex: "#9141A4", requiresRoomType: "COMPUTER_LAB", cognitiveWeight: 2 },
  { name: "Servicios de Hotelería", code: "TP_HOT", category: "TP", subGroup: "Hotelería y Turismo", colorHex: "#7BD4B6", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Servicios de Turismo", code: "TP_TUR", category: "TP", subGroup: "Hotelería y Turismo", colorHex: "#50CAA5", requiresRoomType: null, cognitiveWeight: 2 },
  { name: "Forestal", code: "TP_FOR", category: "TP", subGroup: "Maderero", colorHex: "#8AD20E", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Muebles y Terminaciones en Madera", code: "TP_MUE", category: "TP", subGroup: "Maderero", colorHex: "#A1DA4F", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Acuicultura", code: "TP_ACU", category: "TP", subGroup: "Marítimo", colorHex: "#00B7F0", requiresRoomType: "LAB", cognitiveWeight: 2 },
  { name: "Pesquería", code: "TP_PES", category: "TP", subGroup: "Marítimo", colorHex: "#8ACFF8", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Tripulación de Naves Mercantes y Especiales", code: "TP_TNM", category: "TP", subGroup: "Marítimo", colorHex: "#3F69BD", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Operaciones Portuarias", code: "TP_OPO", category: "TP", subGroup: "Marítimo", colorHex: "#6147A8", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Mecánica Automotriz", code: "TP_MAU", category: "TP", subGroup: "Metalmecánica", colorHex: "#FE0000", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Mecánica Industrial", code: "TP_MIND", category: "TP", subGroup: "Metalmecánica", colorHex: "#FF4C21", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Construcciones Metálicas", code: "TP_CMT", category: "TP", subGroup: "Metalmecánica", colorHex: "#7A62B6", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Mecánica de Mantención de Aeronaves", code: "TP_MMA", category: "TP", subGroup: "Metalmecánica", colorHex: "#00B7F0", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 3 },
  { name: "Explotación Minera", code: "TP_EMI", category: "TP", subGroup: "Minero", colorHex: "#FFC768", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Metalurgia Extractiva", code: "TP_MEX", category: "TP", subGroup: "Minero", colorHex: "#FFB725", requiresRoomType: "LAB", cognitiveWeight: 2 },
  { name: "Asistencia en Geología", code: "TP_AGE", category: "TP", subGroup: "Minero", colorHex: "#B9E37F", requiresRoomType: "LAB", cognitiveWeight: 2 },
  { name: "Química Industrial", code: "TP_QIN", category: "TP", subGroup: "Química e Industria", colorHex: "#50CAA5", requiresRoomType: "LAB", cognitiveWeight: 3 },
  { name: "Atención de Párvulos", code: "TP_APV", category: "TP", subGroup: "Salud y Educación", colorHex: "#FF7EA4", requiresRoomType: "WORKSHOP_TP", cognitiveWeight: 2 },
  { name: "Atención de Enfermería", code: "TP_AEN", category: "TP", subGroup: "Salud y Educación", colorHex: "#FF488B", requiresRoomType: "LAB", cognitiveWeight: 2 },
  { name: "Conectividad y Redes", code: "TP_CRE", category: "TP", subGroup: "Tecnología y Comunicaciones", colorHex: "#00B7F0", requiresRoomType: "COMPUTER_LAB", cognitiveWeight: 3 },
  { name: "Telecomunicaciones", code: "TP_TEL", category: "TP", subGroup: "Tecnología y Comunicaciones", colorHex: "#59C2F2", requiresRoomType: "COMPUTER_LAB", cognitiveWeight: 3 },
  { name: "Programación", code: "TP_PRO", category: "TP", subGroup: "Tecnología y Comunicaciones", colorHex: "#3F69BD", requiresRoomType: "COMPUTER_LAB", cognitiveWeight: 3 },
];

export const RULE_EXAMPLES: Record<SchedulingRuleType, string[]> = {
  TEACHER_UNAVAILABILITY: [
    "Un docente trabaja en otro colegio los martes y jueves por la mañana.",
    "Una profesora tiene permiso administrativo todos los viernes después del bloque 5.",
  ],
  MAX_TEACHER_WINDOWS: [
    "Evitar que los docentes tengan más de 2 bloques libres intermedios (ventanas) en la semana.",
    "Priorizar horarios continuos para profesores con jornada parcial.",
  ],
  MAX_CONSECUTIVE_TEACHER_BLOCKS: [
    "Impedir que un docente dicte más de 4 bloques seguidos sin descanso.",
    "Proteger la voz y descanso en docentes de Básica con carga completa.",
  ],
  FIRST_LAST_BLOCK_EQUITY: [
    "Repartir de forma justa los bloques de 08:00 y última hora entre todo el cuerpo docente.",
    "Evitar que al mismo profesor le toquen siempre los viernes en el último bloque.",
  ],
  TEACHER_DAY_COMPACTNESS: [
    "Un profesor por hora (12 bloques) necesita concentrar sus clases en máximo 2 o 3 días.",
    "Reducir traslados semanales de profesores que asisten solo a talleres.",
  ],
  TEACHER_DAILY_BLOCKS_LIMIT: [
    "Evitar que un docente deba venir al colegio por 1 solo bloque aislado (mínimo 2 diarios).",
    "Limitar la jornada diaria de un docente a máximo 6 bloques lectivos.",
  ],
  TEACHER_GUARANTEED_LUNCH_BREAK: [
    "En colegios con almuerzo escalonado (bloques 5 y 6), asegurar que todo profesor tenga al menos 1 bloque libre para almorzar.",
  ],
  SYNCED_DEPARTMENT_MEETING: [
    "Dejar libres al mismo tiempo a todos los profesores de Matemática para su reunión semanal de departamento.",
    "Reservar 2 bloques comunes para el equipo de Lenguaje.",
  ],
  TEACHER_CAMPUS_TRAVEL: [
    "Un docente que dicta clases en Sede Central y Anexo necesita 1 bloque libre entre medio para trasladarse.",
  ],
  SUBJECT_PREFERRED_TIME_RANGE: [
    "Priorizar Matemática y Lenguaje en los bloques de la mañana (bloques 1 a 4).",
    "Ubicar talleres artísticos o deportivos preferentemente en la tarde.",
  ],
  MAX_DAILY_BLOCKS_PER_SUBJECT: [
    "Limitar Matemática a máximo 2 bloques por día en cada curso para no fatigar a los estudiantes.",
    "Evitar que un curso tenga 3 bloques de Inglés el mismo día.",
  ],
  CONSECUTIVE_BLOCKS_POLICY: [
    "Exigir que Educación Física y Laboratorio de Ciencias se dicten siempre en bloques dobles (90 min).",
    "Preferir pares consecutivos para Artes Visuales y Tecnología.",
  ],
  PRIORITIZE_PAIR_GROUPS: [
    "Alinear bloques dobles dentro del mismo par entre recreos (1-2, 3-4, 5-6) sin que un recreo corte la clase.",
  ],
  WEEKLY_SPREAD_BALANCE: [
    "Distribuir una asignatura de 4 o 6 bloques a lo largo de la semana en vez de concentrarla lunes y martes.",
  ],
  NO_SAME_SUBJECT_AROUND_LUNCH: [
    "Evitar que un curso tenga Historia justo antes de almuerzo y vuelva a tener Historia justo después.",
  ],
  NO_ADJACENT_SIMILAR_SUBJECTS: [
    "No juntar dos asignaturas de idiomas seguidas (ej. Lenguaje inmediatamente antes o después de Inglés).",
  ],
  EXTENDED_BLOCKS_POLICY: [
    "Agrupar talleres Técnico-Profesionales (TP) en sesiones continuas de 3 o 4 bloques seguidos.",
  ],
  FIXED_SUBJECT_SLOT: [
    "Fijar Consejo de Curso los miércoles en el bloque 1 para todos los cursos.",
    "Anclar Orientación el viernes en el último bloque.",
  ],
  SUBJECT_MIN_DAY_SPACING: [
    "Si un curso tiene 2 sesiones semanales de Ciencias, dejar al menos 1 día de separación entre ellas (ej. lunes y miércoles).",
  ],
  MAX_DAILY_COGNITIVE_LOAD: [
    "Evitar que un curso tenga Matemática, Física, Química e Historia concentradas en el mismo día.",
  ],
  NO_SUBJECT_POST_LUNCH: [
    "Evitar programar Educación Física en el primer bloque después del almuerzo.",
  ],
  SUBJECT_PRECEDENCE: [
    "Asegurar que la clase teórica de Química ocurra antes en la semana que su Taller de Laboratorio.",
  ],
  SHARED_ROOM_CAPACITY: [
    "Controlar que no se programen más cursos simultáneos en el Gimnasio o Laboratorio que los que caben físicamente.",
  ],
  ROOM_TRAVEL_TIME: [
    "Evitar que un curso pase de Gimnasio a Laboratorio en bloques consecutivos sin recreo intermedio.",
  ],
  ROOM_ACCESSIBILITY_FLOOR: [
    "Mantener a 1° y 2° Básico (o cursos con estudiantes de movilidad reducida) siempre en salas de 1° piso.",
  ],
  ROOM_STUDENT_CAPACITY: [
    "Impedir que un curso de 42 estudiantes sea asignado a un laboratorio con aforo máximo de 30.",
  ],
  ROOM_EQUIPMENT_REQUIREMENT: [
    "Exigir que Programación use únicamente salas etiquetadas con 'PC' o 'Proyector'.",
  ],
  MINIMIZE_COURSE_ROOM_CHANGES: [
    "Cuando el colegio usa salas rotativas, limitar a máximo 1 o 2 cambios de sala por día para cada curso.",
  ],
  SYNC_GROUP_SIMULTANEITY: [
    "Hacer que todos los electivos de 3° Medio (grupo ELECTIVOS_3M) ocurran exactamente a la misma hora en salas distintas.",
  ],
  FIXED_SYNC_GROUP_SLOT: [
    "Fijar los Talleres JEC (grupo TALLER_JEC) obligatoriamente los miércoles en bloques 7 y 8.",
  ],
  PIE_CO_TEACHING_SYNC: [
    "Garantizar que en los bloques con Apoyo PIE estén disponibles simultáneamente el profesor titular y la educadora diferencial.",
  ],
  ALLOW_COURSE_WINDOWS: [
    "Solo activar si el colegio permite bloques libres intermedios en el horario de los estudiantes (poco común en Chile).",
  ],
  ROOM_ASSIGNMENT_MODE: [
    "Configurado en el paso Salas: define si cada curso tiene sala fija o si los estudiantes rotan por asignatura.",
  ],
  LEY_20903_POLICY: [
    "Aplicar proporción 65/35 general o 60/40 en 1° a 4° Básico para validar topes lectivos según contrato docente.",
  ],
};
