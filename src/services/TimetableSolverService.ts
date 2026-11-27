import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  calculateEffectiveCourseBlocks,
  calculateLegalMaxTeachingBlocks,
  extractLey20903Policy,
  formatChronologicalMinutes,
  LEY_20903_RATIO_LABELS,
  resolveBlockDurationMinutes,
  resolveTeacherLey20903Ratio,
  ROOM_TYPE_LABELS,
  type RoomAssignmentMode,
} from "@/lib/scheduling/constants";
import {
  effectiveAssignedBlocks,
  isPartialSupportAssignment,
  resolveEntryParticipants,
} from "@/lib/scheduling/entryParticipants";
import { Prisma, type RoomType, type SchedulingRule } from "@prisma/client";

export interface PreconditionIssue {
  severity: "ERROR" | "WARNING";
  code: string;
  entityType: "COURSE" | "TEACHER" | "ROOM" | "SYNC_GROUP" | "BELL_SCHEDULE";
  entityId?: string;
  message: string;
}

export interface PreconditionResult {
  ready: boolean;
  issues: PreconditionIssue[];
  stats: {
    courses: number;
    teachers: number;
    rooms: number;
    totalBlocksToSchedule: number;
  };
}

export interface ScheduleConflict {
  id: string;
  severity: "HARD" | "SOFT";
  ruleType: string;
  message: string;
  penalty: number;
  dayOfWeek?: number;
  blockNumber?: number;
  entryIds: string[];
  entityIds?: string[];
}

export interface ConflictAuditResult {
  fitnessScore: number;
  hardCount: number;
  softCount: number;
  totalPenalty: number;
  hardConflicts: ScheduleConflict[];
  softViolations: ScheduleConflict[];
}

export interface GenerateScheduleOptions {
  name?: string;
  baseVersionId?: string;
  maxOptimizationSteps?: number;
}

export interface SimulateSwapPayload {
  mode: "MOVE" | "SWAP";
  entryAId: string;
  entryBId?: string;
  targetTimeSlotId?: string;
  targetRoomId?: string;
}

interface InternalSlot {
  id: string;
  bellScheduleId: string;
  dayOfWeek: number;
  blockNumber: number;
  pairGroupId: number | null;
  startTime: string;
  endTime: string;
  slotType: string;
}

interface InternalEntry {
  id: string;
  courseSubjectId: string;
  courseId: string;
  defaultRoomId: string | null;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  courseName: string;
  requiresRoomType: RoomType | null;
  requiredRoomId: string | null;
  requiresConsecutiveBlocks: boolean;
  syncGroupCode: string | null;
  /** Docentes que participan en este bloque (titulares + apoyos asignados a este bloque). */
  teacherIds: string[];
  /** Docentes que están en otra sala durante el bloque (ej. PIE en Aula de Recursos): teacherId -> roomId. */
  teacherRooms?: Record<string, string>;
  timeSlotId: string;
  roomId: string;
  isLocked: boolean;
  courseStudentCount: number;
  courseRequiresGroundFloor: boolean;
  subjectCognitiveWeight: number;
  subjectRequiredEquipment: string | null;
}

interface RoomEvalInfo {
  name: string;
  roomType: RoomType;
  capacity: number;
  campus: string | null;
  floor: number;
  equipmentTags: string[];
}

function buildRoomMap(
  rooms: Array<{
    id: string;
    name: string;
    roomType: RoomType;
    capacity: number;
    campus: string | null;
    floor: number;
    equipmentTags: unknown;
  }>
): Map<string, RoomEvalInfo> {
  return new Map(
    rooms.map((r) => [
      r.id,
      {
        name: r.name,
        roomType: r.roomType,
        capacity: r.capacity,
        campus: r.campus,
        floor: r.floor,
        equipmentTags: Array.isArray(r.equipmentTags)
          ? r.equipmentTags.map((t) => String(t))
          : [],
      },
    ])
  );
}

function ruleMatchesTarget(
  rule: SchedulingRule,
  target: { teacherId?: string; subjectId?: string; courseId?: string }
): boolean {
  if (rule.targetEntityType === "GLOBAL") return true;
  if (rule.targetEntityType === "TEACHER" && target.teacherId) {
    return rule.targetEntityId === target.teacherId;
  }
  if (rule.targetEntityType === "SUBJECT" && target.subjectId) {
    return rule.targetEntityId === target.subjectId;
  }
  if (rule.targetEntityType === "COURSE" && target.courseId) {
    return rule.targetEntityId === target.courseId;
  }
  return false;
}

function pushRuleViolation(
  rule: SchedulingRule,
  hardConflicts: ScheduleConflict[],
  softViolations: ScheduleConflict[],
  conflict: Omit<ScheduleConflict, "severity" | "penalty">,
  defaultPenalty: number,
  penaltyMultiplier = 1
) {
  const severity = rule.weight === "HARD" ? "HARD" : "SOFT";
  const base = rule.penaltyScore > 0 ? rule.penaltyScore : defaultPenalty;
  const penalty = severity === "HARD" ? 100 : Math.round(base * penaltyMultiplier);
  const full: ScheduleConflict = { ...conflict, severity, penalty };
  if (severity === "HARD") hardConflicts.push(full);
  else softViolations.push(full);
}

interface UnavailabilityParams {
  unavailableDays?: number[];
  unavailableBlocks?: Array<{ day: number; block: number }>;
}

function getRuleParamNumber(rule: SchedulingRule, key: string, fallback: number): number {
  const params = (rule.parameters ?? {}) as Record<string, unknown>;
  const val = Number(params[key]);
  return Number.isFinite(val) ? val : fallback;
}

function getRoomAssignmentMode(rules: SchedulingRule[]): RoomAssignmentMode {
  const rule = rules.find((r) => r.ruleType === "ROOM_ASSIGNMENT_MODE");
  const mode = ((rule?.parameters ?? {}) as { mode?: string }).mode;
  if (
    mode === "FIXED_COURSE_STRICT" ||
    mode === "FIXED_COURSE_WITH_SPECIALS" ||
    mode === "BY_SUBJECT"
  ) {
    return mode;
  }
  // Por defecto: sala fija por curso + recintos especiales según configuración de cada asignatura
  return "FIXED_COURSE_WITH_SPECIALS";
}

function isTeacherUnavailable(
  teacherId: string,
  dayOfWeek: number,
  blockNumber: number,
  rules: SchedulingRule[]
): boolean {
  for (const rule of rules) {
    if (
      rule.ruleType === "TEACHER_UNAVAILABILITY" &&
      rule.targetEntityType === "TEACHER" &&
      rule.targetEntityId === teacherId
    ) {
      const params = (rule.parameters ?? {}) as UnavailabilityParams;
      if (params.unavailableDays?.includes(dayOfWeek)) return true;
      if (
        params.unavailableBlocks?.some(
          (b) => b.day === dayOfWeek && b.block === blockNumber
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Evalúa una lista de entradas en memoria contra todas las reglas HARD y SOFT.
 * Utilizado tanto por detectConflicts, simulateSwap como por el optimizador del solver.
 */
/** Lo que la configuración pide de un docente de apoyo en una asignatura (para auditar la versión). */
interface SupportExpectation {
  courseSubjectId: string;
  teacherId: string;
  teacherName: string;
  subjectName: string;
  courseName: string;
  /** Bloques semanales que debe acompañar. */
  expectedBlocks: number;
  /** De ellos, cuántos en Aula de Recursos. */
  expectedResourceBlocks: number;
}

function buildSupportExpectations(
  courses: Array<{
    name: string;
    courseSubjects: Array<{
      id: string;
      weeklyBlocks: number;
      subject: { name: string };
      teachers: Array<{
        teacherId: string;
        role: string;
        assignedBlocks: number | null;
        resourceRoomBlocks: number;
        teacher: { firstName: string; lastName: string };
      }>;
    }>;
  }>
): SupportExpectation[] {
  const out: SupportExpectation[] = [];
  for (const course of courses) {
    for (const cs of course.courseSubjects) {
      for (const t of cs.teachers) {
        const partial = isPartialSupportAssignment(t, cs.weeklyBlocks);
        const resource = t.role === "PIE_SUPPORT" ? t.resourceRoomBlocks : 0;
        if (!partial && resource <= 0) continue;
        out.push({
          courseSubjectId: cs.id,
          teacherId: t.teacherId,
          teacherName: `${t.teacher.firstName} ${t.teacher.lastName}`,
          subjectName: cs.subject.name,
          courseName: course.name,
          expectedBlocks: effectiveAssignedBlocks(t, cs.weeklyBlocks),
          expectedResourceBlocks: resource,
        });
      }
    }
  }
  return out;
}

/** Convierte las filas ScheduleEntryTeacher (o, en versiones antiguas, los docentes de la asignatura) a teacherIds/teacherRooms. */
function toInternalParticipants(e: {
  roomId: string;
  teachers?: Array<{ teacherId: string; roomId: string | null }>;
  courseSubject: { teachers: Array<{ teacherId: string }> };
}): Pick<InternalEntry, "teacherIds" | "teacherRooms"> {
  const participants = resolveEntryParticipants(e);
  const teacherRooms: Record<string, string> = {};
  for (const p of participants) {
    if (p.inOtherRoom) teacherRooms[p.teacherId] = p.roomId;
  }
  return { teacherIds: participants.map((p) => p.teacherId), teacherRooms };
}

interface TeacherEvalInfo {
  name: string;
  contractHours: number;
  maxDailyHours: number;
  maxTeachingBlocks: number;
  legalMaxTeachingBlocks: number;
  ratioLabel: string;
}

function evaluateScheduleState(
  entries: InternalEntry[],
  slotMap: Map<string, InternalSlot>,
  allClassSlotsByBell: Map<string, InternalSlot[]>,
  nonTeachingMap: Map<string, Array<{ teacherId: string; title: string }>>,
  teacherMap: Map<string, TeacherEvalInfo>,
  roomMap: Map<string, RoomEvalInfo>,
  rules: SchedulingRule[],
  lunchBlockByBell: Map<string, { beforeBlock: number; afterBlock: number }>,
  supportExpectations: SupportExpectation[] = []
): ConflictAuditResult {
  const hardConflicts: ScheduleConflict[] = [];
  const softViolations: ScheduleConflict[] = [];

  // Mapas de ocupación por (dayOfWeek, blockNumber) para detectar topones incluso entre jornadas distintas
  const teacherSlotUsage = new Map<string, InternalEntry[]>();
  const courseSlotUsage = new Map<string, InternalEntry[]>();
  const roomSlotUsage = new Map<string, InternalEntry[]>();

  // Agrupaciones auxiliares
  const teacherDayBlocks = new Map<string, number[]>();
  const teacherTotalBlocks = new Map<string, number>();
  const teacherSeenClassSlots = new Set<string>();
  const courseDayBlocks = new Map<string, Array<{ blockNumber: number; entryId: string; courseName: string }>>();
  const courseDaySubjectBlocks = new Map<string, Array<{ blockNumber: number; entryId: string }>>();
  const courseSubjectDays = new Map<string, Set<number>>();
  const teacherFirstLast = new Map<string, { first: number; last: number }>();

  const getEntryClassKey = (e: InternalEntry): string =>
    e.syncGroupCode ? `sync:${e.syncGroupCode}:${e.subjectId}` : `entry:${e.id}`;

  const allowCourseWindows = rules.some(
    (r) =>
      r.ruleType === "ALLOW_COURSE_WINDOWS" &&
      Boolean(((r.parameters ?? {}) as { enabled?: boolean }).enabled)
  );
  const roomAssignmentMode = getRoomAssignmentMode(rules);

  // Salas base participantes en cada grupo sincronizado (pueden rotar entre cursos paralelos del mismo sync)
  const syncGroupHomeRooms = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (entry.syncGroupCode && entry.defaultRoomId) {
      const set = syncGroupHomeRooms.get(entry.syncGroupCode) ?? new Set<string>();
      set.add(entry.defaultRoomId);
      syncGroupHomeRooms.set(entry.syncGroupCode, set);
    }
  }

  for (const entry of entries) {
    const slot = slotMap.get(entry.timeSlotId);
    if (!slot) continue;

    const timeKey = `${slot.dayOfWeek}:${slot.blockNumber}`;

    // 1. Ocupación de curso
    const cKey = `${entry.courseId}:${timeKey}`;
    const cArr = courseSlotUsage.get(cKey) ?? [];
    cArr.push(entry);
    courseSlotUsage.set(cKey, cArr);

    // 2. Ocupación de sala (sala del bloque + salas aparte de docentes de apoyo, ej. Aula de Recursos)
    const occupiedRoomIds = new Set<string>([entry.roomId]);
    for (const rid of Object.values(entry.teacherRooms ?? {})) occupiedRoomIds.add(rid);
    for (const rid of occupiedRoomIds) {
      const rKey = `${rid}:${timeKey}`;
      const rArr = roomSlotUsage.get(rKey) ?? [];
      rArr.push(entry);
      roomSlotUsage.set(rKey, rArr);
    }

    // 3. Ocupación de profesores (incluyendo codocentes y PIE)
    const entryClassKey = getEntryClassKey(entry);
    for (const teacherId of entry.teacherIds) {
      const tKey = `${teacherId}:${timeKey}`;
      const tArr = teacherSlotUsage.get(tKey) ?? [];
      tArr.push(entry);
      teacherSlotUsage.set(tKey, tArr);

      // Si es una clase combinada de un grupo sincronizado (mismo syncGroupCode + misma asignatura en varios cursos),
      // contar una sola vez por bloque para el docente y evitar alertas duplicadas.
      const teacherClassSlotKey = `${teacherId}:${timeKey}:${entryClassKey}`;
      if (teacherSeenClassSlots.has(teacherClassSlotKey)) continue;
      teacherSeenClassSlots.add(teacherClassSlotKey);

      teacherTotalBlocks.set(teacherId, (teacherTotalBlocks.get(teacherId) ?? 0) + 1);

      // Actividades no lectivas en el mismo slot
      const ntList = nonTeachingMap.get(entry.timeSlotId) ?? [];
      const ntConflict = ntList.find((nt) => nt.teacherId === teacherId);
      if (ntConflict) {
        const tInfo = teacherMap.get(teacherId);
        hardConflicts.push({
          id: `nt-${entry.id}-${teacherId}`,
          severity: "HARD",
          ruleType: "NON_TEACHING_OVERLAP",
          message: `Topón de ${tInfo?.name ?? "docente"} con actividad no lectiva "${ntConflict.title}" (Día ${slot.dayOfWeek}, Bloque ${slot.blockNumber}).`,
          penalty: 100,
          dayOfWeek: slot.dayOfWeek,
          blockNumber: slot.blockNumber,
          entryIds: [entry.id],
          entityIds: [teacherId],
        });
      }

      // Indisponibilidad horaria del docente
      if (isTeacherUnavailable(teacherId, slot.dayOfWeek, slot.blockNumber, rules)) {
        const tInfo = teacherMap.get(teacherId);
        hardConflicts.push({
          id: `unavail-${entry.id}-${teacherId}`,
          severity: "HARD",
          ruleType: "TEACHER_UNAVAILABILITY",
          message: `${tInfo?.name ?? "Docente"} no tiene disponibilidad en Día ${slot.dayOfWeek}, Bloque ${slot.blockNumber}.`,
          penalty: 100,
          dayOfWeek: slot.dayOfWeek,
          blockNumber: slot.blockNumber,
          entryIds: [entry.id],
          entityIds: [teacherId],
        });
      }

      const tdKey = `${teacherId}:${slot.dayOfWeek}`;
      const tdArr = teacherDayBlocks.get(tdKey) ?? [];
      tdArr.push(slot.blockNumber);
      teacherDayBlocks.set(tdKey, tdArr);

      // First / last block equity tracking
      const bellSlots = allClassSlotsByBell.get(slot.bellScheduleId) ?? [];
      const daySlots = bellSlots.filter((s) => s.dayOfWeek === slot.dayOfWeek);
      const minBlock = daySlots.length > 0 ? Math.min(...daySlots.map((s) => s.blockNumber)) : 1;
      const maxBlock = daySlots.length > 0 ? Math.max(...daySlots.map((s) => s.blockNumber)) : 8;
      const fl = teacherFirstLast.get(teacherId) ?? { first: 0, last: 0 };
      if (slot.blockNumber === minBlock) fl.first++;
      if (slot.blockNumber === maxBlock) fl.last++;
      teacherFirstLast.set(teacherId, fl);
    }

    // 4. Recinto requerido / Sala normal del curso (solo aplica si el modo no es sala fija estricta por curso)
    if (roomAssignmentMode !== "FIXED_COURSE_STRICT") {
      const room = roomMap.get(entry.roomId);
      if (entry.requiredRoomId) {
        if (entry.roomId !== entry.requiredRoomId) {
          const expectedRoom = roomMap.get(entry.requiredRoomId);
          softViolations.push({
            id: `reqroom-${entry.id}`,
            severity: "SOFT",
            ruleType: "SHARED_ROOM_CAPACITY",
            message: `${entry.subjectName} (${entry.courseName}) requiere la sala "${expectedRoom?.name ?? entry.requiredRoomId}", pero fue ubicada en "${room?.name ?? entry.roomId}" por disponibilidad.`,
            penalty: 40,
            dayOfWeek: slot.dayOfWeek,
            blockNumber: slot.blockNumber,
            entryIds: [entry.id],
          });
        }
      } else if (entry.requiresRoomType) {
        if (room && room.roomType !== entry.requiresRoomType) {
          softViolations.push({
            id: `roomtype-${entry.id}`,
            severity: "SOFT",
            ruleType: "SHARED_ROOM_CAPACITY",
            message: `${entry.subjectName} (${entry.courseName}) requiere recinto tipo ${ROOM_TYPE_LABELS[entry.requiresRoomType]}, pero fue ubicada en "${room.name}" por disponibilidad.`,
            penalty: 40,
            dayOfWeek: slot.dayOfWeek,
            blockNumber: slot.blockNumber,
            entryIds: [entry.id],
          });
        }
      } else if (entry.defaultRoomId && entry.roomId !== entry.defaultRoomId) {
        const isParallelSyncRoom = Boolean(
          entry.syncGroupCode && syncGroupHomeRooms.get(entry.syncGroupCode)?.has(entry.roomId)
        );
        if (!isParallelSyncRoom) {
          const defRoom = roomMap.get(entry.defaultRoomId);
          softViolations.push({
            id: `homeroom-${entry.id}`,
            severity: "SOFT",
            ruleType: "ROOM_ASSIGNMENT_MODE",
            message: `${entry.subjectName} (${entry.courseName}) usa "Sala normal del curso" (${defRoom?.name ?? "sala base"}), pero fue ubicada en "${room?.name ?? entry.roomId}" por falta de disponibilidad.`,
            penalty: 35,
            dayOfWeek: slot.dayOfWeek,
            blockNumber: slot.blockNumber,
            entryIds: [entry.id],
          });
        }
      }
    }

    const cdKey = `${entry.courseId}:${slot.dayOfWeek}`;
    const cdArr = courseDayBlocks.get(cdKey) ?? [];
    cdArr.push({ blockNumber: slot.blockNumber, entryId: entry.id, courseName: entry.courseName });
    courseDayBlocks.set(cdKey, cdArr);

    const cdsKey = `${entry.courseId}:${slot.dayOfWeek}:${entry.subjectId}`;
    const cdsArr = courseDaySubjectBlocks.get(cdsKey) ?? [];
    cdsArr.push({ blockNumber: slot.blockNumber, entryId: entry.id });
    courseDaySubjectBlocks.set(cdsKey, cdsArr);

    const csDays = courseSubjectDays.get(entry.courseSubjectId) ?? new Set<number>();
    csDays.add(slot.dayOfWeek);
    courseSubjectDays.set(entry.courseSubjectId, csDays);
  }

  // Verificar topones de curso
  for (const [, list] of courseSlotUsage) {
    if (list.length > 1) {
      // Permitir solo si todos pertenecen a un desdoblamiento/syncGroupCode idéntico
      const allSameSync =
        list[0].syncGroupCode &&
        list.every((e) => e.syncGroupCode === list[0].syncGroupCode);
      if (!allSameSync) {
        const slot = slotMap.get(list[0].timeSlotId);
        hardConflicts.push({
          id: `course-clash-${list.map((e) => e.id).join("-")}`,
          severity: "HARD",
          ruleType: "COURSE_DOUBLE_BOOKING",
          message: `Topón en curso ${list[0].courseName} (Día ${slot?.dayOfWeek}, Bloque ${slot?.blockNumber}): ${list.map((e) => e.subjectName).join(" vs ")}.`,
          penalty: 100,
          dayOfWeek: slot?.dayOfWeek,
          blockNumber: slot?.blockNumber,
          entryIds: list.map((e) => e.id),
        });
      }
    }
  }

  // Verificar topones de profesores (agrupando clases combinadas del mismo grupo sincronizado y asignatura)
  for (const [key, list] of teacherSlotUsage) {
    if (list.length > 1) {
      const distinctClasses = new Map<string, InternalEntry[]>();
      for (const e of list) {
        const cKey = getEntryClassKey(e);
        const arr = distinctClasses.get(cKey) ?? [];
        arr.push(e);
        distinctClasses.set(cKey, arr);
      }
      if (distinctClasses.size > 1) {
        const teacherId = key.split(":")[0];
        const tInfo = teacherMap.get(teacherId);
        const slot = slotMap.get(list[0].timeSlotId);
        const classLabels = Array.from(distinctClasses.values()).map((group) => {
          const courses = Array.from(new Set(group.map((e) => e.courseName))).join("/");
          return `${group[0].subjectCode} ${courses}`;
        });
        hardConflicts.push({
          id: `teacher-clash-${key}`,
          severity: "HARD",
          ruleType: "TEACHER_DOUBLE_BOOKING",
          message: `Topón de docente ${tInfo?.name ?? teacherId} (Día ${slot?.dayOfWeek}, Bloque ${slot?.blockNumber}): ${classLabels.join(" y ")}.`,
          penalty: 100,
          dayOfWeek: slot?.dayOfWeek,
          blockNumber: slot?.blockNumber,
          entryIds: list.map((e) => e.id),
          entityIds: [teacherId],
        });
      }
    }
  }

  // Verificar tope semanal docente y Ley 20.903 (65/35 o 60/40) sobre el horario programado
  const leyPolicy = extractLey20903Policy(rules);
  for (const [teacherId, totalBlocks] of teacherTotalBlocks) {
    const tInfo = teacherMap.get(teacherId);
    if (!tInfo) continue;
    if (totalBlocks > tInfo.maxTeachingBlocks) {
      hardConflicts.push({
        id: `teacher-maxblocks-${teacherId}`,
        severity: "HARD",
        ruleType: "TEACHER_OVER_MAX_BLOCKS",
        message: `${tInfo.name} tiene ${totalBlocks} bloques lectivos programados, superando su tope configurado (${tInfo.maxTeachingBlocks}).`,
        penalty: 100,
        entryIds: [],
        entityIds: [teacherId],
      });
    } else if (totalBlocks > tInfo.legalMaxTeachingBlocks) {
      const msg = `${tInfo.name} tiene ${totalBlocks} bloques lectivos programados; el tope legal Ley 20.903 (${tInfo.ratioLabel}) para ${tInfo.contractHours}h es ${tInfo.legalMaxTeachingBlocks} bloques.`;
      if (leyPolicy.strictEnforcement) {
        hardConflicts.push({
          id: `ley20903-hard-${teacherId}`,
          severity: "HARD",
          ruleType: "LEY_20903_POLICY",
          message: msg,
          penalty: 100,
          entryIds: [],
          entityIds: [teacherId],
        });
      } else {
        softViolations.push({
          id: `ley20903-soft-${teacherId}`,
          severity: "SOFT",
          ruleType: "LEY_20903_POLICY",
          message: msg,
          penalty: 25,
          entryIds: [],
          entityIds: [teacherId],
        });
      }
    }
  }

  // Verificar topones de salas (agrupando clases combinadas del mismo grupo sincronizado y asignatura)
  for (const [key, list] of roomSlotUsage) {
    if (list.length > 1) {
      const distinctClasses = new Map<string, InternalEntry[]>();
      for (const e of list) {
        const cKey = getEntryClassKey(e);
        const arr = distinctClasses.get(cKey) ?? [];
        arr.push(e);
        distinctClasses.set(cKey, arr);
      }
      if (distinctClasses.size > 1) {
        const roomId = key.split(":")[0];
        const rInfo = roomMap.get(roomId);
        const slot = slotMap.get(list[0].timeSlotId);
        const classLabels = Array.from(distinctClasses.values()).map((group) => {
          const courses = Array.from(new Set(group.map((e) => e.courseName))).join("/");
          return group[0].syncGroupCode
            ? `${group[0].subjectCode} (${courses})`
            : courses;
        });
        hardConflicts.push({
          id: `room-clash-${key}`,
          severity: "HARD",
          ruleType: "SHARED_ROOM_CAPACITY",
          message: `Topón de sala "${rInfo?.name ?? roomId}" (Día ${slot?.dayOfWeek}, Bloque ${slot?.blockNumber}): ${classLabels.join(" y ")}.`,
          penalty: 100,
          dayOfWeek: slot?.dayOfWeek,
          blockNumber: slot?.blockNumber,
          entryIds: list.map((e) => e.id),
        });
      }
    }
  }

  // Reglas blandas y límites diarios docentes (consecutivos + tope diario; ventanas docentes no descuentan por defecto)
  const windowRule = rules.find((r) => r.ruleType === "MAX_TEACHER_WINDOWS");
  const windowPenalty = windowRule ? windowRule.penaltyScore : 0;
  const maxAllowedWindows = windowRule ? getRuleParamNumber(windowRule, "max", 0) : 0;
  const maxConsRule = rules.find((r) => r.ruleType === "MAX_CONSECUTIVE_TEACHER_BLOCKS");
  const maxConsLimit = maxConsRule ? getRuleParamNumber(maxConsRule, "max", 4) : 4;
  const maxConsPenalty = maxConsRule ? maxConsRule.penaltyScore : 25;

  for (const [key, blocks] of teacherDayBlocks) {
    const [teacherId, dayStr] = key.split(":");
    const day = Number(dayStr);
    const sorted = [...new Set(blocks)].sort((a, b) => a - b);
    const tInfo = teacherMap.get(teacherId);

    if (tInfo && sorted.length > tInfo.maxDailyHours) {
      hardConflicts.push({
        id: `max-daily-${key}`,
        severity: "HARD",
        ruleType: "TEACHER_MAX_DAILY_HOURS",
        message: `${tInfo.name} supera su tope diario (${sorted.length}/${tInfo.maxDailyHours} bloques) el Día ${day}.`,
        penalty: 60,
        dayOfWeek: day,
        entryIds: [],
        entityIds: [teacherId],
      });
    }

    // Ventanas libres en profesores: solo descuentan puntaje si el admin habilitó explícitamente penalización > 0
    if (sorted.length >= 2) {
      if (windowRule && windowPenalty > 0) {
        const span = sorted[sorted.length - 1] - sorted[0] + 1;
        const windows = span - sorted.length;
        if (windows > maxAllowedWindows) {
          const excess = windows - maxAllowedWindows;
          softViolations.push({
            id: `windows-${key}`,
            severity: "SOFT",
            ruleType: "MAX_TEACHER_WINDOWS",
            message: `${tInfo?.name ?? "Docente"} tiene ${windows} ventana(s) el Día ${day} (máximo ${maxAllowedWindows}).`,
            penalty: excess * windowPenalty,
            dayOfWeek: day,
            entryIds: [],
            entityIds: [teacherId],
          });
        }
      }

      // Bloques consecutivos
      let run = 1;
      let maxRun = 1;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === sorted[i - 1] + 1) {
          run++;
          if (run > maxRun) maxRun = run;
        } else {
          run = 1;
        }
      }
      if (maxRun > maxConsLimit) {
        softViolations.push({
          id: `cons-${key}`,
          severity: "SOFT",
          ruleType: "MAX_CONSECUTIVE_TEACHER_BLOCKS",
          message: `${tInfo?.name ?? "Docente"} tiene ${maxRun} bloques consecutivos el Día ${day} (límite ${maxConsLimit}).`,
          penalty: (maxRun - maxConsLimit) * maxConsPenalty,
          dayOfWeek: day,
          entryIds: [],
          entityIds: [teacherId],
        });
      }
    }
  }

  // Regla: Franjas horarias prioritarias por asignatura (mañana/tarde)
  const timeRangeRules = rules.filter((r) => r.ruleType === "SUBJECT_PREFERRED_TIME_RANGE");
  for (const rule of timeRangeRules) {
    const params = (rule.parameters ?? {}) as { period?: string; maxBlock?: number; minBlock?: number };
    const period = params.period ?? "MORNING";
    for (const entry of entries) {
      if (rule.targetEntityType === "SUBJECT" && rule.targetEntityId !== entry.subjectId) {
        continue;
      }
      const slot = slotMap.get(entry.timeSlotId);
      if (!slot) continue;
      const violated =
        (period === "MORNING" && slot.blockNumber > (params.maxBlock ?? 4)) ||
        (period === "AFTERNOON" && slot.blockNumber < (params.minBlock ?? 5));
      if (violated) {
        softViolations.push({
          id: `pref-time-${rule.id}-${entry.id}`,
          severity: "SOFT",
          ruleType: "SUBJECT_PREFERRED_TIME_RANGE",
          message: `${entry.subjectName} en ${entry.courseName} está fuera de su franja preferida (${period === "MORNING" ? "Mañana" : "Tarde"}) en Día ${slot.dayOfWeek}, Bloque ${slot.blockNumber}.`,
          penalty: rule.penaltyScore,
          dayOfWeek: slot.dayOfWeek,
          blockNumber: slot.blockNumber,
          entryIds: [entry.id],
        });
      }
    }
  }

  // Regla HARD por defecto: Sin ventanas (espacios en blanco entre clases) en cursos, salvo que el admin habilite ALLOW_COURSE_WINDOWS
  if (!allowCourseWindows) {
    for (const [key, items] of courseDayBlocks) {
      const [, dayStr] = key.split(":");
      const day = Number(dayStr);
      const uniqueBlocks = [...new Set(items.map((i) => i.blockNumber))].sort((a, b) => a - b);
      if (uniqueBlocks.length === 0) continue;

      const maxBlock = uniqueBlocks[uniqueBlocks.length - 1];
      const presentSet = new Set(uniqueBlocks);
      const missing: number[] = [];
      for (let b = 1; b < maxBlock; b++) {
        if (!presentSet.has(b)) missing.push(b);
      }

      if (missing.length > 0) {
        const firstGap = missing[0];
        const affectedEntryIds = items
          .filter((i) => i.blockNumber > firstGap)
          .map((i) => i.entryId);
        hardConflicts.push({
          id: `course-window-${key}`,
          severity: "HARD",
          ruleType: "COURSE_WINDOW",
          message: `${items[0].courseName} tiene ventana(s) en bloque(s) ${missing.join(", ")} el Día ${day} (no se permiten espacios libres entre clases).`,
          penalty: 100 * missing.length,
          dayOfWeek: day,
          blockNumber: firstGap,
          entryIds: affectedEntryIds,
        });
      }
    }
  }

  // Regla: Máximo bloques diarios por asignatura + bloques de la misma asignatura en el mismo día SIEMPRE consecutivos + no repetir antes/después de almuerzo
  const maxDailySubjRule = rules.find((r) => r.ruleType === "MAX_DAILY_BLOCKS_PER_SUBJECT");
  const maxDailySubjLimit = maxDailySubjRule ? getRuleParamNumber(maxDailySubjRule, "max", 2) : 2;
  const lunchRule = rules.find((r) => r.ruleType === "NO_SAME_SUBJECT_AROUND_LUNCH");

  for (const [key, blockItems] of courseDaySubjectBlocks) {
    const [courseId, dayStr, subjectId] = key.split(":");
    const sample = entries.find(
      (e) => e.courseId === courseId && e.subjectId === subjectId
    );
    if (!sample) continue;
    const slot = slotMap.get(sample.timeSlotId);
    const blocks = [...new Set(blockItems.map((b) => b.blockNumber))].sort((a, b) => a - b);
    const entryIdsForSubjDay = blockItems.map((b) => b.entryId);

    // Si una asignatura se dicta más de una vez el mismo día, los bloques deben ser consecutivos
    if (blocks.length >= 2) {
      let isContiguous = true;
      for (let i = 1; i < blocks.length; i++) {
        if (blocks[i] !== blocks[i - 1] + 1) {
          isContiguous = false;
          break;
        }
      }
      if (!isContiguous) {
        hardConflicts.push({
          id: `split-subj-day-${key}`,
          severity: "HARD",
          ruleType: "SAME_DAY_SUBJECT_NON_CONSECUTIVE",
          message: `${sample.courseName} tiene bloques separados de ${sample.subjectName} el Día ${dayStr} (Bloques ${blocks.join(", ")}): deben ser consecutivos.`,
          penalty: 90,
          dayOfWeek: Number(dayStr),
          entryIds: entryIdsForSubjDay,
        });
      }
    }

    if (blocks.length > maxDailySubjLimit) {
      const severity = maxDailySubjRule?.weight === "HARD" ? "HARD" : "SOFT";
      const targetList = severity === "HARD" ? hardConflicts : softViolations;
      targetList.push({
        id: `max-subj-day-${key}`,
        severity,
        ruleType: "MAX_DAILY_BLOCKS_PER_SUBJECT",
        message: `${sample.courseName} tiene ${blocks.length} bloques de ${sample.subjectName} el Día ${dayStr} (máximo ${maxDailySubjLimit}).`,
        penalty: (blocks.length - maxDailySubjLimit) * (maxDailySubjRule?.penaltyScore ?? 20),
        dayOfWeek: Number(dayStr),
        entryIds: entryIdsForSubjDay,
      });
    }

    if (lunchRule && slot) {
      const lunchInfo = lunchBlockByBell.get(slot.bellScheduleId);
      if (
        lunchInfo &&
        blocks.includes(lunchInfo.beforeBlock) &&
        blocks.includes(lunchInfo.afterBlock)
      ) {
        softViolations.push({
          id: `lunch-repeat-${key}`,
          severity: "SOFT",
          ruleType: "NO_SAME_SUBJECT_AROUND_LUNCH",
          message: `${sample.courseName} repite ${sample.subjectName} justo antes y después de almuerzo (Día ${dayStr}).`,
          penalty: lunchRule.penaltyScore,
          dayOfWeek: Number(dayStr),
          entryIds: entryIdsForSubjDay,
        });
      }
    }
  }

  // Regla: Priorizar pair_group_id para cualquier par consecutivo del mismo curso y asignatura
  const pairRule = rules.find((r) => r.ruleType === "PRIORITIZE_PAIR_GROUPS");
  if (pairRule) {
    const byCourseSubjectDay = new Map<string, InternalSlot[]>();
    for (const entry of entries) {
      const slot = slotMap.get(entry.timeSlotId);
      if (!slot) continue;
      const k = `${entry.courseSubjectId}:${slot.dayOfWeek}`;
      const arr = byCourseSubjectDay.get(k) ?? [];
      arr.push(slot);
      byCourseSubjectDay.set(k, arr);
    }
    for (const [k, slots] of byCourseSubjectDay) {
      if (slots.length === 2) {
        const [a, b] = slots.sort((x, y) => x.blockNumber - y.blockNumber);
        if (b.blockNumber === a.blockNumber + 1 && (a.pairGroupId === null || a.pairGroupId !== b.pairGroupId)) {
          softViolations.push({
            id: `pair-split-${k}`,
            severity: "SOFT",
            ruleType: "PRIORITIZE_PAIR_GROUPS",
            message: `Bloque doble separado por recreo/almuerzo en Día ${a.dayOfWeek} (Bloques ${a.blockNumber} y ${b.blockNumber}).`,
            penalty: pairRule.penaltyScore,
            dayOfWeek: a.dayOfWeek,
            entryIds: [],
          });
        }
      }
    }
  }

  // Regla: Equidad en primera y última hora
  const equityRule = rules.find((r) => r.ruleType === "FIRST_LAST_BLOCK_EQUITY");
  if (equityRule) {
    for (const [teacherId, counts] of teacherFirstLast) {
      if (counts.first >= 4 || counts.last >= 4) {
        const tInfo = teacherMap.get(teacherId);
        softViolations.push({
          id: `equity-${teacherId}`,
          severity: "SOFT",
          ruleType: "FIRST_LAST_BLOCK_EQUITY",
          message: `${tInfo?.name ?? "Docente"} concentra ${counts.first} primeras horas y ${counts.last} últimas horas en la semana.`,
          penalty: equityRule.penaltyScore,
          entryIds: [],
          entityIds: [teacherId],
        });
      }
    }
  }

  // =========================================================================
  // REGLAS ADICIONALES [DOCENTE], [PEDAGOGICA] E [INFRAESTRUCTURA]
  // =========================================================================

  // Pre-cómputo de días activos docentes y bloques por día con roomId/bellScheduleId
  const teacherDaysActive = new Map<string, Set<number>>();
  const teacherDayRoomEntries = new Map<
    string,
    Array<{ blockNumber: number; roomId: string; bellScheduleId: string; entryId: string }>
  >();
  const courseDayRoomEntries = new Map<
    string,
    Array<{ blockNumber: number; roomId: string; courseName: string; entryId: string }>
  >();
  const courseDayCognitiveLoad = new Map<string, { load: number; courseName: string }>();
  const csDayEntries = new Map<string, Array<{ blockNumber: number; entryId: string }>>();
  const csTotalCounts = new Map<string, number>();
  const csSample = new Map<string, InternalEntry>();

  for (const entry of entries) {
    const slot = slotMap.get(entry.timeSlotId);
    if (!slot) continue;

    csTotalCounts.set(entry.courseSubjectId, (csTotalCounts.get(entry.courseSubjectId) ?? 0) + 1);
    if (!csSample.has(entry.courseSubjectId)) csSample.set(entry.courseSubjectId, entry);

    const csDayKey = `${entry.courseSubjectId}:${slot.dayOfWeek}`;
    const csDayArr = csDayEntries.get(csDayKey) ?? [];
    csDayArr.push({ blockNumber: slot.blockNumber, entryId: entry.id });
    csDayEntries.set(csDayKey, csDayArr);

    const cDayKey = `${entry.courseId}:${slot.dayOfWeek}`;
    const cRoomArr = courseDayRoomEntries.get(cDayKey) ?? [];
    cRoomArr.push({
      blockNumber: slot.blockNumber,
      roomId: entry.roomId,
      courseName: entry.courseName,
      entryId: entry.id,
    });
    courseDayRoomEntries.set(cDayKey, cRoomArr);

    const prevLoad = courseDayCognitiveLoad.get(cDayKey) ?? {
      load: 0,
      courseName: entry.courseName,
    };
    prevLoad.load += entry.subjectCognitiveWeight;
    courseDayCognitiveLoad.set(cDayKey, prevLoad);

    for (const tid of entry.teacherIds) {
      const daysSet = teacherDaysActive.get(tid) ?? new Set<number>();
      daysSet.add(slot.dayOfWeek);
      teacherDaysActive.set(tid, daysSet);

      const tdKey = `${tid}:${slot.dayOfWeek}`;
      const tdRoomArr = teacherDayRoomEntries.get(tdKey) ?? [];
      tdRoomArr.push({
        blockNumber: slot.blockNumber,
        roomId: entry.teacherRooms?.[tid] ?? entry.roomId,
        bellScheduleId: slot.bellScheduleId,
        entryId: entry.id,
      });
      teacherDayRoomEntries.set(tdKey, tdRoomArr);
    }
  }

  // Mapa rápido de actividades no lectivas por (teacherId, day, block)
  const nonTeachingTeacherTime = new Set<string>();
  for (const [slotId, ntList] of nonTeachingMap) {
    const slot = slotMap.get(slotId);
    if (!slot) continue;
    for (const nt of ntList) {
      nonTeachingTeacherTime.add(`${nt.teacherId}:${slot.dayOfWeek}:${slot.blockNumber}`);
    }
  }

  // [DOCENTE] 1. Compactación de días docentes (TEACHER_DAY_COMPACTNESS)
  for (const rule of rules.filter((r) => r.ruleType === "TEACHER_DAY_COMPACTNESS")) {
    const maxDaysParam = getRuleParamNumber(rule, "maxDays", 0);
    for (const [teacherId, daysSet] of teacherDaysActive) {
      if (!ruleMatchesTarget(rule, { teacherId })) continue;
      const tInfo = teacherMap.get(teacherId);
      const totalBlocks = teacherTotalBlocks.get(teacherId) ?? 0;
      if (daysSet.size === 0 || totalBlocks === 0) continue;
      const effectiveMaxDays =
        maxDaysParam > 0
          ? maxDaysParam
          : Math.max(1, Math.ceil(totalBlocks / Math.max(1, tInfo?.maxDailyHours ?? 7)));
      if (daysSet.size > effectiveMaxDays) {
        pushRuleViolation(
          rule,
          hardConflicts,
          softViolations,
          {
            id: `day-compact-${rule.id}-${teacherId}`,
            ruleType: "TEACHER_DAY_COMPACTNESS",
            message: `${tInfo?.name ?? "Docente"} asiste ${daysSet.size} días a la semana (máximo esperado: ${effectiveMaxDays} días para ${totalBlocks} bloques).`,
            entryIds: [],
            entityIds: [teacherId],
          },
          35,
          daysSet.size - effectiveMaxDays
        );
      }
    }
  }

  // [DOCENTE] 2. Mínimo y máximo de bloques diarios por docente (TEACHER_DAILY_BLOCKS_LIMIT)
  for (const rule of rules.filter((r) => r.ruleType === "TEACHER_DAILY_BLOCKS_LIMIT")) {
    const minDaily = getRuleParamNumber(rule, "min", 2);
    const maxDaily = getRuleParamNumber(rule, "max", 7);
    for (const [key, blocks] of teacherDayBlocks) {
      const [teacherId, dayStr] = key.split(":");
      if (!ruleMatchesTarget(rule, { teacherId })) continue;
      const uniqueCount = new Set(blocks).size;
      if (uniqueCount === 0) continue;
      const tInfo = teacherMap.get(teacherId);
      if (uniqueCount < minDaily || uniqueCount > maxDaily) {
        pushRuleViolation(
          rule,
          hardConflicts,
          softViolations,
          {
            id: `daily-limit-${rule.id}-${key}`,
            ruleType: "TEACHER_DAILY_BLOCKS_LIMIT",
            message: `${tInfo?.name ?? "Docente"} tiene ${uniqueCount} bloque(s) el Día ${dayStr} (rango permitido: ${minDaily} a ${maxDaily}).`,
            dayOfWeek: Number(dayStr),
            entryIds: [],
            entityIds: [teacherId],
          },
          25
        );
      }
    }
  }

  // [DOCENTE] 3. Ventana de colación/almuerzo garantizada (TEACHER_GUARANTEED_LUNCH_BREAK)
  for (const rule of rules.filter((r) => r.ruleType === "TEACHER_GUARANTEED_LUNCH_BREAK")) {
    const startBlock = getRuleParamNumber(rule, "startBlock", 4);
    const endBlock = getRuleParamNumber(rule, "endBlock", 6);
    const minFreeBlocks = getRuleParamNumber(rule, "minFreeBlocks", 1);
    const windowSize = Math.max(1, endBlock - startBlock + 1);

    for (const [key, blocks] of teacherDayBlocks) {
      const [teacherId, dayStr] = key.split(":");
      const day = Number(dayStr);
      if (!ruleMatchesTarget(rule, { teacherId })) continue;
      const sorted = [...new Set(blocks)].sort((a, b) => a - b);
      if (sorted.length === 0) continue;
      // Solo exigir colación si la jornada del docente cruza la franja de almuerzo
      if (sorted[0] <= startBlock && sorted[sorted.length - 1] >= endBlock) {
        let busyInWindow = 0;
        for (let b = startBlock; b <= endBlock; b++) {
          if (
            sorted.includes(b) ||
            nonTeachingTeacherTime.has(`${teacherId}:${day}:${b}`)
          ) {
            busyInWindow++;
          }
        }
        const freeInWindow = Math.max(0, windowSize - busyInWindow);
        if (freeInWindow < minFreeBlocks) {
          const tInfo = teacherMap.get(teacherId);
          pushRuleViolation(
            rule,
            hardConflicts,
            softViolations,
            {
              id: `lunch-break-${rule.id}-${key}`,
              ruleType: "TEACHER_GUARANTEED_LUNCH_BREAK",
              message: `${tInfo?.name ?? "Docente"} no tiene ventana de colación el Día ${day} (${freeInWindow}/${minFreeBlocks} bloques libres entre bloques ${startBlock} y ${endBlock}).`,
              dayOfWeek: day,
              entryIds: [],
              entityIds: [teacherId],
            },
            100
          );
        }
      }
    }
  }

  // [DOCENTE] 4. Reuniones / horas no lectivas sincronizadas (SYNCED_DEPARTMENT_MEETING)
  const uniqueDayBlocks = new Set<string>();
  for (const slots of allClassSlotsByBell.values()) {
    for (const s of slots) {
      uniqueDayBlocks.add(`${s.dayOfWeek}:${s.blockNumber}`);
    }
  }
  for (const rule of rules.filter((r) => r.ruleType === "SYNCED_DEPARTMENT_MEETING")) {
    const params = (rule.parameters ?? {}) as {
      label?: string;
      teacherIds?: string[];
      requiredFreeBlocks?: number;
      preferredDay?: number;
    };
    const targetTeachers = Array.isArray(params.teacherIds) ? params.teacherIds : [];
    const requiredFree = Math.max(1, Number(params.requiredFreeBlocks ?? 1));
    if (targetTeachers.length < 2) continue;

    let commonFreeCount = 0;
    for (const dbKey of uniqueDayBlocks) {
      const [dStr, bStr] = dbKey.split(":");
      const day = Number(dStr);
      const block = Number(bStr);
      if (params.preferredDay && day !== Number(params.preferredDay)) continue;
      const allFree = targetTeachers.every(
        (tid) =>
          !teacherSlotUsage.has(`${tid}:${day}:${block}`) &&
          !nonTeachingTeacherTime.has(`${tid}:${day}:${block}`) &&
          !isTeacherUnavailable(tid, day, block, rules)
      );
      if (allFree) commonFreeCount++;
    }

    if (commonFreeCount < requiredFree) {
      pushRuleViolation(
        rule,
        hardConflicts,
        softViolations,
        {
          id: `dept-meeting-${rule.id}`,
          ruleType: "SYNCED_DEPARTMENT_MEETING",
          message: `Reunión "${params.label || "Departamento"}": solo ${commonFreeCount}/${requiredFree} bloque(s) semanal(es) libre(s) simultáneamente para ${targetTeachers.length} docentes.`,
          entryIds: [],
          entityIds: targetTeachers,
        },
        100
      );
    }
  }

  // [DOCENTE] 5. Traslado entre sedes o anexos (TEACHER_CAMPUS_TRAVEL)
  for (const rule of rules.filter((r) => r.ruleType === "TEACHER_CAMPUS_TRAVEL")) {
    const minGapBlocks = getRuleParamNumber(rule, "minGapBlocks", 1);
    for (const [key, list] of teacherDayRoomEntries) {
      const [teacherId, dayStr] = key.split(":");
      const day = Number(dayStr);
      if (!ruleMatchesTarget(rule, { teacherId })) continue;
      const sorted = [...list].sort((a, b) => a.blockNumber - b.blockNumber);
      const tInfo = teacherMap.get(teacherId);
      for (let i = 0; i < sorted.length - 1; i++) {
        const curr = sorted[i];
        const next = sorted[i + 1];
        const campusA = roomMap.get(curr.roomId)?.campus?.trim() || null;
        const campusB = roomMap.get(next.roomId)?.campus?.trim() || null;
        if (campusA && campusB && campusA.toLowerCase() !== campusB.toLowerCase()) {
          const gap = next.blockNumber - curr.blockNumber - 1;
          const lunchInfo = lunchBlockByBell.get(curr.bellScheduleId);
          const crossedLunch = Boolean(
            lunchInfo &&
              curr.blockNumber <= lunchInfo.beforeBlock &&
              next.blockNumber >= lunchInfo.afterBlock
          );
          if (gap < minGapBlocks && !crossedLunch) {
            pushRuleViolation(
              rule,
              hardConflicts,
              softViolations,
              {
                id: `campus-travel-${rule.id}-${key}-${curr.blockNumber}`,
                ruleType: "TEACHER_CAMPUS_TRAVEL",
                message: `${tInfo?.name ?? "Docente"} cambia de sede (${campusA} → ${campusB}) entre bloques ${curr.blockNumber} y ${next.blockNumber} el Día ${day} sin tiempo de traslado.`,
                dayOfWeek: day,
                blockNumber: next.blockNumber,
                entryIds: [curr.entryId, next.entryId],
                entityIds: [teacherId],
              },
              100
            );
          }
        }
      }
    }
  }

  // [PEDAGOGICA] 6. Bloques extendidos (EXTENDED_BLOCKS_POLICY)
  for (const rule of rules.filter((r) => r.ruleType === "EXTENDED_BLOCKS_POLICY")) {
    const blockSize = Math.max(2, getRuleParamNumber(rule, "blockSize", 3));
    const daysByCS = new Map<string, Array<{ day: number; blocks: number[]; entryIds: string[] }>>();
    for (const [csDayKey, items] of csDayEntries) {
      const [csId, dayStr] = csDayKey.split(":");
      const arr = daysByCS.get(csId) ?? [];
      arr.push({
        day: Number(dayStr),
        blocks: items.map((i) => i.blockNumber).sort((a, b) => a - b),
        entryIds: items.map((i) => i.entryId),
      });
      daysByCS.set(csId, arr);
    }
    for (const [csId, dayList] of daysByCS) {
      const sample = csSample.get(csId);
      if (!sample || !ruleMatchesTarget(rule, { subjectId: sample.subjectId, courseId: sample.courseId })) {
        continue;
      }
      const totalWeekly = csTotalCounts.get(csId) ?? 0;
      if (totalWeekly < blockSize) continue;
      const remainder = totalWeekly % blockSize;
      let remainderAllowedUsed = false;
      for (const d of dayList) {
        if (d.blocks.length < blockSize) {
          if (remainder > 0 && d.blocks.length === remainder && !remainderAllowedUsed) {
            remainderAllowedUsed = true;
            continue;
          }
          pushRuleViolation(
            rule,
            hardConflicts,
            softViolations,
            {
              id: `extended-${rule.id}-${csId}-${d.day}`,
              ruleType: "EXTENDED_BLOCKS_POLICY",
              message: `${sample.courseName} - ${sample.subjectName} tiene ${d.blocks.length} bloque(s) el Día ${d.day}; la política exige bloques extendidos de ${blockSize}.`,
              dayOfWeek: d.day,
              entryIds: d.entryIds,
            },
            90
          );
        }
      }
    }
  }

  // [PEDAGOGICA] 7. Bloques fijos / anclados (FIXED_SUBJECT_SLOT)
  for (const rule of rules.filter((r) => r.ruleType === "FIXED_SUBJECT_SLOT")) {
    const params = (rule.parameters ?? {}) as {
      dayOfWeek?: number;
      blockNumber?: number;
      courseId?: string;
    };
    const targetDay = Number(params.dayOfWeek ?? 1);
    const targetBlock = Number(params.blockNumber ?? 1);
    const byCourse = new Map<string, InternalEntry[]>();
    for (const e of entries) {
      if (!ruleMatchesTarget(rule, { subjectId: e.subjectId, courseId: e.courseId })) continue;
      if (params.courseId && e.courseId !== params.courseId) continue;
      const arr = byCourse.get(e.courseId) ?? [];
      arr.push(e);
      byCourse.set(e.courseId, arr);
    }
    for (const [, list] of byCourse) {
      const hasPinned = list.some((e) => {
        const s = slotMap.get(e.timeSlotId);
        return s && s.dayOfWeek === targetDay && s.blockNumber === targetBlock;
      });
      if (!hasPinned) {
        pushRuleViolation(
          rule,
          hardConflicts,
          softViolations,
          {
            id: `fixed-slot-${rule.id}-${list[0].courseId}`,
            ruleType: "FIXED_SUBJECT_SLOT",
            message: `${list[0].courseName} - ${list[0].subjectName} debe estar anclado en Día ${targetDay}, Bloque ${targetBlock}.`,
            dayOfWeek: targetDay,
            blockNumber: targetBlock,
            entryIds: list.map((e) => e.id),
          },
          100
        );
      }
    }
  }

  // [ESPECIAL] Bloques fijos / anclados por grupo sincronizado (FIXED_SYNC_GROUP_SLOT - siempre HARD)
  for (const rule of rules.filter((r) => r.ruleType === "FIXED_SYNC_GROUP_SLOT")) {
    const params = (rule.parameters ?? {}) as {
      syncGroupCode?: string;
      dayOfWeek?: number;
      blockNumber?: number;
      blockNumbers?: number[];
    };
    const syncCode = typeof params.syncGroupCode === "string" ? params.syncGroupCode.trim() : "";
    if (!syncCode) continue;
    const targetDay = Number(params.dayOfWeek ?? 1);
    const rawBlocks =
      Array.isArray(params.blockNumbers) && params.blockNumbers.length > 0
        ? params.blockNumbers
        : params.blockNumber !== undefined
          ? [params.blockNumber]
          : [1];
    const targetBlocks = [...new Set(rawBlocks.map(Number).filter((n) => Number.isInteger(n) && n >= 1))].sort(
      (a, b) => a - b
    );

    const groupEntries = entries.filter((e) => e.syncGroupCode === syncCode);
    if (groupEntries.length === 0) continue;

    const byCS = new Map<string, InternalEntry[]>();
    for (const e of groupEntries) {
      const arr = byCS.get(e.courseSubjectId) ?? [];
      arr.push(e);
      byCS.set(e.courseSubjectId, arr);
    }

    for (const targetBlock of targetBlocks) {
      const missingMembers: string[] = [];
      const affectedIds: string[] = [];
      for (const [, list] of byCS) {
        const hasPinned = list.some((e) => {
          const s = slotMap.get(e.timeSlotId);
          return s && s.dayOfWeek === targetDay && s.blockNumber === targetBlock;
        });
        if (!hasPinned) {
          missingMembers.push(`${list[0].courseName} - ${list[0].subjectName}`);
          affectedIds.push(...list.map((e) => e.id));
        }
      }
      if (missingMembers.length > 0) {
        hardConflicts.push({
          id: `fixed-sync-slot-${rule.id}-${targetDay}-${targetBlock}`,
          severity: "HARD",
          ruleType: "FIXED_SYNC_GROUP_SLOT",
          message: `El grupo sincronizado "${syncCode}" debe ubicarse obligatoriamente en Día ${targetDay}, Bloque ${targetBlock} (faltan: ${missingMembers.join(", ")}).`,
          penalty: 100,
          dayOfWeek: targetDay,
          blockNumber: targetBlock,
          entryIds: affectedIds,
        });
      }
    }
  }

  // [PEDAGOGICA] 8. Separación mínima entre días (SUBJECT_MIN_DAY_SPACING)
  for (const rule of rules.filter((r) => r.ruleType === "SUBJECT_MIN_DAY_SPACING")) {
    const minDaysBetween = getRuleParamNumber(rule, "minDaysBetween", 1);
    for (const [csId, daysSet] of courseSubjectDays) {
      const sample = csSample.get(csId);
      if (!sample || !ruleMatchesTarget(rule, { subjectId: sample.subjectId, courseId: sample.courseId })) {
        continue;
      }
      const days = [...daysSet].sort((a, b) => a - b);
      if (days.length <= 1 || days.length > 3) continue;
      for (let i = 0; i < days.length - 1; i++) {
        if (days[i + 1] - days[i] - 1 < minDaysBetween) {
          pushRuleViolation(
            rule,
            hardConflicts,
            softViolations,
            {
              id: `spacing-${rule.id}-${csId}-${days[i]}`,
              ruleType: "SUBJECT_MIN_DAY_SPACING",
              message: `${sample.courseName} - ${sample.subjectName} se dicta en días seguidos (${days[i]} y ${days[i + 1]}) sin ${minDaysBetween} día(s) de separación.`,
              dayOfWeek: days[i + 1],
              entryIds: [],
            },
            22
          );
        }
      }
    }
  }

  // [PEDAGOGICA] 9. Carga cognitiva máxima diaria (MAX_DAILY_COGNITIVE_LOAD)
  for (const rule of rules.filter((r) => r.ruleType === "MAX_DAILY_COGNITIVE_LOAD")) {
    const maxDailyLoad = getRuleParamNumber(rule, "maxDailyLoad", 10);
    for (const [key, info] of courseDayCognitiveLoad) {
      const [courseId, dayStr] = key.split(":");
      if (!ruleMatchesTarget(rule, { courseId })) continue;
      if (info.load > maxDailyLoad) {
        pushRuleViolation(
          rule,
          hardConflicts,
          softViolations,
          {
            id: `cog-load-${rule.id}-${key}`,
            ruleType: "MAX_DAILY_COGNITIVE_LOAD",
            message: `${info.courseName} supera la carga cognitiva diaria el Día ${dayStr} (${info.load}/${maxDailyLoad} pts).`,
            dayOfWeek: Number(dayStr),
            entryIds: [],
          },
          25,
          info.load - maxDailyLoad
        );
      }
    }
  }

  // [PEDAGOGICA] 10. Restricción post-almuerzo por asignatura (NO_SUBJECT_POST_LUNCH)
  for (const rule of rules.filter((r) => r.ruleType === "NO_SUBJECT_POST_LUNCH")) {
    const blocksAfterLunch = Math.max(1, getRuleParamNumber(rule, "blocksAfterLunch", 1));
    for (const entry of entries) {
      if (!ruleMatchesTarget(rule, { subjectId: entry.subjectId, courseId: entry.courseId })) {
        continue;
      }
      const slot = slotMap.get(entry.timeSlotId);
      if (!slot) continue;
      const lunchInfo = lunchBlockByBell.get(slot.bellScheduleId);
      if (!lunchInfo) continue;
      if (
        slot.blockNumber >= lunchInfo.afterBlock &&
        slot.blockNumber < lunchInfo.afterBlock + blocksAfterLunch
      ) {
        pushRuleViolation(
          rule,
          hardConflicts,
          softViolations,
          {
            id: `post-lunch-${rule.id}-${entry.id}`,
            ruleType: "NO_SUBJECT_POST_LUNCH",
            message: `${entry.subjectName} en ${entry.courseName} quedó justo después de almuerzo (Día ${slot.dayOfWeek}, Bloque ${slot.blockNumber}).`,
            dayOfWeek: slot.dayOfWeek,
            blockNumber: slot.blockNumber,
            entryIds: [entry.id],
          },
          30
        );
      }
    }
  }

  // [PEDAGOGICA] 11. Precedencia Teoría antes de Taller (SUBJECT_PRECEDENCE)
  for (const rule of rules.filter((r) => r.ruleType === "SUBJECT_PRECEDENCE")) {
    const params = (rule.parameters ?? {}) as {
      prerequisiteSubjectId?: string;
      dependentSubjectId?: string;
    };
    if (!params.prerequisiteSubjectId || !params.dependentSubjectId) continue;

    const earliestByCourseSubj = new Map<string, { order: number; entry: InternalEntry }>();
    for (const entry of entries) {
      if (
        entry.subjectId !== params.prerequisiteSubjectId &&
        entry.subjectId !== params.dependentSubjectId
      ) {
        continue;
      }
      const slot = slotMap.get(entry.timeSlotId);
      if (!slot) continue;
      const order = slot.dayOfWeek * 100 + slot.blockNumber;
      const k = `${entry.courseId}:${entry.subjectId}`;
      const prev = earliestByCourseSubj.get(k);
      if (!prev || order < prev.order) {
        earliestByCourseSubj.set(k, { order, entry });
      }
    }

    const checkedCourses = new Set(entries.map((e) => e.courseId));
    for (const courseId of checkedCourses) {
      const prereq = earliestByCourseSubj.get(`${courseId}:${params.prerequisiteSubjectId}`);
      const dep = earliestByCourseSubj.get(`${courseId}:${params.dependentSubjectId}`);
      if (prereq && dep && dep.order < prereq.order) {
        pushRuleViolation(
          rule,
          hardConflicts,
          softViolations,
          {
            id: `precedence-${rule.id}-${courseId}`,
            ruleType: "SUBJECT_PRECEDENCE",
            message: `${dep.entry.courseName}: "${dep.entry.subjectName}" ocurre antes que su asignatura teórica previa "${prereq.entry.subjectName}".`,
            entryIds: [dep.entry.id, prereq.entry.id],
          },
          30
        );
      }
    }
  }

  // [INFRAESTRUCTURA] 12. Accesibilidad / restricción de piso (ROOM_ACCESSIBILITY_FLOOR)
  for (const rule of rules.filter((r) => r.ruleType === "ROOM_ACCESSIBILITY_FLOOR")) {
    const maxFloor = getRuleParamNumber(rule, "maxFloor", 1);
    for (const entry of entries) {
      const applies =
        (rule.targetEntityType === "COURSE" && rule.targetEntityId === entry.courseId) ||
        (rule.targetEntityType === "GLOBAL" && entry.courseRequiresGroundFloor);
      if (!applies) continue;
      const room = roomMap.get(entry.roomId);
      if (room && room.floor > maxFloor) {
        const slot = slotMap.get(entry.timeSlotId);
        pushRuleViolation(
          rule,
          hardConflicts,
          softViolations,
          {
            id: `floor-${rule.id}-${entry.id}`,
            ruleType: "ROOM_ACCESSIBILITY_FLOOR",
            message: `${entry.courseName} requiere piso <= ${maxFloor}, pero está asignado a "${room.name}" (Piso ${room.floor}).`,
            dayOfWeek: slot?.dayOfWeek,
            blockNumber: slot?.blockNumber,
            entryIds: [entry.id],
          },
          100
        );
      }
    }
  }

  // [INFRAESTRUCTURA] 13. Aforo / capacidad de alumnos por sala (ROOM_STUDENT_CAPACITY)
  for (const rule of rules.filter((r) => r.ruleType === "ROOM_STUDENT_CAPACITY")) {
    for (const entry of entries) {
      if (!ruleMatchesTarget(rule, { courseId: entry.courseId })) continue;
      const room = roomMap.get(entry.roomId);
      if (room && entry.courseStudentCount > room.capacity) {
        const slot = slotMap.get(entry.timeSlotId);
        pushRuleViolation(
          rule,
          hardConflicts,
          softViolations,
          {
            id: `capacity-${rule.id}-${entry.id}`,
            ruleType: "ROOM_STUDENT_CAPACITY",
            message: `${entry.courseName} (${entry.courseStudentCount} est.) supera el aforo de "${room.name}" (${room.capacity} cupos).`,
            dayOfWeek: slot?.dayOfWeek,
            blockNumber: slot?.blockNumber,
            entryIds: [entry.id],
          },
          100
        );
      }
    }
  }

  // [INFRAESTRUCTURA] 14. Equipamiento obligatorio de sala (ROOM_EQUIPMENT_REQUIREMENT)
  for (const rule of rules.filter((r) => r.ruleType === "ROOM_EQUIPMENT_REQUIREMENT")) {
    const params = (rule.parameters ?? {}) as { requiredTag?: string };
    for (const entry of entries) {
      if (!ruleMatchesTarget(rule, { subjectId: entry.subjectId, courseId: entry.courseId })) {
        continue;
      }
      const neededTag =
        params.requiredTag?.trim() || entry.subjectRequiredEquipment?.trim() || null;
      if (!neededTag) continue;
      const room = roomMap.get(entry.roomId);
      if (
        room &&
        !room.equipmentTags.some((t) => t.toLowerCase() === neededTag.toLowerCase())
      ) {
        const slot = slotMap.get(entry.timeSlotId);
        pushRuleViolation(
          rule,
          hardConflicts,
          softViolations,
          {
            id: `equip-${rule.id}-${entry.id}`,
            ruleType: "ROOM_EQUIPMENT_REQUIREMENT",
            message: `${entry.subjectName} (${entry.courseName}) requiere equipamiento "${neededTag}", ausente en "${room.name}".`,
            dayOfWeek: slot?.dayOfWeek,
            blockNumber: slot?.blockNumber,
            entryIds: [entry.id],
          },
          100
        );
      }
    }
  }

  // [INFRAESTRUCTURA] 15. Minimizar cambios de sala por curso (MINIMIZE_COURSE_ROOM_CHANGES)
  for (const rule of rules.filter((r) => r.ruleType === "MINIMIZE_COURSE_ROOM_CHANGES")) {
    const maxChanges = getRuleParamNumber(rule, "maxChangesPerDay", 1);
    for (const [key, list] of courseDayRoomEntries) {
      const [courseId, dayStr] = key.split(":");
      if (!ruleMatchesTarget(rule, { courseId })) continue;
      const sorted = [...list].sort((a, b) => a.blockNumber - b.blockNumber);
      let changes = 0;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].roomId !== sorted[i - 1].roomId) changes++;
      }
      if (changes > maxChanges) {
        pushRuleViolation(
          rule,
          hardConflicts,
          softViolations,
          {
            id: `room-changes-${rule.id}-${key}`,
            ruleType: "MINIMIZE_COURSE_ROOM_CHANGES",
            message: `${sorted[0].courseName} realiza ${changes} cambios de sala el Día ${dayStr} (máximo ${maxChanges}).`,
            dayOfWeek: Number(dayStr),
            entryIds: sorted.map((s) => s.entryId),
          },
          18,
          changes - maxChanges
        );
      }
    }
  }

  // Cobertura de apoyos parciales (PIE / codocencia): bloques acompañados y bloques en Aula de Recursos
  if (supportExpectations.length > 0) {
    const pieRule = rules.find((r) => r.ruleType === "PIE_CO_TEACHING_SYNC");
    const csEntries = new Map<string, InternalEntry[]>();
    for (const e of entries) {
      const arr = csEntries.get(e.courseSubjectId) ?? [];
      arr.push(e);
      csEntries.set(e.courseSubjectId, arr);
    }
    for (const exp of supportExpectations) {
      const list = csEntries.get(exp.courseSubjectId) ?? [];
      if (list.length === 0) continue;
      const withTeacher = list.filter((e) => e.teacherIds.includes(exp.teacherId));
      const expected = Math.min(exp.expectedBlocks, list.length);
      if (withTeacher.length < expected) {
        const conflict = {
          id: `support-shortfall-${exp.courseSubjectId}-${exp.teacherId}`,
          ruleType: "PIE_CO_TEACHING_SYNC",
          message: `${exp.teacherName} acompaña ${withTeacher.length} de ${expected} bloques de ${exp.subjectName} (${exp.courseName}): no tiene disponibilidad en los demás.`,
          entryIds: list.map((e) => e.id),
          entityIds: [exp.teacherId],
        };
        if (pieRule) {
          pushRuleViolation(pieRule, hardConflicts, softViolations, conflict, 40, expected - withTeacher.length);
        } else {
          softViolations.push({
            ...conflict,
            severity: "SOFT",
            penalty: 40 * (expected - withTeacher.length),
          });
        }
      }
      const expectedResource = Math.min(exp.expectedResourceBlocks, withTeacher.length);
      if (expectedResource > 0) {
        const inResource = withTeacher.filter((e) => Boolean(e.teacherRooms?.[exp.teacherId])).length;
        if (inResource < expectedResource) {
          softViolations.push({
            id: `support-resource-room-${exp.courseSubjectId}-${exp.teacherId}`,
            severity: "SOFT",
            ruleType: "PIE_CO_TEACHING_SYNC",
            message: `${exp.teacherName} tiene ${inResource} de ${expectedResource} bloques de ${exp.subjectName} (${exp.courseName}) en Aula de Recursos: no había una sala PIE libre en los demás.`,
            penalty: 15 * (expectedResource - inResource),
            entryIds: withTeacher.map((e) => e.id),
            entityIds: [exp.teacherId],
          });
        }
      }
    }
  }

  const hardPenalty = hardConflicts.reduce((sum, c) => sum + c.penalty, 0);
  const softPenalty = softViolations.reduce((sum, c) => sum + c.penalty, 0);
  const totalPenalty = hardPenalty + softPenalty;

  // Score normalizado 0..100 proporcional al tamaño de la grilla (cualquier conflicto HARD limita el techo a 59.9)
  const scaleBase = Math.max(entries.length, 20);
  const softNormalized = (softPenalty / scaleBase) * 6;
  const hardNormalized = hardPenalty * 0.4;
  const rawScore = Math.max(0, 100 - softNormalized - hardNormalized);
  const fitnessScore =
    hardConflicts.length > 0
      ? Number(Math.min(59.9, rawScore).toFixed(1))
      : Number(rawScore.toFixed(1));

  return {
    fitnessScore,
    hardCount: hardConflicts.length,
    softCount: softViolations.length,
    totalPenalty,
    hardConflicts,
    softViolations,
  };
}

/**
 * Asigna los docentes de apoyo parcial (ej. PIE que acompaña 2 de 6 bloques de Matemática) a bloques
 * concretos ya ubicados y, para el PIE, reserva el Aula de Recursos en los bloques que lo requieren.
 * Muta placedEntries (teacherIds / teacherRooms). Los déficits los reporta evaluateScheduleState.
 */
function assignSupportTeachers(params: {
  courses: Awaited<ReturnType<typeof loadSchoolContext>>["courses"];
  rooms: Awaited<ReturnType<typeof loadSchoolContext>>["rooms"];
  rules: SchedulingRule[];
  placedEntries: InternalEntry[];
  slotMap: Map<string, InternalSlot>;
  teacherMap: Map<string, TeacherEvalInfo>;
  baseActivities: Array<{ teacherId: string; timeSlotId: string; roomId: string | null }>;
}) {
  const { courses, rooms, rules, placedEntries, slotMap, teacherMap, baseActivities } = params;

  const teacherBusy = new Set<string>(); // `${teacherId}:${day}:${block}`
  const teacherDayCount = new Map<string, number>(); // `${teacherId}:${day}`
  const roomBusy = new Set<string>(); // `${roomId}:${day}:${block}`
  const timeKey = (e: InternalEntry): string | null => {
    const slot = slotMap.get(e.timeSlotId);
    return slot ? `${slot.dayOfWeek}:${slot.blockNumber}` : null;
  };
  const markTeacher = (tid: string, e: InternalEntry) => {
    const slot = slotMap.get(e.timeSlotId);
    if (!slot) return;
    const k = `${tid}:${slot.dayOfWeek}:${slot.blockNumber}`;
    if (teacherBusy.has(k)) return;
    teacherBusy.add(k);
    const dk = `${tid}:${slot.dayOfWeek}`;
    teacherDayCount.set(dk, (teacherDayCount.get(dk) ?? 0) + 1);
  };

  for (const e of placedEntries) {
    const tk = timeKey(e);
    if (!tk) continue;
    for (const tid of e.teacherIds) markTeacher(tid, e);
    roomBusy.add(`${e.roomId}:${tk}`);
    for (const rid of Object.values(e.teacherRooms ?? {})) roomBusy.add(`${rid}:${tk}`);
  }
  for (const act of baseActivities) {
    const slot = slotMap.get(act.timeSlotId);
    if (!slot) continue;
    teacherBusy.add(`${act.teacherId}:${slot.dayOfWeek}:${slot.blockNumber}`);
    if (act.roomId) roomBusy.add(`${act.roomId}:${slot.dayOfWeek}:${slot.blockNumber}`);
  }

  const teacherCanJoin = (tid: string, e: InternalEntry): boolean => {
    const slot = slotMap.get(e.timeSlotId);
    if (!slot) return false;
    if (teacherBusy.has(`${tid}:${slot.dayOfWeek}:${slot.blockNumber}`)) return false;
    if (isTeacherUnavailable(tid, slot.dayOfWeek, slot.blockNumber, rules)) return false;
    const maxDaily = teacherMap.get(tid)?.maxDailyHours;
    if (maxDaily !== undefined && (teacherDayCount.get(`${tid}:${slot.dayOfWeek}`) ?? 0) >= maxDaily) {
      return false;
    }
    return true;
  };

  const groupByDay = (list: InternalEntry[]): Array<{ day: number; entries: InternalEntry[] }> => {
    const map = new Map<number, InternalEntry[]>();
    for (const e of list) {
      const slot = slotMap.get(e.timeSlotId);
      if (!slot) continue;
      const arr = map.get(slot.dayOfWeek) ?? [];
      arr.push(e);
      map.set(slot.dayOfWeek, arr);
    }
    return [...map.entries()].map(([day, entries]) => ({
      day,
      entries: entries.sort(
        (a, b) =>
          (slotMap.get(a.timeSlotId)?.blockNumber ?? 0) - (slotMap.get(b.timeSlotId)?.blockNumber ?? 0)
      ),
    }));
  };

  const entriesByCS = new Map<string, InternalEntry[]>();
  for (const e of placedEntries) {
    const arr = entriesByCS.get(e.courseSubjectId) ?? [];
    arr.push(e);
    entriesByCS.set(e.courseSubjectId, arr);
  }

  const assignments: Array<{
    teacherId: string;
    partial: boolean;
    neededBlocks: number;
    resourceRoomBlocks: number;
    resourceRoomId: string | null;
    entries: InternalEntry[];
  }> = [];
  for (const course of courses) {
    for (const cs of course.courseSubjects) {
      const entries = entriesByCS.get(cs.id) ?? [];
      if (entries.length === 0) continue;
      for (const t of cs.teachers) {
        const partial = isPartialSupportAssignment(t, cs.weeklyBlocks);
        const resourceRoomBlocks = t.role === "PIE_SUPPORT" ? t.resourceRoomBlocks : 0;
        if (!partial && resourceRoomBlocks <= 0) continue;
        assignments.push({
          teacherId: t.teacherId,
          partial,
          neededBlocks: effectiveAssignedBlocks(t, cs.weeklyBlocks),
          resourceRoomBlocks,
          resourceRoomId: t.resourceRoomId,
          entries,
        });
      }
    }
  }

  // Primero los apoyos con menos holgura (menos bloques disponibles respecto de los que necesitan)
  const slack = (a: (typeof assignments)[number]) =>
    a.entries.filter((e) => !e.teacherIds.includes(a.teacherId) && teacherCanJoin(a.teacherId, e)).length -
    (a.neededBlocks - a.entries.filter((e) => e.teacherIds.includes(a.teacherId)).length);
  const slackById = new Map(assignments.map((a) => [a, slack(a)]));
  assignments.sort((a, b) => (slackById.get(a) ?? 0) - (slackById.get(b) ?? 0));

  const pieRooms = rooms.filter((r) => r.roomType === "PIE_ROOM");

  for (const a of assignments) {
    const tid = a.teacherId;

    // 1. Elegir los bloques que acompaña (preferir días completos de la asignatura, ej. el bloque doble)
    if (a.partial) {
      let remaining = a.neededBlocks - a.entries.filter((e) => e.teacherIds.includes(tid)).length;
      const groups = groupByDay(
        a.entries.filter((e) => !e.teacherIds.includes(tid) && teacherCanJoin(tid, e))
      );
      while (remaining > 0 && groups.length > 0) {
        groups.sort((x, y) => {
          const exactX = x.entries.length === remaining ? 0 : 1;
          const exactY = y.entries.length === remaining ? 0 : 1;
          if (exactX !== exactY) return exactX - exactY;
          if (y.entries.length !== x.entries.length) return y.entries.length - x.entries.length;
          // Compactar el día del docente de apoyo: preferir días en que ya tiene clases
          const loadX = teacherDayCount.get(`${tid}:${x.day}`) ?? 0;
          const loadY = teacherDayCount.get(`${tid}:${y.day}`) ?? 0;
          if (loadX !== loadY) return loadY - loadX;
          return x.day - y.day;
        });
        const group = groups.shift()!;
        for (const e of group.entries) {
          if (remaining <= 0) break;
          if (!teacherCanJoin(tid, e)) continue;
          e.teacherIds = [...e.teacherIds, tid];
          markTeacher(tid, e);
          remaining--;
        }
      }
    }

    // 2. Aula de Recursos: el docente PIE trabaja en una sala aparte; el titular sigue en la sala del bloque
    let remainingResource =
      a.resourceRoomBlocks -
      a.entries.filter((e) => e.teacherIds.includes(tid) && e.teacherRooms?.[tid]).length;
    if (remainingResource <= 0 || pieRooms.length === 0) continue;

    const roomOrder = [
      ...pieRooms.filter((r) => r.id === a.resourceRoomId),
      ...pieRooms.filter((r) => r.id !== a.resourceRoomId),
    ];
    const isRoomFree = (roomId: string, e: InternalEntry) => {
      const tk = timeKey(e);
      return Boolean(tk) && !roomBusy.has(`${roomId}:${tk}`);
    };
    const assignRoom = (e: InternalEntry, roomId: string) => {
      e.teacherRooms = { ...(e.teacherRooms ?? {}), [tid]: roomId };
      roomBusy.add(`${roomId}:${timeKey(e)}`);
      remainingResource--;
    };

    const participating = groupByDay(
      a.entries.filter((e) => e.teacherIds.includes(tid) && !e.teacherRooms?.[tid])
    ).sort((x, y) => y.entries.length - x.entries.length || x.day - y.day);

    for (const group of participating) {
      if (remainingResource <= 0) break;
      const take = group.entries.slice(0, remainingResource);
      // Misma sala para todo el tramo del día si es posible
      const sameRoom = roomOrder.find((r) => take.every((e) => isRoomFree(r.id, e)));
      for (const e of take) {
        const room = sameRoom ?? roomOrder.find((r) => isRoomFree(r.id, e));
        if (room) assignRoom(e, room.id);
      }
    }
  }
}

async function loadSchoolContext(schoolId: string) {
  const [bellSchedules, rooms, subjects, teachers, courses, rules] = await Promise.all([
    prisma.bellSchedule.findMany({
      where: { schoolId },
      include: {
        timeSlots: { orderBy: [{ dayOfWeek: "asc" }, { blockNumber: "asc" }] },
      },
    }),
    prisma.room.findMany({ where: { schoolId } }),
    prisma.subject.findMany({ where: { schoolId } }),
    prisma.teacher.findMany({
      where: { schoolId },
      include: { qualifiedSubjects: true, qualifiedLevels: true },
    }),
    prisma.course.findMany({
      where: { schoolId },
      include: {
        defaultRoom: true,
        courseSubjects: {
          include: {
            subject: true,
            teachers: { include: { teacher: true } },
          },
        },
      },
    }),
    prisma.schedulingRule.findMany({ where: { schoolId } }),
  ]);

  return { bellSchedules, rooms, subjects, teachers, courses, rules };
}

function buildLunchBlockMap(
  bellSchedules: Array<{ id: string; timeSlots: Array<{ dayOfWeek: number; blockNumber: number; slotType: string; startTime: string }> }>
): Map<string, { beforeBlock: number; afterBlock: number }> {
  const map = new Map<string, { beforeBlock: number; afterBlock: number }>();
  for (const bs of bellSchedules) {
    const day1 = bs.timeSlots
      .filter((s) => s.dayOfWeek === 1)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const lunchIdx = day1.findIndex((s) => s.slotType === "LUNCH");
    if (lunchIdx > 0 && lunchIdx < day1.length - 1) {
      const before = day1[lunchIdx - 1];
      const after = day1[lunchIdx + 1];
      if (before.slotType === "CLASS" && after.slotType === "CLASS") {
        map.set(bs.id, { beforeBlock: before.blockNumber, afterBlock: after.blockNumber });
      }
    }
  }
  return map;
}

function buildTeacherEvalMap(
  teachers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    contractHours: number;
    maxDailyHours: number;
    maxTeachingBlocks: number;
    ley20903Ratio: string;
    qualifiedLevels: Array<{ levelCode: string }>;
  }>,
  courses: Array<{
    levelCode: string;
    courseSubjects: Array<{ teachers: Array<{ teacherId: string }> }>;
  }>,
  bellSchedules: Array<{ timeSlots: Array<{ slotType: string; durationMinutes: number }> }>,
  rules: SchedulingRule[]
): Map<string, TeacherEvalInfo> {
  const leyPolicy = extractLey20903Policy(rules);
  const blockDurationMinutes = resolveBlockDurationMinutes(bellSchedules, leyPolicy);

  const basic1to4Teachers = new Set<string>();
  const teachersWithAnyCourse = new Set<string>();
  for (const c of courses) {
    for (const cs of c.courseSubjects) {
      for (const cst of cs.teachers) {
        teachersWithAnyCourse.add(cst.teacherId);
        if (c.levelCode === "BASIC_1_4") {
          basic1to4Teachers.add(cst.teacherId);
        }
      }
    }
  }

  return new Map(
    teachers.map((t) => {
      const teachesBasic1to4 =
        basic1to4Teachers.has(t.id) ||
        (!teachersWithAnyCourse.has(t.id) &&
          t.qualifiedLevels.some((ql) => ql.levelCode === "BASIC_1_4"));
      const ratio = resolveTeacherLey20903Ratio(t.ley20903Ratio, teachesBasic1to4, leyPolicy);
      const legalMax = calculateLegalMaxTeachingBlocks(t.contractHours, {
        ratio,
        blockDurationMinutes,
        includeBreaksInTeaching: leyPolicy.includeBreaksInTeaching,
        breakMinutesPerBlock: leyPolicy.breakMinutesPerBlock,
      });
      return [
        t.id,
        {
          name: `${t.firstName} ${t.lastName}`,
          contractHours: t.contractHours,
          maxDailyHours: t.maxDailyHours,
          maxTeachingBlocks: t.maxTeachingBlocks,
          legalMaxTeachingBlocks: legalMax,
          ratioLabel: LEY_20903_RATIO_LABELS[ratio],
        },
      ];
    })
  );
}

export const TimetableSolverService = {
  /**
   * Verifica inconsistencias previas a la ejecución del solver.
   */
  async validatePreconditions(schoolId: string): Promise<PreconditionResult> {
    const { bellSchedules, rooms, teachers, courses, rules } = await loadSchoolContext(schoolId);
    const leyPolicy = extractLey20903Policy(rules);
    const teacherEvalMap = buildTeacherEvalMap(teachers, courses, bellSchedules, rules);
    const issues: PreconditionIssue[] = [];

    const classSlotsByBell = new Map<string, number>();
    for (const bs of bellSchedules) {
      const count = bs.timeSlots.filter((s) => s.slotType === "CLASS").length;
      classSlotsByBell.set(bs.id, count);
      if (count === 0) {
        issues.push({
          severity: "ERROR",
          code: "EMPTY_BELL_SCHEDULE",
          entityType: "BELL_SCHEDULE",
          entityId: bs.id,
          message: `La jornada "${bs.name}" no tiene bloques de clase generados.`,
        });
      }
    }

    const teacherAssigned = new Map<string, number>();
    const roomTypeDemand = new Map<RoomType, number>();
    const syncGroups = new Map<string, Array<{ courseName: string; weeklyBlocks: number; bellScheduleId: string }>>();
    let totalBlocksToSchedule = 0;

    for (const course of courses) {
      const availableSlots = classSlotsByBell.get(course.bellScheduleId) ?? 0;
      const courseTotal = calculateEffectiveCourseBlocks(course.courseSubjects);
      totalBlocksToSchedule += courseTotal;

      if (courseTotal > availableSlots) {
        issues.push({
          severity: "ERROR",
          code: "COURSE_OVERFLOW",
          entityType: "COURSE",
          entityId: course.id,
          message: `El curso ${course.name} tiene ${courseTotal} bloques asignados, pero su jornada solo dispone de ${availableSlots} bloques de clase.`,
        });
      }

      if (!course.defaultRoomId && rooms.filter((r) => r.roomType === "CLASSROOM").length === 0) {
        issues.push({
          severity: "ERROR",
          code: "NO_CLASSROOM",
          entityType: "COURSE",
          entityId: course.id,
          message: `El curso ${course.name} no tiene sala base y no hay salas de clase registradas.`,
        });
      }

      for (const cs of course.courseSubjects) {
        if (cs.teachers.length === 0) {
          issues.push({
            severity: "ERROR",
            code: "UNASSIGNED_SUBJECT",
            entityType: "COURSE",
            entityId: course.id,
            message: `${cs.subject.name} en ${course.name} no tiene ningún docente asignado.`,
          });
        }

        for (const cst of cs.teachers) {
          if (
            cst.role === "PIE_SUPPORT" &&
            cst.resourceRoomBlocks > 0 &&
            !rooms.some((r) => r.roomType === "PIE_ROOM")
          ) {
            issues.push({
              severity: "WARNING",
              code: "NO_PIE_ROOM",
              entityType: "COURSE",
              entityId: course.id,
              message: `${cs.subject.name} en ${course.name} tiene bloques de apoyo PIE en Aula de Recursos, pero no hay salas de tipo "${ROOM_TYPE_LABELS.PIE_ROOM}". Esos bloques quedarán en el aula regular.`,
            });
          }
          const blocksForTeacher = cst.assignedBlocks ?? cs.weeklyBlocks;
          teacherAssigned.set(
            cst.teacherId,
            (teacherAssigned.get(cst.teacherId) ?? 0) + blocksForTeacher
          );
        }

        if (cs.subject.requiresRoomType) {
          roomTypeDemand.set(
            cs.subject.requiresRoomType,
            (roomTypeDemand.get(cs.subject.requiresRoomType) ?? 0) + cs.weeklyBlocks
          );
        }

        if (cs.syncGroupCode) {
          const arr = syncGroups.get(cs.syncGroupCode) ?? [];
          arr.push({
            courseName: course.name,
            weeklyBlocks: cs.weeklyBlocks,
            bellScheduleId: course.bellScheduleId,
          });
          syncGroups.set(cs.syncGroupCode, arr);
        }
      }
    }

    // Validar carga docente vs maxTeachingBlocks y Ley 20.903 (65/35 o 60/40)
    for (const t of teachers) {
      const assigned = teacherAssigned.get(t.id) ?? 0;
      const evalInfo = teacherEvalMap.get(t.id);
      const legalMax = evalInfo?.legalMaxTeachingBlocks ?? calculateLegalMaxTeachingBlocks(t.contractHours);
      const ratioLabel = evalInfo?.ratioLabel ?? "65/35";
      const nonTeachingPct = ratioLabel === "60/40" ? 0.4 : 0.35;
      const minNonTeachingStr = formatChronologicalMinutes(Math.round(t.contractHours * nonTeachingPct * 60));

      if (assigned > t.maxTeachingBlocks) {
        issues.push({
          severity: "ERROR",
          code: "TEACHER_OVER_MAX_BLOCKS",
          entityType: "TEACHER",
          entityId: t.id,
          message: `${t.firstName} ${t.lastName} tiene ${assigned} bloques asignados, superando su tope configurado (${t.maxTeachingBlocks}).`,
        });
      } else if (assigned > legalMax) {
        issues.push({
          severity: leyPolicy.strictEnforcement ? "ERROR" : "WARNING",
          code: "LEY_20903_EXCEEDED",
          entityType: "TEACHER",
          entityId: t.id,
          message: `${t.firstName} ${t.lastName} tiene ${assigned} bloques lectivos; el tope legal ${ratioLabel} (Ley 20.903) para ${t.contractHours}h es ${legalMax} bloques (mín. no lectivo: ${minNonTeachingStr}).`,
        });
      }
    }

    // Validar capacidad de salas especiales (excluyendo salas base de cursos cuando el tipo es CLASSROOM / "Otra sala de clases")
    const courseHomeRoomIdsPre = new Set(
      courses.map((c) => c.defaultRoomId).filter((id): id is string => Boolean(id))
    );
    const maxSlotsAcrossBells = Math.max(...Array.from(classSlotsByBell.values()), 35);
    for (const [roomType, demand] of roomTypeDemand) {
      const matchingRooms = rooms.filter((r) => {
        if (r.roomType !== roomType) return false;
        if (roomType === "CLASSROOM" && courseHomeRoomIdsPre.has(r.id)) return false;
        return true;
      });
      const capacity = matchingRooms.length * maxSlotsAcrossBells;
      if (matchingRooms.length === 0) {
        issues.push({
          severity: "WARNING",
          code: "MISSING_SPECIAL_ROOM",
          entityType: "ROOM",
          message:
            roomType === "CLASSROOM"
              ? `Se requieren ${demand} bloques en "Otra sala de clases", pero todas las salas de clases están asignadas como sala base de algún curso.`
              : `Se requieren ${demand} bloques en sala tipo "${ROOM_TYPE_LABELS[roomType]}", pero no hay ningún recinto de este tipo registrado.`,
        });
      } else if (demand > capacity) {
        issues.push({
          severity: "WARNING",
          code: "SPECIAL_ROOM_OVERFLOW",
          entityType: "ROOM",
          message: `Demanda de ${demand} bloques para "${ROOM_TYPE_LABELS[roomType]}" supera la capacidad semanal disponible (${capacity}).`,
        });
      }
    }

    // Validar grupos sincronizados (Electivos / PIE)
    for (const [code, items] of syncGroups) {
      const blocksSet = new Set(items.map((i) => i.weeklyBlocks));
      if (blocksSet.size > 1) {
        issues.push({
          severity: "ERROR",
          code: "SYNC_GROUP_BLOCK_MISMATCH",
          entityType: "SYNC_GROUP",
          message: `El grupo sincronizado "${code}" tiene asignaturas con distinta cantidad de bloques semanales.`,
        });
      }
    }

    return {
      ready: !issues.some((i) => i.severity === "ERROR"),
      issues,
      stats: {
        courses: courses.length,
        teachers: teachers.length,
        rooms: rooms.length,
        totalBlocksToSchedule,
      },
    };
  },

  /**
   * Ejecuta el motor de programación por restricciones (CSP + optimización local).
   * Respeta bloques fijados (is_locked = true) y actividades no lectivas.
   */
  async generateSchedule(schoolId: string, options: GenerateScheduleOptions = {}) {
    const { bellSchedules, rooms, teachers, courses, rules } = await loadSchoolContext(schoolId);

    const slotMap = new Map<string, InternalSlot>();
    const classSlotsByBell = new Map<string, InternalSlot[]>();

    for (const bs of bellSchedules) {
      const classSlots: InternalSlot[] = [];
      for (const s of bs.timeSlots) {
        const internal: InternalSlot = {
          id: s.id,
          bellScheduleId: s.bellScheduleId,
          dayOfWeek: s.dayOfWeek,
          blockNumber: s.blockNumber,
          pairGroupId: s.pairGroupId,
          startTime: s.startTime,
          endTime: s.endTime,
          slotType: s.slotType,
        };
        slotMap.set(s.id, internal);
        if (s.slotType === "CLASS") classSlots.push(internal);
      }
      classSlotsByBell.set(bs.id, classSlots);
    }

    const teacherMap = buildTeacherEvalMap(teachers, courses, bellSchedules, rules);
    const roomMap = buildRoomMap(rooms);
    const lunchBlockByBell = buildLunchBlockMap(bellSchedules);
    const supportExpectations = buildSupportExpectations(courses);

    // Cargar bloques fijados y actividades no lectivas si hay una versión base
    const lockedEntries: Array<{
      courseSubjectId: string;
      timeSlotId: string;
      roomId: string;
      participants: Array<{ teacherId: string; roomId: string | null }>;
    }> = [];
    const baseActivities: Array<{
      teacherId: string;
      timeSlotId: string;
      activityType: "STAFF_MEETING" | "DEPARTMENT_MEETING" | "PARENT_MEETING" | "PLANNING";
      title: string;
      roomId: string | null;
    }> = [];
    const nonTeachingMap = new Map<string, Array<{ teacherId: string; title: string }>>();

    if (options.baseVersionId) {
      const base = await prisma.scheduleVersion.findUnique({
        where: { id: options.baseVersionId },
        include: {
          entries: {
            where: { isLocked: true },
            include: { teachers: { select: { teacherId: true, roomId: true } } },
          },
          nonTeachingActivities: true,
        },
      });
      if (base) {
        for (const e of base.entries) {
          lockedEntries.push({
            courseSubjectId: e.courseSubjectId,
            timeSlotId: e.timeSlotId,
            roomId: e.roomId,
            participants: e.teachers,
          });
        }
        for (const act of base.nonTeachingActivities) {
          baseActivities.push({
            teacherId: act.teacherId,
            timeSlotId: act.timeSlotId,
            activityType: act.activityType,
            title: act.title,
            roomId: act.roomId,
          });
          const arr = nonTeachingMap.get(act.timeSlotId) ?? [];
          arr.push({ teacherId: act.teacherId, title: act.title });
          nonTeachingMap.set(act.timeSlotId, arr);
        }
      }
    }

    // Estructuras de ocupación en tiempo real para el solver
    const teacherBusy = new Set<string>(); // `${teacherId}:${day}:${block}`
    const courseBusy = new Set<string>(); // `${courseId}:${day}:${block}`
    const roomBusy = new Set<string>(); // `${roomId}:${day}:${block}`
    const courseDaySubjectCount = new Map<string, number>(); // `${courseId}:${day}:${subjectId}`
    const courseDaySubjectBlockNums = new Map<string, number[]>(); // `${courseId}:${day}:${subjectId}` -> blockNumbers
    const teacherDayCount = new Map<string, number>(); // `${teacherId}:${day}`

    const allowCourseWindows = rules.some(
      (r) =>
        r.ruleType === "ALLOW_COURSE_WINDOWS" &&
        Boolean(((r.parameters ?? {}) as { enabled?: boolean }).enabled)
    );

    // Calcular cupo diario compacto (1..quota) por curso y día cuando no se permiten ventanas de curso
    const courseDayQuota = new Map<string, number>(); // `${courseId}:${day}` -> max blockNumber permitido
    if (!allowCourseWindows) {
      for (const course of courses) {
        const totalBlocks = course.courseSubjects.reduce((sum, cs) => sum + cs.weeklyBlocks, 0);
        const bellSlots = classSlotsByBell.get(course.bellScheduleId) ?? [];
        const maxPerDay = Math.max(...bellSlots.map((s) => s.blockNumber), 8);
        const base = Math.floor(totalBlocks / 5);
        const extra = totalBlocks % 5;

        const quotas = [1, 2, 3, 4, 5].map((d) =>
          Math.min(maxPerDay, base + (d <= extra ? 1 : 0))
        );

        // Si hay bloques fijados (is_locked) que caen más abajo de la cuota, ajustar cuota
        const lockedForCourse = lockedEntries.filter((le) =>
          course.courseSubjects.some((cs) => cs.id === le.courseSubjectId)
        );
        for (const le of lockedForCourse) {
          const s = slotMap.get(le.timeSlotId);
          if (!s) continue;
          const idx = s.dayOfWeek - 1;
          if (idx >= 0 && idx < 5 && s.blockNumber > quotas[idx]) {
            const diff = s.blockNumber - quotas[idx];
            quotas[idx] = s.blockNumber;
            // Descontar diff de otros días con cuota mayor
            let rem = diff;
            for (let j = 4; j >= 0 && rem > 0; j--) {
              if (j === idx) continue;
              const canTake = Math.min(rem, Math.max(0, quotas[j] - 1));
              quotas[j] -= canTake;
              rem -= canTake;
            }
          }
        }

        quotas.forEach((q, idx) => {
          courseDayQuota.set(`${course.id}:${idx + 1}`, q);
        });
      }
    }

    // Marcar actividades no lectivas como ocupadas
    for (const act of baseActivities) {
      const s = slotMap.get(act.timeSlotId);
      if (!s) continue;
      teacherBusy.add(`${act.teacherId}:${s.dayOfWeek}:${s.blockNumber}`);
      if (act.roomId) {
        roomBusy.add(`${act.roomId}:${s.dayOfWeek}:${s.blockNumber}`);
      }
    }

    const placedEntries: InternalEntry[] = [];
    const lockedCountByCS = new Map<string, number>();

    const csLookup = new Map<
      string,
      {
        courseSubjectId: string;
        courseId: string;
        bellScheduleId: string;
        courseName: string;
        defaultRoomId: string | null;
        courseStudentCount: number;
        courseRequiresGroundFloor: boolean;
        subjectId: string;
        subjectCode: string;
        subjectName: string;
        requiresRoomType: RoomType | null;
        requiredRoomId: string | null;
        subjectCognitiveWeight: number;
        subjectRequiredEquipment: string | null;
        weeklyBlocks: number;
        requiresConsecutiveBlocks: boolean;
        syncGroupCode: string | null;
        teacherIds: string[];
      }
    >();

    for (const course of courses) {
      for (const cs of course.courseSubjects) {
        csLookup.set(cs.id, {
          courseSubjectId: cs.id,
          courseId: course.id,
          bellScheduleId: course.bellScheduleId,
          courseName: course.name,
          defaultRoomId: course.defaultRoomId,
          courseStudentCount: course.studentCount,
          courseRequiresGroundFloor: course.requiresGroundFloor,
          subjectId: cs.subjectId,
          subjectCode: cs.subject.code,
          subjectName: cs.subject.name,
          requiresRoomType: cs.subject.requiresRoomType,
          requiredRoomId: cs.subject.requiredRoomId,
          subjectCognitiveWeight: cs.subject.cognitiveWeight,
          subjectRequiredEquipment: cs.subject.requiredEquipment,
          weeklyBlocks: cs.weeklyBlocks,
          requiresConsecutiveBlocks: cs.requiresConsecutiveBlocks,
          syncGroupCode: cs.syncGroupCode,
          // Los apoyos parciales (PIE que acompaña solo algunos bloques) se asignan después de ubicar los bloques
          teacherIds: cs.teachers
            .filter((t) => !isPartialSupportAssignment(t, cs.weeklyBlocks))
            .map((t) => t.teacherId),
        });
      }
    }

    const courseDayCognitiveMap = new Map<string, number>();
    const courseDayLastRoom = new Map<string, string>();
    const courseSubjectDaysMap = new Map<string, Set<number>>();

    const markPlaced = (
      csInfo: NonNullable<ReturnType<typeof csLookup.get>>,
      slot: InternalSlot,
      roomId: string,
      isLocked: boolean,
      participants?: Array<{ teacherId: string; roomId: string | null }>
    ) => {
      const id = `tmp-${placedEntries.length + 1}`;
      // Bloques fijados de una versión base conservan sus participantes (incluido el apoyo PIE y su sala)
      const teacherIds =
        participants && participants.length > 0
          ? participants.map((p) => p.teacherId)
          : [...csInfo.teacherIds];
      const teacherRooms: Record<string, string> = {};
      for (const p of participants ?? []) {
        if (p.roomId && p.roomId !== roomId) teacherRooms[p.teacherId] = p.roomId;
      }
      placedEntries.push({
        id,
        courseSubjectId: csInfo.courseSubjectId,
        courseId: csInfo.courseId,
        defaultRoomId: csInfo.defaultRoomId,
        subjectId: csInfo.subjectId,
        subjectCode: csInfo.subjectCode,
        subjectName: csInfo.subjectName,
        courseName: csInfo.courseName,
        requiresRoomType: csInfo.requiresRoomType,
        requiredRoomId: csInfo.requiredRoomId,
        requiresConsecutiveBlocks: csInfo.requiresConsecutiveBlocks,
        syncGroupCode: csInfo.syncGroupCode,
        teacherIds,
        teacherRooms,
        timeSlotId: slot.id,
        roomId,
        isLocked,
        courseStudentCount: csInfo.courseStudentCount,
        courseRequiresGroundFloor: csInfo.courseRequiresGroundFloor,
        subjectCognitiveWeight: csInfo.subjectCognitiveWeight,
        subjectRequiredEquipment: csInfo.subjectRequiredEquipment,
      });

      courseBusy.add(`${csInfo.courseId}:${slot.dayOfWeek}:${slot.blockNumber}`);
      roomBusy.add(`${roomId}:${slot.dayOfWeek}:${slot.blockNumber}`);
      for (const rid of Object.values(teacherRooms)) {
        roomBusy.add(`${rid}:${slot.dayOfWeek}:${slot.blockNumber}`);
      }
      for (const tid of teacherIds) {
        teacherBusy.add(`${tid}:${slot.dayOfWeek}:${slot.blockNumber}`);
        const tdKey = `${tid}:${slot.dayOfWeek}`;
        teacherDayCount.set(tdKey, (teacherDayCount.get(tdKey) ?? 0) + 1);
      }
      const cdsKey = `${csInfo.courseId}:${slot.dayOfWeek}:${csInfo.subjectId}`;
      courseDaySubjectCount.set(cdsKey, (courseDaySubjectCount.get(cdsKey) ?? 0) + 1);
      const bArr = courseDaySubjectBlockNums.get(cdsKey) ?? [];
      bArr.push(slot.blockNumber);
      courseDaySubjectBlockNums.set(cdsKey, bArr);

      const cDayKey = `${csInfo.courseId}:${slot.dayOfWeek}`;
      courseDayCognitiveMap.set(
        cDayKey,
        (courseDayCognitiveMap.get(cDayKey) ?? 0) + csInfo.subjectCognitiveWeight
      );
      courseDayLastRoom.set(cDayKey, roomId);
      const dSet = courseSubjectDaysMap.get(csInfo.courseSubjectId) ?? new Set<number>();
      dSet.add(slot.dayOfWeek);
      courseSubjectDaysMap.set(csInfo.courseSubjectId, dSet);
    };

    // 1. Colocar bloques fijados (is_locked = true)
    for (const le of lockedEntries) {
      const csInfo = csLookup.get(le.courseSubjectId);
      const slot = slotMap.get(le.timeSlotId);
      if (!csInfo || !slot) continue;
      markPlaced(csInfo, slot, le.roomId, true, le.participants);
      lockedCountByCS.set(le.courseSubjectId, (lockedCountByCS.get(le.courseSubjectId) ?? 0) + 1);
    }

    const roomAssignmentMode = getRoomAssignmentMode(rules);

    // Salas base de cada curso (protegidas contra uso por cursos ajenos)
    const courseHomeRoomIds = new Set(
      courses.map((c) => c.defaultRoomId).filter((id): id is string => Boolean(id))
    );

    // Salas base participantes en cada grupo sincronizado (pueden rotar entre cursos paralelos del mismo sync)
    const syncGroupHomeRooms = new Map<string, Set<string>>();
    for (const csInfo of csLookup.values()) {
      if (csInfo.syncGroupCode && csInfo.defaultRoomId) {
        const set = syncGroupHomeRooms.get(csInfo.syncGroupCode) ?? new Set<string>();
        set.add(csInfo.defaultRoomId);
        syncGroupHomeRooms.set(csInfo.syncGroupCode, set);
      }
    }

    const isProtectedForeignHomeRoom = (
      roomId: string,
      csInfo: NonNullable<ReturnType<typeof csLookup.get>>
    ): boolean => {
      if (!courseHomeRoomIds.has(roomId)) return false;
      if (csInfo.defaultRoomId === roomId) return false;
      if (csInfo.syncGroupCode && syncGroupHomeRooms.get(csInfo.syncGroupCode)?.has(roomId)) {
        return false;
      }
      return true;
    };

    const pickRoom = (
      csInfo: NonNullable<ReturnType<typeof csLookup.get>>,
      slot: InternalSlot,
      excludeRoomIds = new Set<string>(),
      allowFallback = false
    ): string | null => {
      const key = `${slot.dayOfWeek}:${slot.blockNumber}`;
      const floorRules = rules.filter((r) => r.ruleType === "ROOM_ACCESSIBILITY_FLOOR");
      const capRules = rules.filter((r) => r.ruleType === "ROOM_STUDENT_CAPACITY");
      const equipRules = rules.filter((r) => r.ruleType === "ROOM_EQUIPMENT_REQUIREMENT");

      let maxAllowedFloor: number | null = null;
      for (const r of floorRules) {
        if (
          (r.targetEntityType === "COURSE" && r.targetEntityId === csInfo.courseId) ||
          (r.targetEntityType === "GLOBAL" && csInfo.courseRequiresGroundFloor)
        ) {
          const mf = getRuleParamNumber(r, "maxFloor", 1);
          maxAllowedFloor = maxAllowedFloor === null ? mf : Math.min(maxAllowedFloor, mf);
        }
      }

      const checkCapacity = capRules.some(
        (r) => r.weight === "HARD" && ruleMatchesTarget(r, { courseId: csInfo.courseId })
      );

      let requiredEquipTag: string | null = null;
      for (const r of equipRules) {
        if (ruleMatchesTarget(r, { subjectId: csInfo.subjectId, courseId: csInfo.courseId })) {
          const tag = ((r.parameters ?? {}) as { requiredTag?: string }).requiredTag?.trim();
          requiredEquipTag = tag || csInfo.subjectRequiredEquipment || null;
          break;
        }
      }

      const isFree = (r: (typeof rooms)[number]): boolean =>
        !excludeRoomIds.has(r.id) && !roomBusy.has(`${r.id}:${key}`);

      const roomFitsConstraints = (r: (typeof rooms)[number]): boolean => {
        if (!isFree(r)) return false;
        if (maxAllowedFloor !== null && r.floor > maxAllowedFloor) return false;
        if (checkCapacity && csInfo.courseStudentCount > r.capacity) return false;
        if (requiredEquipTag) {
          const tags = Array.isArray(r.equipmentTags) ? r.equipmentTags.map((t) => String(t)) : [];
          if (!tags.some((t) => t.toLowerCase() === requiredEquipTag.toLowerCase())) return false;
        }
        return true;
      };

      const pickOtherClassroom = (): string | null => {
        // Priorizar salas de clase no asignadas como sala base de ningún curso ("Otras salas de clases")
        const freeOtherStrict = rooms.find(
          (r) => r.roomType === "CLASSROOM" && !courseHomeRoomIds.has(r.id) && roomFitsConstraints(r)
        );
        if (freeOtherStrict) return freeOtherStrict.id;
        const freeOtherRelaxed = rooms.find(
          (r) => r.roomType === "CLASSROOM" && !courseHomeRoomIds.has(r.id) && isFree(r)
        );
        if (freeOtherRelaxed) return freeOtherRelaxed.id;
        // Si es un grupo sincronizado, permitir salas base paralelas del mismo grupo
        if (csInfo.syncGroupCode) {
          const syncRooms = syncGroupHomeRooms.get(csInfo.syncGroupCode);
          if (syncRooms) {
            const parallel = rooms.find((r) => syncRooms.has(r.id) && isFree(r));
            if (parallel) return parallel.id;
          }
        }
        return null;
      };

      const pickSyncParallelHomeRoom = (): string | null => {
        if (!csInfo.syncGroupCode) return null;
        const syncRooms = syncGroupHomeRooms.get(csInfo.syncGroupCode);
        if (!syncRooms) return null;
        const strict = rooms.find(
          (r) => syncRooms.has(r.id) && r.id !== csInfo.defaultRoomId && roomFitsConstraints(r)
        );
        if (strict) return strict.id;
        const relaxed = rooms.find(
          (r) => syncRooms.has(r.id) && r.id !== csInfo.defaultRoomId && isFree(r)
        );
        return relaxed?.id ?? null;
      };

      const defaultRoom = csInfo.defaultRoomId
        ? rooms.find((r) => r.id === csInfo.defaultRoomId)
        : undefined;

      // 1. Modo sala fija estricta por curso: siempre usar la sala base del curso (o paralela en sync)
      if (roomAssignmentMode === "FIXED_COURSE_STRICT") {
        if (defaultRoom && roomFitsConstraints(defaultRoom)) {
          return defaultRoom.id;
        }
        const syncParallel = pickSyncParallelHomeRoom();
        if (syncParallel) return syncParallel;
        // Desdoblamiento del mismo curso en el mismo bloque: la segunda mitad usa otra sala de clases
        if (csInfo.defaultRoomId && excludeRoomIds.has(csInfo.defaultRoomId)) {
          const other = pickOtherClassroom();
          if (other) return other;
        }
        if (!allowFallback) {
          return csInfo.defaultRoomId ? null : pickOtherClassroom();
        }
        return pickOtherClassroom() ?? (defaultRoom && isFree(defaultRoom) ? defaultRoom.id : null);
      }

      // 2. Modo sala fija + recintos especiales o salas por asignatura
      // 2a. Sala específica elegida en Asignaturas
      if (csInfo.requiredRoomId) {
        const specificRoom = rooms.find((r) => r.id === csInfo.requiredRoomId);
        if (specificRoom && roomFitsConstraints(specificRoom)) {
          return specificRoom.id;
        }
        if (specificRoom && isFree(specificRoom)) {
          return specificRoom.id;
        }
        if (!allowFallback) return null;
        // Respaldo flexible: otra sala del mismo tipo (sin tocar salas base ajenas) u "Otra sala de clases"
        if (csInfo.requiresRoomType) {
          const sameType = rooms.find(
            (r) =>
              r.roomType === csInfo.requiresRoomType &&
              !isProtectedForeignHomeRoom(r.id, csInfo) &&
              (csInfo.requiresRoomType !== "CLASSROOM" || !courseHomeRoomIds.has(r.id)) &&
              isFree(r)
          );
          if (sameType) return sameType.id;
        }
        return pickOtherClassroom();
      }

      // 2b. Tipo de recinto requerido (Otra sala de clases, Laboratorio, Gimnasio, Computación)
      if (csInfo.requiresRoomType) {
        const isAllowedForType = (r: (typeof rooms)[number]): boolean => {
          if (r.roomType !== csInfo.requiresRoomType) return false;
          if (isProtectedForeignHomeRoom(r.id, csInfo)) return false;
          if (csInfo.requiresRoomType === "CLASSROOM" && courseHomeRoomIds.has(r.id)) {
            return false;
          }
          return true;
        };

        const strictCandidate = rooms.find((r) => isAllowedForType(r) && roomFitsConstraints(r));
        if (strictCandidate) return strictCandidate.id;

        const relaxedCandidate = rooms.find((r) => isAllowedForType(r) && isFree(r));
        if (relaxedCandidate) return relaxedCandidate.id;

        // En grupos sincronizados con "Otra sala de clases", permitir sala paralela del grupo si no hay otra libre
        if (csInfo.requiresRoomType === "CLASSROOM") {
          const syncParallel = pickSyncParallelHomeRoom();
          if (syncParallel) return syncParallel;
        }

        if (!allowFallback) return null;
        return pickOtherClassroom();
      }

      // 2c. "Sala normal del curso" (requiresRoomType === null && requiredRoomId === null)
      if (requiredEquipTag) {
        if (defaultRoom && roomFitsConstraints(defaultRoom)) {
          return defaultRoom.id;
        }
        const eqCandidate = rooms.find(
          (r) => !isProtectedForeignHomeRoom(r.id, csInfo) && roomFitsConstraints(r)
        );
        if (eqCandidate) return eqCandidate.id;
      }

      if (defaultRoom) {
        if (roomFitsConstraints(defaultRoom)) {
          return defaultRoom.id;
        }
        // En grupos sincronizados, permitir sala base paralela de otro curso del mismo grupo
        const syncParallel = pickSyncParallelHomeRoom();
        if (syncParallel) return syncParallel;

        // Si el mismo curso está desdoblado en el mismo bloque (ej. Artes + Música),
        // la primera mitad ocupa la sala base y la segunda usa una de las "Otras salas de clases"
        if (excludeRoomIds.has(defaultRoom.id)) {
          const other = pickOtherClassroom();
          if (other) return other;
        }

        // En pasada estricta, devolver null para que el generador busque otro bloque donde la sala del curso esté libre
        if (!allowFallback) return null;

        // Respaldo flexible (solo si no cupo en ningún bloque con su sala base)
        return pickOtherClassroom();
      }

      // Curso sin sala base configurada: usar "Otras salas de clases" (sin invadir salas base ajenas)
      return pickOtherClassroom();
    };

    const maxDailySubjRule = rules.find((r) => r.ruleType === "MAX_DAILY_BLOCKS_PER_SUBJECT");
    const maxDailySubjLimit = maxDailySubjRule ? getRuleParamNumber(maxDailySubjRule, "max", 2) : 2;
    const prefRules = rules.filter((r) => r.ruleType === "SUBJECT_PREFERRED_TIME_RANGE");
    const postLunchRules = rules.filter((r) => r.ruleType === "NO_SUBJECT_POST_LUNCH");
    const compactnessRules = rules.filter((r) => r.ruleType === "TEACHER_DAY_COMPACTNESS");
    const dailyLimitRules = rules.filter((r) => r.ruleType === "TEACHER_DAILY_BLOCKS_LIMIT");
    const lunchBreakRules = rules.filter((r) => r.ruleType === "TEACHER_GUARANTEED_LUNCH_BREAK");
    const deptMeetingRules = rules.filter((r) => r.ruleType === "SYNCED_DEPARTMENT_MEETING");
    const daySpacingRules = rules.filter((r) => r.ruleType === "SUBJECT_MIN_DAY_SPACING");
    const cogLoadRules = rules.filter((r) => r.ruleType === "MAX_DAILY_COGNITIVE_LOAD");
    const extendedBlockRules = rules.filter((r) => r.ruleType === "EXTENDED_BLOCKS_POLICY");
    const precedenceRules = rules.filter((r) => r.ruleType === "SUBJECT_PRECEDENCE");

    const getExtendedBlockSizeForCS = (
      csInfo: NonNullable<ReturnType<typeof csLookup.get>>
    ): number => {
      for (const r of extendedBlockRules) {
        if (ruleMatchesTarget(r, { subjectId: csInfo.subjectId, courseId: csInfo.courseId })) {
          return Math.max(2, getRuleParamNumber(r, "blockSize", 3));
        }
      }
      return 0;
    };

    const canPlaceHard = (
      csInfo: NonNullable<ReturnType<typeof csLookup.get>>,
      slot: InternalSlot,
      allowExceedDailySubject = false,
      allowOverQuota = false
    ): boolean => {
      const key = `${slot.dayOfWeek}:${slot.blockNumber}`;
      if (courseBusy.has(`${csInfo.courseId}:${key}`)) return false;

      // Sin ventanas en cursos: restringir al prefijo compacto 1..quota del día
      if (!allowCourseWindows && !allowOverQuota) {
        const quota = courseDayQuota.get(`${csInfo.courseId}:${slot.dayOfWeek}`);
        if (quota !== undefined && slot.blockNumber > quota) return false;
      }

      // Restricción HARD post-almuerzo
      const lunchInfo = lunchBlockByBell.get(slot.bellScheduleId);
      if (lunchInfo) {
        for (const r of postLunchRules) {
          if (
            r.weight === "HARD" &&
            ruleMatchesTarget(r, { subjectId: csInfo.subjectId, courseId: csInfo.courseId })
          ) {
            const blocksAfter = Math.max(1, getRuleParamNumber(r, "blocksAfterLunch", 1));
            if (
              slot.blockNumber >= lunchInfo.afterBlock &&
              slot.blockNumber < lunchInfo.afterBlock + blocksAfter
            ) {
              return false;
            }
          }
        }
      }

      for (const tid of csInfo.teacherIds) {
        if (teacherBusy.has(`${tid}:${key}`)) return false;
        if (isTeacherUnavailable(tid, slot.dayOfWeek, slot.blockNumber, rules)) return false;
        const tInfo = teacherMap.get(tid);
        const dayLoad = teacherDayCount.get(`${tid}:${slot.dayOfWeek}`) ?? 0;
        if (tInfo && dayLoad >= tInfo.maxDailyHours) return false;

        // Ventana de colación garantizada HARD
        for (const r of lunchBreakRules) {
          if (r.weight !== "HARD" || !ruleMatchesTarget(r, { teacherId: tid })) continue;
          const startBlock = getRuleParamNumber(r, "startBlock", 4);
          const endBlock = getRuleParamNumber(r, "endBlock", 6);
          const minFree = getRuleParamNumber(r, "minFreeBlocks", 1);
          if (slot.blockNumber >= startBlock && slot.blockNumber <= endBlock) {
            let busyCount = 1; // contando el slot actual
            for (let b = startBlock; b <= endBlock; b++) {
              if (b !== slot.blockNumber && teacherBusy.has(`${tid}:${slot.dayOfWeek}:${b}`)) {
                busyCount++;
              }
            }
            const windowSize = Math.max(1, endBlock - startBlock + 1);
            if (windowSize - busyCount < minFree) return false;
          }
        }
      }

      const cdsKey = `${csInfo.courseId}:${slot.dayOfWeek}:${csInfo.subjectId}`;
      const existingBlocks = courseDaySubjectBlockNums.get(cdsKey) ?? [];
      const extSize = getExtendedBlockSizeForCS(csInfo);
      const effectiveDailyLimit = Math.max(maxDailySubjLimit, extSize);
      if (!allowExceedDailySubject && existingBlocks.length >= effectiveDailyLimit) {
        return false;
      }

      // Siempre que haya 2 o más bloques de la misma asignatura en un día, DEBEN ser consecutivos
      if (existingBlocks.length > 0) {
        const isAdjacent = existingBlocks.some((b) => Math.abs(b - slot.blockNumber) === 1);
        if (!isAdjacent) return false;
      }

      return true;
    };

    const scoreSlot = (
      csInfo: NonNullable<ReturnType<typeof csLookup.get>>,
      slot: InternalSlot
    ): number => {
      let cost = 0;

      // Cuando no se permiten ventanas de curso, priorizar llenar estrictamente desde el Bloque 1 hacia abajo
      if (!allowCourseWindows) {
        let emptyBefore = 0;
        for (let b = 1; b < slot.blockNumber; b++) {
          if (!courseBusy.has(`${csInfo.courseId}:${slot.dayOfWeek}:${b}`)) {
            emptyBefore++;
          }
        }
        cost += emptyBefore * 45;
      }

      // Preferencia de franja horaria por asignatura
      for (const r of prefRules) {
        if (r.targetEntityType === "SUBJECT" && r.targetEntityId === csInfo.subjectId) {
          const params = (r.parameters ?? {}) as { period?: string; maxBlock?: number; minBlock?: number };
          if (params.period === "MORNING" && slot.blockNumber > (params.maxBlock ?? 4)) {
            cost += r.penaltyScore;
          }
          if (params.period === "AFTERNOON" && slot.blockNumber < (params.minBlock ?? 5)) {
            cost += r.penaltyScore;
          }
        }
      }

      // Restricción post-almuerzo SOFT
      const lunchInfo = lunchBlockByBell.get(slot.bellScheduleId);
      if (lunchInfo) {
        for (const r of postLunchRules) {
          if (ruleMatchesTarget(r, { subjectId: csInfo.subjectId, courseId: csInfo.courseId })) {
            const blocksAfter = Math.max(1, getRuleParamNumber(r, "blocksAfterLunch", 1));
            if (
              slot.blockNumber >= lunchInfo.afterBlock &&
              slot.blockNumber < lunchInfo.afterBlock + blocksAfter
            ) {
              cost += r.penaltyScore || 30;
            }
          }
        }
      }

      // Carga cognitiva máxima diaria
      const currentCogLoad = courseDayCognitiveMap.get(`${csInfo.courseId}:${slot.dayOfWeek}`) ?? 0;
      for (const r of cogLoadRules) {
        if (ruleMatchesTarget(r, { courseId: csInfo.courseId })) {
          const maxLoad = getRuleParamNumber(r, "maxDailyLoad", 10);
          if (currentCogLoad + csInfo.subjectCognitiveWeight > maxLoad) {
            cost += (r.penaltyScore || 25) * (currentCogLoad + csInfo.subjectCognitiveWeight - maxLoad);
          }
        }
      }

      // Separación mínima entre días
      const usedDays = courseSubjectDaysMap.get(csInfo.courseSubjectId);
      if (usedDays && !usedDays.has(slot.dayOfWeek)) {
        for (const r of daySpacingRules) {
          if (ruleMatchesTarget(r, { subjectId: csInfo.subjectId, courseId: csInfo.courseId })) {
            const minDays = getRuleParamNumber(r, "minDaysBetween", 1);
            for (const d of usedDays) {
              if (Math.abs(d - slot.dayOfWeek) - 1 < minDays) {
                cost += r.penaltyScore || 22;
              }
            }
          }
        }
      }

      // Precedencia (Teoría antes de Taller/Laboratorio)
      for (const r of precedenceRules) {
        const params = (r.parameters ?? {}) as {
          prerequisiteSubjectId?: string;
          dependentSubjectId?: string;
        };
        if (csInfo.subjectId === params.dependentSubjectId && params.prerequisiteSubjectId) {
          const prereqEntries = placedEntries.filter(
            (e) => e.courseId === csInfo.courseId && e.subjectId === params.prerequisiteSubjectId
          );
          if (prereqEntries.length === 0) {
            cost += (r.penaltyScore || 30) * 2;
          } else {
            const minPrereqOrder = Math.min(
              ...prereqEntries.map((e) => {
                const s = slotMap.get(e.timeSlotId);
                return s ? s.dayOfWeek * 100 + s.blockNumber : 9999;
              })
            );
            if (slot.dayOfWeek * 100 + slot.blockNumber < minPrereqOrder) {
              cost += (r.penaltyScore || 30) * 2;
            }
          }
        }
      }

      // Evitar sobrecarga de bloques consecutivos por docente (por defecto > 4 bloques seguidos)
      const maxConsRuleForSolver = rules.find(
        (r) => r.ruleType === "MAX_CONSECUTIVE_TEACHER_BLOCKS"
      );
      const maxConsLimitForSolver = maxConsRuleForSolver
        ? getRuleParamNumber(maxConsRuleForSolver, "max", 4)
        : 4;
      const maxConsPenaltyForSolver = maxConsRuleForSolver
        ? maxConsRuleForSolver.penaltyScore
        : 25;

      for (const tid of csInfo.teacherIds) {
        let before = 0;
        while (teacherBusy.has(`${tid}:${slot.dayOfWeek}:${slot.blockNumber - 1 - before}`)) {
          before++;
        }
        let after = 0;
        while (teacherBusy.has(`${tid}:${slot.dayOfWeek}:${slot.blockNumber + 1 + after}`)) {
          after++;
        }
        const consecutiveRun = before + 1 + after;
        if (consecutiveRun > maxConsLimitForSolver) {
          cost += (consecutiveRun - maxConsLimitForSolver) * maxConsPenaltyForSolver;
        }

        // Compactación de días docentes: preferir días donde ya tiene clases
        const dayCount = teacherDayCount.get(`${tid}:${slot.dayOfWeek}`) ?? 0;
        for (const r of compactnessRules) {
          if (ruleMatchesTarget(r, { teacherId: tid })) {
            if (dayCount > 0) {
              cost -= 18;
            } else {
              let activeDays = 0;
              for (let d = 1; d <= 5; d++) {
                if ((teacherDayCount.get(`${tid}:${d}`) ?? 0) > 0) activeDays++;
              }
              const maxDays = getRuleParamNumber(r, "maxDays", 0);
              if (maxDays > 0 && activeDays >= maxDays) {
                cost += (r.penaltyScore || 35) * 2;
              } else {
                cost += Math.round((r.penaltyScore || 35) * 0.5);
              }
            }
          }
        }

        // Mínimo y máximo diario docente
        for (const r of dailyLimitRules) {
          if (ruleMatchesTarget(r, { teacherId: tid })) {
            const minD = getRuleParamNumber(r, "min", 2);
            const maxD = getRuleParamNumber(r, "max", 7);
            if (dayCount > 0 && dayCount < minD) cost -= 15;
            if (dayCount + 1 > maxD) cost += r.penaltyScore || 25;
          }
        }

        // Reuniones sincronizadas: evitar ocupar el último slot común libre
        for (const r of deptMeetingRules) {
          const params = (r.parameters ?? {}) as { teacherIds?: string[] };
          if (Array.isArray(params.teacherIds) && params.teacherIds.includes(tid)) {
            const othersFree = params.teacherIds.every(
              (otherId) =>
                otherId === tid ||
                (!teacherBusy.has(`${otherId}:${slot.dayOfWeek}:${slot.blockNumber}`) &&
                  !isTeacherUnavailable(otherId, slot.dayOfWeek, slot.blockNumber, rules))
            );
            if (othersFree) {
              cost += 12; // Preferir no quemar slots donde todos están libres
            }
          }
        }
      }

      // Distribución equilibrada semanal: preferir días donde aún no se dicta la asignatura,
      // pero si ya existe 1 bloque ese día (consecutivo), premiar mismo pairGroupId
      const cdsKey = `${csInfo.courseId}:${slot.dayOfWeek}:${csInfo.subjectId}`;
      const existingBlocks = courseDaySubjectBlockNums.get(cdsKey) ?? [];
      if (existingBlocks.length > 0) {
        const bellSlots = classSlotsByBell.get(csInfo.bellScheduleId) ?? [];
        const adjSlot = bellSlots.find(
          (s) => s.dayOfWeek === slot.dayOfWeek && s.blockNumber === existingBlocks[0]
        );
        if (adjSlot && adjSlot.pairGroupId !== null && adjSlot.pairGroupId === slot.pairGroupId) {
          cost -= 20; // Quedan en el mismo par entre recreos
        } else {
          cost += 25; // Separado por recreo/almuerzo
        }
      }

      // Evitar viernes última hora para asignaturas densas
      if (slot.dayOfWeek === 5 && slot.blockNumber >= 7) {
        cost += 6;
      }

      return cost;
    };

    // 1.5 Pre-colocar bloques fijos / anclados (FIXED_SUBJECT_SLOT)
    const fixedSlotRules = rules.filter((r) => r.ruleType === "FIXED_SUBJECT_SLOT");
    for (const rule of fixedSlotRules) {
      const params = (rule.parameters ?? {}) as {
        dayOfWeek?: number;
        blockNumber?: number;
        courseId?: string;
      };
      const targetDay = Number(params.dayOfWeek ?? 1);
      const targetBlock = Number(params.blockNumber ?? 1);
      for (const csInfo of csLookup.values()) {
        if (!ruleMatchesTarget(rule, { subjectId: csInfo.subjectId, courseId: csInfo.courseId })) {
          continue;
        }
        if (params.courseId && csInfo.courseId !== params.courseId) continue;
        const alreadyPlaced = lockedCountByCS.get(csInfo.courseSubjectId) ?? 0;
        if (alreadyPlaced >= csInfo.weeklyBlocks) continue;

        const bellSlots = classSlotsByBell.get(csInfo.bellScheduleId) ?? [];
        const targetSlot = bellSlots.find(
          (s) => s.dayOfWeek === targetDay && s.blockNumber === targetBlock
        );
        if (!targetSlot) continue;
        if (!canPlaceHard(csInfo, targetSlot, true, true)) continue;
        const roomId = pickRoom(csInfo, targetSlot, undefined, false) ?? pickRoom(csInfo, targetSlot, undefined, true);
        if (roomId) {
          markPlaced(csInfo, targetSlot, roomId, false);
          lockedCountByCS.set(csInfo.courseSubjectId, alreadyPlaced + 1);
        }
      }
    }

    // Preparar grupos sincronizados (sync_group_code) y asignaturas independientes
    const syncGroupsMap = new Map<string, Array<NonNullable<ReturnType<typeof csLookup.get>>>>();
    const standaloneCS: Array<NonNullable<ReturnType<typeof csLookup.get>>> = [];

    for (const csInfo of csLookup.values()) {
      if (csInfo.syncGroupCode) {
        const arr = syncGroupsMap.get(csInfo.syncGroupCode) ?? [];
        arr.push(csInfo);
        syncGroupsMap.set(csInfo.syncGroupCode, arr);
      } else {
        standaloneCS.push(csInfo);
      }
    }

    // 1.6 Pre-colocar bloques fijos / anclados de grupos sincronizados (FIXED_SYNC_GROUP_SLOT - siempre HARD)
    const fixedSyncSlotRules = rules.filter((r) => r.ruleType === "FIXED_SYNC_GROUP_SLOT");
    for (const rule of fixedSyncSlotRules) {
      const params = (rule.parameters ?? {}) as {
        syncGroupCode?: string;
        dayOfWeek?: number;
        blockNumber?: number;
        blockNumbers?: number[];
      };
      const syncCode = typeof params.syncGroupCode === "string" ? params.syncGroupCode.trim() : "";
      if (!syncCode) continue;
      const groupItems = syncGroupsMap.get(syncCode);
      if (!groupItems || groupItems.length === 0) continue;

      const targetDay = Number(params.dayOfWeek ?? 1);
      const rawBlocks =
        Array.isArray(params.blockNumbers) && params.blockNumbers.length > 0
          ? params.blockNumbers
          : params.blockNumber !== undefined
            ? [params.blockNumber]
            : [1];
      const targetBlocks = [...new Set(rawBlocks.map(Number).filter((n) => Number.isInteger(n) && n >= 1))].sort(
        (a, b) => a - b
      );

      for (const targetBlock of targetBlocks) {
        const usedRooms = new Set<string>();
        const roomBySyncSubject = new Map<string, string>();
        const pendingAssignments: Array<{
          item: (typeof groupItems)[number];
          slot: InternalSlot;
          roomId: string;
        }> = [];
        let canPlaceAll = true;

        for (const item of groupItems) {
          const bellSlots = classSlotsByBell.get(item.bellScheduleId) ?? [];
          const targetSlot = bellSlots.find(
            (s) => s.dayOfWeek === targetDay && s.blockNumber === targetBlock
          );
          if (!targetSlot) {
            canPlaceAll = false;
            break;
          }

          // Si ya está colocado en este slot (ej. bloqueo manual previo), no duplicar
          const alreadyInSlot = placedEntries.some(
            (e) => e.courseSubjectId === item.courseSubjectId && e.timeSlotId === targetSlot.id
          );
          if (alreadyInSlot) continue;

          const alreadyPlaced = lockedCountByCS.get(item.courseSubjectId) ?? 0;
          if (alreadyPlaced >= item.weeklyBlocks) {
            canPlaceAll = false;
            break;
          }
          if (!canPlaceHard(item, targetSlot, true, true)) {
            canPlaceAll = false;
            break;
          }
          const sharedRoomId = roomBySyncSubject.get(item.subjectId);
          const roomId =
            sharedRoomId ??
            pickRoom(item, targetSlot, usedRooms, false) ??
            pickRoom(item, targetSlot, usedRooms, true);
          if (!roomId) {
            canPlaceAll = false;
            break;
          }
          if (!sharedRoomId) {
            roomBySyncSubject.set(item.subjectId, roomId);
            usedRooms.add(roomId);
          }
          pendingAssignments.push({ item, slot: targetSlot, roomId });
        }

        if (canPlaceAll) {
          for (const pa of pendingAssignments) {
            markPlaced(pa.item, pa.slot, pa.roomId, false);
            lockedCountByCS.set(
              pa.item.courseSubjectId,
              (lockedCountByCS.get(pa.item.courseSubjectId) ?? 0) + 1
            );
          }
        }
      }
    }

    // 2. Programar bloques restantes de grupos sincronizados (sync_group_code)
    let unplacedCount = 0;

    for (const [, groupItems] of syncGroupsMap) {
      const refItem = groupItems[0];
      const alreadyPlaced = lockedCountByCS.get(refItem.courseSubjectId) ?? 0;
      const remaining = Math.max(0, refItem.weeklyBlocks - alreadyPlaced);
      const bellSlots = classSlotsByBell.get(refItem.bellScheduleId) ?? [];

      let toPlace = remaining;
      while (toPlace > 0) {
        // Encontrar el mejor slot compatible con TODOS los miembros del grupo sincronizado
        const candidates = bellSlots
          .filter((slot) =>
            groupItems.every((item) => canPlaceHard(item, slot))
          )
          .map((slot) => ({
            slot,
            cost: groupItems.reduce((sum, item) => sum + scoreSlot(item, slot), 0),
          }))
          .sort((a, b) => a.cost - b.cost);

        let placedHere = false;
        for (const allowFallback of [false, true]) {
          for (const cand of candidates) {
            const usedRooms = new Set<string>();
            const roomBySyncSubject = new Map<string, string>();
            const roomAssignments: Array<{ item: typeof refItem; roomId: string }> = [];
            let allGotRooms = true;

            for (const item of groupItems) {
              const sharedRoomId = roomBySyncSubject.get(item.subjectId);
              const roomId = sharedRoomId ?? pickRoom(item, cand.slot, usedRooms, allowFallback);
              if (!roomId) {
                allGotRooms = false;
                break;
              }
              if (!sharedRoomId) {
                roomBySyncSubject.set(item.subjectId, roomId);
                usedRooms.add(roomId);
              }
              roomAssignments.push({ item, roomId });
            }

            if (allGotRooms) {
              for (const ra of roomAssignments) {
                markPlaced(ra.item, cand.slot, ra.roomId, false);
              }
              placedHere = true;
              break;
            }
          }
          if (placedHere) break;
        }

        if (!placedHere) {
          unplacedCount += groupItems.length;
          break;
        }
        toPlace--;
      }
    }

    // 3. Ordenar courseSubjects restantes por MRV (más restringidos primero: sala específica > sala especial > codocencia > consecutivos > mayor carga)
    standaloneCS.sort((a, b) => {
      const weightA =
        (a.requiredRoomId ? 150 : a.requiresRoomType ? 100 : 0) +
        (a.teacherIds.length > 1 ? 50 : 0) +
        (a.requiresConsecutiveBlocks ? 30 : 0) +
        a.weeklyBlocks * 5;
      const weightB =
        (b.requiredRoomId ? 150 : b.requiresRoomType ? 100 : 0) +
        (b.teacherIds.length > 1 ? 50 : 0) +
        (b.requiresConsecutiveBlocks ? 30 : 0) +
        b.weeklyBlocks * 5;
      return weightB - weightA;
    });

    for (const csInfo of standaloneCS) {
      const alreadyPlaced = lockedCountByCS.get(csInfo.courseSubjectId) ?? 0;
      let remaining = Math.max(0, csInfo.weeklyBlocks - alreadyPlaced);
      const bellSlots = classSlotsByBell.get(csInfo.bellScheduleId) ?? [];

      // Intentar colocar bloques extendidos (triples/cuádruples/TP) si aplica EXTENDED_BLOCKS_POLICY
      const extBlockSize = getExtendedBlockSizeForCS(csInfo);
      if (extBlockSize >= 3) {
        while (remaining >= extBlockSize) {
          const extCandidates: Array<{ slots: InternalSlot[]; cost: number }> = [];
          for (let i = 0; i <= bellSlots.length - extBlockSize; i++) {
            const slice = bellSlots.slice(i, i + extBlockSize);
            let contiguous = true;
            for (let j = 1; j < slice.length; j++) {
              if (
                slice[j].dayOfWeek !== slice[0].dayOfWeek ||
                slice[j].blockNumber !== slice[j - 1].blockNumber + 1
              ) {
                contiguous = false;
                break;
              }
            }
            if (!contiguous) continue;
            const existingDay =
              courseDaySubjectCount.get(
                `${csInfo.courseId}:${slice[0].dayOfWeek}:${csInfo.subjectId}`
              ) ?? 0;
            if (existingDay > 0) continue;
            if (slice.every((s) => canPlaceHard(csInfo, s))) {
              const totalCost = slice.reduce((acc, s) => acc + scoreSlot(csInfo, s), 0);
              extCandidates.push({ slots: slice, cost: totalCost });
            }
          }
          extCandidates.sort((a, b) => a.cost - b.cost);
          let extPlaced = false;
          for (const allowFallback of [false, true]) {
            for (const ec of extCandidates) {
              const pickedRooms: string[] = [];
              let allRoomsOk = true;
              for (const s of ec.slots) {
                const rId =
                  pickedRooms.length > 0 &&
                  !roomBusy.has(`${pickedRooms[0]}:${s.dayOfWeek}:${s.blockNumber}`)
                    ? pickedRooms[0]
                    : pickRoom(csInfo, s, undefined, allowFallback);
                if (!rId) {
                  allRoomsOk = false;
                  break;
                }
                pickedRooms.push(rId);
              }
              if (allRoomsOk) {
                ec.slots.forEach((s, idx) => markPlaced(csInfo, s, pickedRooms[idx], false));
                remaining -= extBlockSize;
                extPlaced = true;
                break;
              }
            }
            if (extPlaced) break;
          }
          if (!extPlaced) break;
        }
      }

      // Intentar colocar pares consecutivos primero si requiresConsecutiveBlocks = true
      if (csInfo.requiresConsecutiveBlocks) {
        while (remaining >= 2) {
          // Construir pares de slots contiguos en el mismo día, priorizando mismo pairGroupId
          const pairCandidates: Array<{ a: InternalSlot; b: InternalSlot; cost: number }> = [];
          for (let i = 0; i < bellSlots.length - 1; i++) {
            const a = bellSlots[i];
            const b = bellSlots[i + 1];
            if (a.dayOfWeek !== b.dayOfWeek || b.blockNumber !== a.blockNumber + 1) continue;
            // Verificar que el curso no tenga ya esta asignatura ese día
            const existingDay =
              courseDaySubjectCount.get(`${csInfo.courseId}:${a.dayOfWeek}:${csInfo.subjectId}`) ?? 0;
            if (existingDay > 0) continue;

            if (canPlaceHard(csInfo, a) && canPlaceHard(csInfo, b)) {
              const samePairBonus =
                a.pairGroupId !== null && a.pairGroupId === b.pairGroupId ? -25 : 20;
              pairCandidates.push({
                a,
                b,
                cost: scoreSlot(csInfo, a) + scoreSlot(csInfo, b) + samePairBonus,
              });
            }
          }

          pairCandidates.sort((x, y) => x.cost - y.cost);
          let pairPlaced = false;
          for (const allowFallback of [false, true]) {
            for (const pc of pairCandidates) {
              const roomA = pickRoom(csInfo, pc.a, undefined, allowFallback);
              const roomB = roomA && !roomBusy.has(`${roomA}:${pc.b.dayOfWeek}:${pc.b.blockNumber}`)
                ? roomA
                : pickRoom(csInfo, pc.b, undefined, allowFallback);
              if (roomA && roomB) {
                markPlaced(csInfo, pc.a, roomA, false);
                markPlaced(csInfo, pc.b, roomB, false);
                remaining -= 2;
                pairPlaced = true;
                break;
              }
            }
            if (pairPlaced) break;
          }

          if (!pairPlaced) break;
        }
      }

      // Colocar bloques individuales restantes
      while (remaining > 0) {
        let candidates = bellSlots
          .filter((slot) => canPlaceHard(csInfo, slot, false, false))
          .map((slot) => ({ slot, cost: scoreSlot(csInfo, slot) }))
          .sort((a, b) => a.cost - b.cost);

        // Fallback 1: permitir extender la cuota diaria del curso (manteniendo consecutividad)
        if (candidates.length === 0) {
          candidates = bellSlots
            .filter((slot) => canPlaceHard(csInfo, slot, false, true))
            .map((slot) => ({ slot, cost: scoreSlot(csInfo, slot) + 30 }))
            .sort((a, b) => a.cost - b.cost);
        }

        // Fallback 2: relajar límite diario de asignatura (manteniendo consecutividad)
        if (candidates.length === 0) {
          candidates = bellSlots
            .filter((slot) => canPlaceHard(csInfo, slot, true, true))
            .map((slot) => ({ slot, cost: scoreSlot(csInfo, slot) + 60 }))
            .sort((a, b) => a.cost - b.cost);
        }

        let placedSingle = false;
        for (const allowFallback of [false, true]) {
          for (const cand of candidates) {
            const roomId = pickRoom(csInfo, cand.slot, undefined, allowFallback);
            if (roomId) {
              markPlaced(csInfo, cand.slot, roomId, false);
              remaining--;
              placedSingle = true;
              break;
            }
          }
          if (placedSingle) break;
        }

        if (!placedSingle) {
          unplacedCount += remaining;
          break;
        }
      }
    }

    // 3.5 Compactación y eliminación de ventanas de curso (cuando !allowCourseWindows)
    if (!allowCourseWindows) {
      for (let pass = 0; pass < 3; pass++) {
        let fixedAny = false;
        for (const course of courses) {
          const bellSlots = classSlotsByBell.get(course.bellScheduleId) ?? [];
          for (let day = 1; day <= 5; day++) {
            const daySlots = bellSlots
              .filter((s) => s.dayOfWeek === day)
              .sort((a, b) => a.blockNumber - b.blockNumber);
            const dayEntries = placedEntries.filter((e) => {
              const s = slotMap.get(e.timeSlotId);
              return e.courseId === course.id && s?.dayOfWeek === day;
            });
            if (dayEntries.length === 0) continue;

            for (const targetSlot of daySlots) {
              const isOccupied = dayEntries.some((e) => e.timeSlotId === targetSlot.id);
              if (isOccupied) continue;

              const laterEntries = dayEntries
                .filter((e) => {
                  const s = slotMap.get(e.timeSlotId);
                  return (
                    s &&
                    s.blockNumber > targetSlot.blockNumber &&
                    !e.isLocked &&
                    !e.syncGroupCode
                  );
                })
                .sort((a, b) => {
                  const sb = slotMap.get(b.timeSlotId)?.blockNumber ?? 0;
                  const sa = slotMap.get(a.timeSlotId)?.blockNumber ?? 0;
                  return sb - sa;
                });

              if (laterEntries.length === 0) break;

              const beforeAudit = evaluateScheduleState(
                placedEntries,
                slotMap,
                classSlotsByBell,
                nonTeachingMap,
                teacherMap,
                roomMap,
                rules,
                lunchBlockByBell
              );

              let resolvedGap = false;

              // Intento 1: deslizar el bloque más tardío (o su par completo si es bloque doble) hacia el hueco
              for (const candidate of laterEntries) {
                const candSlot = slotMap.get(candidate.timeSlotId);
                if (!candSlot) continue;

                // Detectar si pertenece a un bloque doble el mismo día
                const sameDayGroup = dayEntries
                  .filter(
                    (e) =>
                      e.courseSubjectId === candidate.courseSubjectId &&
                      !e.isLocked &&
                      !e.syncGroupCode
                  )
                  .sort(
                    (a, b) =>
                      (slotMap.get(a.timeSlotId)?.blockNumber ?? 0) -
                      (slotMap.get(b.timeSlotId)?.blockNumber ?? 0)
                  );

                if (sameDayGroup.length === 2) {
                  const targetNext = daySlots.find(
                    (s) => s.blockNumber === targetSlot.blockNumber + 1
                  );
                  const nextOccupied =
                    !targetNext ||
                    dayEntries.some(
                      (e) =>
                        e.timeSlotId === targetNext.id &&
                        e.id !== sameDayGroup[0].id &&
                        e.id !== sameDayGroup[1].id
                    );
                  if (targetNext && !nextOccupied) {
                    const orig0 = sameDayGroup[0].timeSlotId;
                    const orig1 = sameDayGroup[1].timeSlotId;
                    sameDayGroup[0].timeSlotId = targetSlot.id;
                    sameDayGroup[1].timeSlotId = targetNext.id;
                    const afterAudit = evaluateScheduleState(
                      placedEntries,
                      slotMap,
                      classSlotsByBell,
                      nonTeachingMap,
                      teacherMap,
                      roomMap,
                      rules,
                      lunchBlockByBell
                    );
                    if (afterAudit.hardCount < beforeAudit.hardCount) {
                      resolvedGap = true;
                      fixedAny = true;
                      break;
                    }
                    sameDayGroup[0].timeSlotId = orig0;
                    sameDayGroup[1].timeSlotId = orig1;
                    continue;
                  }
                }

                const origSlotId = candidate.timeSlotId;
                candidate.timeSlotId = targetSlot.id;
                const afterAudit = evaluateScheduleState(
                  placedEntries,
                  slotMap,
                  classSlotsByBell,
                  nonTeachingMap,
                  teacherMap,
                  roomMap,
                  rules,
                  lunchBlockByBell
                );
                if (afterAudit.hardCount < beforeAudit.hardCount) {
                  resolvedGap = true;
                  fixedAny = true;
                  break;
                }
                candidate.timeSlotId = origSlotId;
              }

              // Intento 2: mover el bloque tardío al siguiente bloque compacto de otro día
              if (!resolvedGap) {
                const candidate = laterEntries[0];
                const origSlotId = candidate.timeSlotId;
                for (let otherDay = 1; otherDay <= 5 && !resolvedGap; otherDay++) {
                  if (otherDay === day) continue;
                  const otherDayEntries = placedEntries.filter((e) => {
                    const s = slotMap.get(e.timeSlotId);
                    return e.courseId === course.id && s?.dayOfWeek === otherDay;
                  });
                  const occupiedBlocks = new Set(
                    otherDayEntries.map((e) => slotMap.get(e.timeSlotId)?.blockNumber ?? 0)
                  );
                  let nextCompactBlock = 1;
                  while (occupiedBlocks.has(nextCompactBlock)) nextCompactBlock++;
                  const nextSlot = bellSlots.find(
                    (s) => s.dayOfWeek === otherDay && s.blockNumber === nextCompactBlock
                  );
                  if (!nextSlot) continue;

                  candidate.timeSlotId = nextSlot.id;
                  const afterAudit = evaluateScheduleState(
                    placedEntries,
                    slotMap,
                    classSlotsByBell,
                    nonTeachingMap,
                    teacherMap,
                    roomMap,
                    rules,
                    lunchBlockByBell
                  );
                  if (afterAudit.hardCount < beforeAudit.hardCount) {
                    resolvedGap = true;
                    fixedAny = true;
                    break;
                  }
                  candidate.timeSlotId = origSlotId;
                }
              }

              // Intento 3: permutar el bloque tardío con otro bloque del mismo curso cuyo profesor sí pueda llenar el hueco
              if (!resolvedGap) {
                const candidate = laterEntries[0];
                const otherEntries = placedEntries.filter(
                  (e) =>
                    e.courseId === course.id &&
                    e.id !== candidate.id &&
                    !e.isLocked &&
                    !e.syncGroupCode
                );
                for (const other of otherEntries) {
                  const origCand = candidate.timeSlotId;
                  const origOther = other.timeSlotId;
                  // Mover `other` al hueco y `candidate` al lugar que dejó `other`
                  other.timeSlotId = targetSlot.id;
                  candidate.timeSlotId = origOther;
                  const afterAudit = evaluateScheduleState(
                    placedEntries,
                    slotMap,
                    classSlotsByBell,
                    nonTeachingMap,
                    teacherMap,
                    roomMap,
                    rules,
                    lunchBlockByBell
                  );
                  if (afterAudit.hardCount < beforeAudit.hardCount) {
                    resolvedGap = true;
                    fixedAny = true;
                    break;
                  }
                  other.timeSlotId = origOther;
                  candidate.timeSlotId = origCand;
                }
              }
            }
          }
        }
        if (!fixedAny) break;
      }
    }

    // 4. Fase de optimización local (Hill-Climbing sobre intercambios de bloques no fijados del mismo curso)
    let bestAudit = evaluateScheduleState(
      placedEntries,
      slotMap,
      classSlotsByBell,
      nonTeachingMap,
      teacherMap,
      roomMap,
      rules,
      lunchBlockByBell
    );

    const maxSteps = options.maxOptimizationSteps ?? 60;
    const movableByCourse = new Map<string, number[]>();
    placedEntries.forEach((entry, idx) => {
      if (!entry.isLocked && !entry.syncGroupCode) {
        const arr = movableByCourse.get(entry.courseId) ?? [];
        arr.push(idx);
        movableByCourse.set(entry.courseId, arr);
      }
    });

    for (let step = 0; step < maxSteps; step++) {
      let improved = false;
      for (const [, indices] of movableByCourse) {
        if (indices.length < 2) continue;
        // Probar intercambios determinísticos entre pares de entradas del mismo curso
        for (let i = 0; i < Math.min(indices.length, 10); i++) {
          const idxA = indices[(i + step) % indices.length];
          const idxB = indices[(i + step + 1) % indices.length];
          if (idxA === idxB) continue;

          const entryA = placedEntries[idxA];
          const entryB = placedEntries[idxB];
          if (entryA.courseSubjectId === entryB.courseSubjectId) continue;

          // Swap temporal de timeSlotId
          const origSlotA = entryA.timeSlotId;
          const origSlotB = entryB.timeSlotId;
          entryA.timeSlotId = origSlotB;
          entryB.timeSlotId = origSlotA;

          const candidateAudit = evaluateScheduleState(
            placedEntries,
            slotMap,
            classSlotsByBell,
            nonTeachingMap,
            teacherMap,
            roomMap,
            rules,
            lunchBlockByBell
          );

          if (
            candidateAudit.hardCount <= bestAudit.hardCount &&
            candidateAudit.totalPenalty < bestAudit.totalPenalty
          ) {
            bestAudit = candidateAudit;
            improved = true;
          } else {
            // Revertir
            entryA.timeSlotId = origSlotA;
            entryB.timeSlotId = origSlotB;
          }
        }
      }
      if (!improved) break;
    }

    // 4.5 Apoyos parciales (PIE / codocencia) y Aula de Recursos.
    // Con los bloques ya ubicados, se elige en cuáles participa cada docente de apoyo según su
    // disponibilidad y, para el PIE, en cuáles trabaja en el Aula de Recursos (sala aparte).
    assignSupportTeachers({
      courses,
      rooms,
      rules,
      placedEntries,
      slotMap,
      teacherMap,
      baseActivities,
    });
    bestAudit = evaluateScheduleState(
      placedEntries,
      slotMap,
      classSlotsByBell,
      nonTeachingMap,
      teacherMap,
      roomMap,
      rules,
      lunchBlockByBell,
      supportExpectations
    );

    // 5. Persistir la nueva ScheduleVersion y sus entradas
    const existingCount = await prisma.scheduleVersion.count({ where: { schoolId } });
    const versionName = options.name?.trim() || `Borrador v${existingCount + 1}`;

    const createdVersion = await prisma.$transaction(async (tx) => {
      const version = await tx.scheduleVersion.create({
        data: {
          schoolId,
          name: versionName,
          status: "DRAFT",
          versionLockNumber: 1,
          fitnessScore: bestAudit.fitnessScore,
          aiSuggestions: Prisma.JsonNull,
        },
      });

      if (placedEntries.length > 0) {
        const withIds = placedEntries.map((e) => ({ entry: e, id: crypto.randomUUID() }));
        await tx.scheduleEntry.createMany({
          data: withIds.map(({ entry: e, id }) => ({
            id,
            versionId: version.id,
            courseSubjectId: e.courseSubjectId,
            timeSlotId: e.timeSlotId,
            roomId: e.roomId,
            isLocked: e.isLocked,
          })),
        });
        const participantRows = withIds.flatMap(({ entry: e, id }) =>
          [...new Set(e.teacherIds)].map((teacherId) => ({
            entryId: id,
            teacherId,
            roomId: e.teacherRooms?.[teacherId] ?? null,
          }))
        );
        if (participantRows.length > 0) {
          await tx.scheduleEntryTeacher.createMany({ data: participantRows });
        }
      }

      if (baseActivities.length > 0) {
        await tx.teacherNonTeachingActivity.createMany({
          data: baseActivities.map((a) => ({
            versionId: version.id,
            teacherId: a.teacherId,
            timeSlotId: a.timeSlotId,
            activityType: a.activityType,
            title: a.title,
            roomId: a.roomId,
          })),
        });
      }

      return version;
    });

    return {
      version: createdVersion,
      audit: bestAudit,
      placedCount: placedEntries.length,
      unplacedCount,
    };
  },

  /**
   * Audita una versión de horario existente y devuelve todos los conflictos HARD y SOFT.
   */
  async detectConflicts(versionId: string): Promise<ConflictAuditResult> {
    const version = await prisma.scheduleVersion.findUnique({
      where: { id: versionId },
      include: {
        entries: {
          include: {
            courseSubject: {
              include: {
                course: true,
                subject: true,
                teachers: true,
              },
            },
            timeSlot: true,
            room: true,
            teachers: { select: { teacherId: true, roomId: true } },
          },
        },
        nonTeachingActivities: true,
      },
    });

    if (!version) {
      throw new Error("Versión de horario no encontrada.");
    }

    const { bellSchedules, rooms, teachers, courses, rules } = await loadSchoolContext(version.schoolId);

    const slotMap = new Map<string, InternalSlot>();
    const classSlotsByBell = new Map<string, InternalSlot[]>();
    for (const bs of bellSchedules) {
      const classSlots: InternalSlot[] = [];
      for (const s of bs.timeSlots) {
        const internal: InternalSlot = {
          id: s.id,
          bellScheduleId: s.bellScheduleId,
          dayOfWeek: s.dayOfWeek,
          blockNumber: s.blockNumber,
          pairGroupId: s.pairGroupId,
          startTime: s.startTime,
          endTime: s.endTime,
          slotType: s.slotType,
        };
        slotMap.set(s.id, internal);
        if (s.slotType === "CLASS") classSlots.push(internal);
      }
      classSlotsByBell.set(bs.id, classSlots);
    }

    const nonTeachingMap = new Map<string, Array<{ teacherId: string; title: string }>>();
    for (const act of version.nonTeachingActivities) {
      const arr = nonTeachingMap.get(act.timeSlotId) ?? [];
      arr.push({ teacherId: act.teacherId, title: act.title });
      nonTeachingMap.set(act.timeSlotId, arr);
    }

    const teacherMap = buildTeacherEvalMap(teachers, courses, bellSchedules, rules);
    const roomMap = buildRoomMap(rooms);
    const lunchBlockByBell = buildLunchBlockMap(bellSchedules);
    const supportExpectations = buildSupportExpectations(courses);

    const internalEntries: InternalEntry[] = version.entries.map((e) => ({
      id: e.id,
      courseSubjectId: e.courseSubjectId,
      courseId: e.courseSubject.courseId,
      defaultRoomId: e.courseSubject.course.defaultRoomId,
      subjectId: e.courseSubject.subjectId,
      subjectCode: e.courseSubject.subject.code,
      subjectName: e.courseSubject.subject.name,
      courseName: e.courseSubject.course.name,
      requiresRoomType: e.courseSubject.subject.requiresRoomType,
      requiredRoomId: e.courseSubject.subject.requiredRoomId,
      requiresConsecutiveBlocks: e.courseSubject.requiresConsecutiveBlocks,
      syncGroupCode: e.courseSubject.syncGroupCode,
      ...toInternalParticipants(e),
      timeSlotId: e.timeSlotId,
      roomId: e.roomId,
      isLocked: e.isLocked,
      courseStudentCount: e.courseSubject.course.studentCount,
      courseRequiresGroundFloor: e.courseSubject.course.requiresGroundFloor,
      subjectCognitiveWeight: e.courseSubject.subject.cognitiveWeight,
      subjectRequiredEquipment: e.courseSubject.subject.requiredEquipment,
    }));

    return evaluateScheduleState(
      internalEntries,
      slotMap,
      classSlotsByBell,
      nonTeachingMap,
      teacherMap,
      roomMap,
      rules,
      lunchBlockByBell,
      supportExpectations
    );
  },

  /**
   * Evalúa en memoria (sin persistir) el impacto de mover o intercambiar bloques desde drag & drop.
   */
  async simulateSwap(versionId: string, payload: SimulateSwapPayload) {
    const version = await prisma.scheduleVersion.findUnique({
      where: { id: versionId },
      include: {
        entries: {
          include: {
            courseSubject: {
              include: { course: true, subject: true, teachers: true },
            },
            timeSlot: true,
            room: true,
            teachers: { select: { teacherId: true, roomId: true } },
          },
        },
        nonTeachingActivities: true,
      },
    });
    if (!version) throw new Error("Versión de horario no encontrada.");

    const { bellSchedules, rooms, teachers, courses, rules } = await loadSchoolContext(version.schoolId);
    const slotMap = new Map<string, InternalSlot>();
    const classSlotsByBell = new Map<string, InternalSlot[]>();
    for (const bs of bellSchedules) {
      const classSlots: InternalSlot[] = [];
      for (const s of bs.timeSlots) {
        const internal: InternalSlot = {
          id: s.id,
          bellScheduleId: s.bellScheduleId,
          dayOfWeek: s.dayOfWeek,
          blockNumber: s.blockNumber,
          pairGroupId: s.pairGroupId,
          startTime: s.startTime,
          endTime: s.endTime,
          slotType: s.slotType,
        };
        slotMap.set(s.id, internal);
        if (s.slotType === "CLASS") classSlots.push(internal);
      }
      classSlotsByBell.set(bs.id, classSlots);
    }

    const nonTeachingMap = new Map<string, Array<{ teacherId: string; title: string }>>();
    for (const act of version.nonTeachingActivities) {
      const arr = nonTeachingMap.get(act.timeSlotId) ?? [];
      arr.push({ teacherId: act.teacherId, title: act.title });
      nonTeachingMap.set(act.timeSlotId, arr);
    }

    const teacherMap = buildTeacherEvalMap(teachers, courses, bellSchedules, rules);
    const roomMap = buildRoomMap(rooms);
    const lunchBlockByBell = buildLunchBlockMap(bellSchedules);
    const supportExpectations = buildSupportExpectations(courses);

    const toInternal = (): InternalEntry[] =>
      version.entries.map((e) => ({
        id: e.id,
        courseSubjectId: e.courseSubjectId,
        courseId: e.courseSubject.courseId,
        defaultRoomId: e.courseSubject.course.defaultRoomId,
        subjectId: e.courseSubject.subjectId,
        subjectCode: e.courseSubject.subject.code,
        subjectName: e.courseSubject.subject.name,
        courseName: e.courseSubject.course.name,
        requiresRoomType: e.courseSubject.subject.requiresRoomType,
        requiredRoomId: e.courseSubject.subject.requiredRoomId,
        requiresConsecutiveBlocks: e.courseSubject.requiresConsecutiveBlocks,
        syncGroupCode: e.courseSubject.syncGroupCode,
        ...toInternalParticipants(e),
        timeSlotId: e.timeSlotId,
        roomId: e.roomId,
        isLocked: e.isLocked,
        courseStudentCount: e.courseSubject.course.studentCount,
        courseRequiresGroundFloor: e.courseSubject.course.requiresGroundFloor,
        subjectCognitiveWeight: e.courseSubject.subject.cognitiveWeight,
        subjectRequiredEquipment: e.courseSubject.subject.requiredEquipment,
      }));

    const beforeEntries = toInternal();
    const beforeAudit = evaluateScheduleState(
      beforeEntries,
      slotMap,
      classSlotsByBell,
      nonTeachingMap,
      teacherMap,
      roomMap,
      rules,
      lunchBlockByBell,
      supportExpectations
    );

    const afterEntries = toInternal();
    const entryA = afterEntries.find((e) => e.id === payload.entryAId);
    if (!entryA) throw new Error("Bloque origen no encontrado.");

    const getGroupEntries = (anchor: InternalEntry): InternalEntry[] => {
      const anchorSlot = slotMap.get(anchor.timeSlotId);
      if (!anchor.syncGroupCode || !anchorSlot) return [anchor];
      return afterEntries.filter((e) => {
        if (e.syncGroupCode !== anchor.syncGroupCode) return false;
        const s = slotMap.get(e.timeSlotId);
        return (
          s !== undefined &&
          s.dayOfWeek === anchorSlot.dayOfWeek &&
          s.blockNumber === anchorSlot.blockNumber
        );
      });
    };

    const resolveSlotForEntry = (
      entry: InternalEntry,
      targetDay: number,
      targetBlock: number
    ): InternalSlot => {
      const currentSlot = slotMap.get(entry.timeSlotId);
      const bellId = currentSlot?.bellScheduleId;
      const candidate = (bellId ? classSlotsByBell.get(bellId) : undefined)?.find(
        (s) => s.dayOfWeek === targetDay && s.blockNumber === targetBlock
      );
      if (!candidate) {
        throw new Error(
          `El curso ${entry.courseName}${entry.syncGroupCode ? ` (grupo "${entry.syncGroupCode}")` : ""} no tiene bloque disponible en Día ${targetDay}, Bloque ${targetBlock}.`
        );
      }
      return candidate;
    };

    if (payload.mode === "SWAP" && payload.entryBId) {
      const entryB = afterEntries.find((e) => e.id === payload.entryBId);
      if (!entryB) throw new Error("Bloque destino no encontrado.");
      const slotA = slotMap.get(entryA.timeSlotId);
      const slotB = slotMap.get(entryB.timeSlotId);
      if (!slotA || !slotB) throw new Error("Bloque horario no encontrado.");

      const groupA = getGroupEntries(entryA);
      const groupB = getGroupEntries(entryB);
      const groupAIds = new Set(groupA.map((e) => e.id));
      const sameGroupSlot = groupB.some((e) => groupAIds.has(e.id));

      if (!sameGroupSlot) {
        if (groupA.some((e) => e.isLocked) || groupB.some((e) => e.isLocked)) {
          throw new Error("Uno o más bloques del grupo sincronizado están fijados con candado.");
        }
        const movesA = groupA.map((e) => ({
          entry: e,
          destSlot: resolveSlotForEntry(e, slotB.dayOfWeek, slotB.blockNumber),
        }));
        const movesB = groupB.map((e) => ({
          entry: e,
          destSlot: resolveSlotForEntry(e, slotA.dayOfWeek, slotA.blockNumber),
        }));
        for (const m of movesA) m.entry.timeSlotId = m.destSlot.id;
        for (const m of movesB) m.entry.timeSlotId = m.destSlot.id;
      }
    } else if (payload.mode === "MOVE" && payload.targetTimeSlotId) {
      const targetSlot = slotMap.get(payload.targetTimeSlotId);
      if (!targetSlot) throw new Error("Bloque horario destino no encontrado.");
      const groupA = getGroupEntries(entryA);
      if (groupA.some((e) => e.isLocked)) {
        throw new Error("Uno o más bloques del grupo sincronizado están fijados con candado.");
      }
      const movesA = groupA.map((e) => ({
        entry: e,
        destSlot: resolveSlotForEntry(e, targetSlot.dayOfWeek, targetSlot.blockNumber),
      }));
      for (const m of movesA) {
        m.entry.timeSlotId = m.destSlot.id;
      }
      if (groupA.length === 1 && payload.targetRoomId) {
        entryA.roomId = payload.targetRoomId;
      }
    }

    const afterAudit = evaluateScheduleState(
      afterEntries,
      slotMap,
      classSlotsByBell,
      nonTeachingMap,
      teacherMap,
      roomMap,
      rules,
      lunchBlockByBell,
      supportExpectations
    );

    const beforeHardIds = new Set(beforeAudit.hardConflicts.map((c) => c.message));
    const afterHardIds = new Set(afterAudit.hardConflicts.map((c) => c.message));

    const newHardConflicts = afterAudit.hardConflicts.filter(
      (c) => !beforeHardIds.has(c.message)
    );
    const resolvedHardConflicts = beforeAudit.hardConflicts.filter(
      (c) => !afterHardIds.has(c.message)
    );

    return {
      valid: newHardConflicts.length === 0,
      beforeFitness: beforeAudit.fitnessScore,
      afterFitness: afterAudit.fitnessScore,
      deltaFitness: Number((afterAudit.fitnessScore - beforeAudit.fitnessScore).toFixed(1)),
      newHardConflicts,
      resolvedHardConflicts,
      afterSoftCount: afterAudit.softCount,
    };
  },
};
