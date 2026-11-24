import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import {
  calculateLegalMaxTeachingBlocks,
  extractLey20903Policy,
  formatMinutesToTime,
  normalizeTeacherLey20903Override,
  parseTimeToMinutes,
  resolveBlockDurationMinutes,
  resolveTeacherLey20903Ratio,
  LEY_20903_RATIO_LABELS,
  TEACHER_AUTO_PALETTE,
} from "@/lib/scheduling/constants";
import type {
  LevelCode,
  Prisma,
  RoomType,
  RuleTargetEntityType,
  RuleWeight,
  SchedulingRuleType,
} from "@prisma/client";

export interface CreateSchoolInput {
  name: string;
  rbd: string;
  commune: string;
  academicYear: number;
}

export interface CreateAdminInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface TimeGridConfig {
  startTime: string; // e.g. "08:00"
  blockDurationMinutes: number; // e.g. 45
  blocksPerDay: number; // e.g. 8 or 9
  blocksPerDayByDay?: Record<number, number>; // e.g. { 1: 8, 2: 8, 3: 8, 4: 8, 5: 6 }
  days?: number[]; // default [1,2,3,4,5]
  breaks: Array<{ afterBlock: number; durationMinutes: number; type: "BREAK" | "LUNCH" }>;
}

export interface UpsertSchedulingRuleInput {
  id?: string;
  ruleType: SchedulingRuleType;
  weight: RuleWeight;
  penaltyScore: number;
  targetEntityType: RuleTargetEntityType;
  targetEntityId?: string | null;
  parameters: Record<string, unknown>;
}

export interface DryRunIssue {
  severity: "ERROR" | "WARNING";
  sheet: string;
  row: number;
  message: string;
}

export interface DryRunImportResult {
  valid: boolean;
  summary: {
    teachers: number;
    rooms: number;
    subjects: number;
    courses: number;
    assignments: number;
  };
  issues: DryRunIssue[];
  preview: {
    teachers: Array<{ firstName: string; lastName: string; email: string; contractHours: number; maxTeachingBlocks: number }>;
    rooms: Array<{ name: string; capacity: number; roomType: RoomType }>;
    subjects: Array<{ name: string; code: string; requiresRoomType: RoomType | null }>;
    courses: Array<{ name: string; code: string; levelCode: LevelCode }>;
  };
}

function normalizeStr(v: unknown): string {
  return String(v ?? "").trim();
}

function normalizeKey(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseRoomType(raw: string): RoomType {
  const up = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if ((up.includes("LAB") && up.includes("COMP")) || up.includes("COMPUT") || up.includes("ENLACE")) {
    return "COMPUTER_LAB";
  }
  if (up.includes("IDIOM") || up.includes("INGLES") || up.includes("LANGU")) return "LANGUAGE_LAB";
  if (up.includes("LAB") || up.includes("CIENC") || up.includes("QUIM") || up.includes("BIO") || up.includes("FISIC")) {
    return "LAB";
  }
  if (up.includes("BIBLIOT") || up.includes("CRA")) return "LIBRARY_CRA";
  if (up.includes("PIE") || up.includes("APOYO") || up.includes("RECURSO")) return "PIE_ROOM";
  if (up.includes("MUSIC")) return "MUSIC_ROOM";
  if (up.includes("ARTE") || up.includes("ART_")) return "ART_ROOM";
  if (up.includes("AUDITOR") || up.includes("SALON DE ACTOS")) return "AUDITORIUM";
  if (up.includes("PATIO") || up.includes("MULTICANCHA")) return "PATIO";
  if (up.includes("GYM") || up.includes("GIMN") || up.includes("CANCH")) return "GYM";
  if (up.includes("TP") || up.includes("TECNICO")) return "WORKSHOP_TP";
  if (up.includes("MULTIUSO") || up.includes("TALLER") || up.includes("DANZA")) return "MULTIPURPOSE";
  return "CLASSROOM";
}

function parseLevelCode(raw: string): LevelCode {
  const up = raw.toUpperCase();
  if (up === "BASIC_1_4" || up.includes("1_4") || up.includes("1° B") || up.includes("2° B") || up.includes("3° B") || up.includes("4° B")) {
    return "BASIC_1_4";
  }
  if (up === "BASIC_5_8" || up.includes("5_8") || up.includes("5° B") || up.includes("6° B") || up.includes("7° B") || up.includes("8° B")) {
    return "BASIC_5_8";
  }
  if (up === "MEDIA_3_4" || up.includes("3_4") || up.includes("3° M") || up.includes("4° M")) {
    return "MEDIA_3_4";
  }
  return "MEDIA_1_2";
}

function validateRuleParameters(
  ruleType: SchedulingRuleType,
  parameters: Record<string, unknown>
): void {
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
    throw new Error("El campo parameters debe ser un objeto JSON válido.");
  }
  switch (ruleType) {
    case "TEACHER_UNAVAILABILITY": {
      if (parameters.unavailableDays !== undefined && !Array.isArray(parameters.unavailableDays)) {
        throw new Error("unavailableDays debe ser un arreglo de números (1-5).");
      }
      if (parameters.unavailableBlocks !== undefined && !Array.isArray(parameters.unavailableBlocks)) {
        throw new Error("unavailableBlocks debe ser un arreglo de { day, block }.");
      }
      break;
    }
    case "MAX_TEACHER_WINDOWS":
    case "MAX_CONSECUTIVE_TEACHER_BLOCKS":
    case "MAX_DAILY_BLOCKS_PER_SUBJECT": {
      const maxVal = Number(parameters.max ?? 2);
      if (!Number.isFinite(maxVal) || maxVal < 0) {
        throw new Error("El parámetro 'max' debe ser un número entero mayor o igual a 0.");
      }
      break;
    }
    case "SUBJECT_PREFERRED_TIME_RANGE": {
      const period = String(parameters.period ?? "MORNING");
      if (!["MORNING", "AFTERNOON", "CUSTOM"].includes(period)) {
        throw new Error("El parámetro 'period' debe ser MORNING, AFTERNOON o CUSTOM.");
      }
      break;
    }
    case "LEY_20903_POLICY": {
      if (
        parameters.defaultRatio !== undefined &&
        !["65_35", "60_40"].includes(String(parameters.defaultRatio))
      ) {
        throw new Error("defaultRatio debe ser '65_35' o '60_40'.");
      }
      if (parameters.breakMinutesPerBlock !== undefined) {
        const bm = Number(parameters.breakMinutesPerBlock);
        if (!Number.isFinite(bm) || bm < 0 || bm > 20) {
          throw new Error("breakMinutesPerBlock debe estar entre 0 y 20 minutos.");
        }
      }
      if (parameters.blockDurationMinutes !== undefined) {
        const bd = Number(parameters.blockDurationMinutes);
        if (!Number.isFinite(bd) || bd < 0 || bd > 120) {
          throw new Error("blockDurationMinutes debe estar entre 0 (automático) y 120 minutos.");
        }
      }
      break;
    }
    case "TEACHER_DAY_COMPACTNESS": {
      if (parameters.maxDays !== undefined) {
        const md = Number(parameters.maxDays);
        if (!Number.isFinite(md) || md < 0 || md > 5) {
          throw new Error("maxDays debe estar entre 0 (automático) y 5 días.");
        }
      }
      break;
    }
    case "TEACHER_DAILY_BLOCKS_LIMIT": {
      const min = Number(parameters.min ?? 2);
      const max = Number(parameters.max ?? 7);
      if (!Number.isFinite(min) || min < 0 || !Number.isFinite(max) || max < min) {
        throw new Error("min y max deben ser enteros válidos con max >= min.");
      }
      break;
    }
    case "TEACHER_GUARANTEED_LUNCH_BREAK": {
      const startBlock = Number(parameters.startBlock ?? 4);
      const endBlock = Number(parameters.endBlock ?? 6);
      const minFreeBlocks = Number(parameters.minFreeBlocks ?? 1);
      if (
        !Number.isFinite(startBlock) ||
        !Number.isFinite(endBlock) ||
        startBlock < 1 ||
        endBlock < startBlock ||
        !Number.isFinite(minFreeBlocks) ||
        minFreeBlocks < 1
      ) {
        throw new Error("Rango de bloques de colación y minFreeBlocks deben ser válidos.");
      }
      break;
    }
    case "SYNCED_DEPARTMENT_MEETING": {
      if (!Array.isArray(parameters.teacherIds) || parameters.teacherIds.length < 2) {
        throw new Error("Debes seleccionar al menos 2 docentes para una reunión sincronizada.");
      }
      const reqBlocks = Number(parameters.requiredFreeBlocks ?? 1);
      if (!Number.isFinite(reqBlocks) || reqBlocks < 1) {
        throw new Error("requiredFreeBlocks debe ser al menos 1.");
      }
      break;
    }
    case "TEACHER_CAMPUS_TRAVEL": {
      const minGapBlocks = Number(parameters.minGapBlocks ?? 1);
      if (!Number.isFinite(minGapBlocks) || minGapBlocks < 0) {
        throw new Error("minGapBlocks debe ser >= 0.");
      }
      break;
    }
    case "EXTENDED_BLOCKS_POLICY": {
      const blockSize = Number(parameters.blockSize ?? 3);
      if (!Number.isFinite(blockSize) || blockSize < 2 || blockSize > 8) {
        throw new Error("blockSize debe estar entre 2 y 8 bloques.");
      }
      break;
    }
    case "FIXED_SUBJECT_SLOT": {
      const dayOfWeek = Number(parameters.dayOfWeek ?? 1);
      const blockNumber = Number(parameters.blockNumber ?? 1);
      if (
        !Number.isFinite(dayOfWeek) ||
        dayOfWeek < 1 ||
        dayOfWeek > 5 ||
        !Number.isFinite(blockNumber) ||
        blockNumber < 1
      ) {
        throw new Error("dayOfWeek (1-5) y blockNumber (>= 1) deben ser válidos.");
      }
      break;
    }
    case "FIXED_SYNC_GROUP_SLOT": {
      const syncGroupCode =
        typeof parameters.syncGroupCode === "string" ? parameters.syncGroupCode.trim() : "";
      if (!syncGroupCode) {
        throw new Error("Debes indicar el código del grupo sincronizado (syncGroupCode).");
      }
      const dayOfWeek = Number(parameters.dayOfWeek ?? 1);
      if (!Number.isFinite(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 5) {
        throw new Error("dayOfWeek debe estar entre 1 (Lunes) y 5 (Viernes).");
      }
      const rawBlocks = Array.isArray(parameters.blockNumbers)
        ? parameters.blockNumbers
        : parameters.blockNumber !== undefined
          ? [parameters.blockNumber]
          : [];
      const validBlocks = rawBlocks.map(Number).filter((n) => Number.isInteger(n) && n >= 1);
      if (validBlocks.length === 0) {
        throw new Error("Debes seleccionar al menos un bloque válido (>= 1) en blockNumbers.");
      }
      break;
    }
    case "SUBJECT_MIN_DAY_SPACING": {
      const minDaysBetween = Number(parameters.minDaysBetween ?? 1);
      if (!Number.isFinite(minDaysBetween) || minDaysBetween < 1 || minDaysBetween > 4) {
        throw new Error("minDaysBetween debe estar entre 1 y 4 días.");
      }
      break;
    }
    case "MAX_DAILY_COGNITIVE_LOAD": {
      const maxDailyLoad = Number(parameters.maxDailyLoad ?? 10);
      if (!Number.isFinite(maxDailyLoad) || maxDailyLoad < 1) {
        throw new Error("maxDailyLoad debe ser >= 1.");
      }
      break;
    }
    case "SUBJECT_PRECEDENCE": {
      if (!parameters.prerequisiteSubjectId || !parameters.dependentSubjectId) {
        throw new Error("Debes indicar la asignatura teórica previa y la asignatura práctica dependiente.");
      }
      if (parameters.prerequisiteSubjectId === parameters.dependentSubjectId) {
        throw new Error("La asignatura previa y la dependiente no pueden ser la misma.");
      }
      break;
    }
    case "ROOM_ACCESSIBILITY_FLOOR": {
      const maxFloor = Number(parameters.maxFloor ?? 1);
      if (!Number.isFinite(maxFloor) || maxFloor < 1) {
        throw new Error("maxFloor debe ser >= 1.");
      }
      break;
    }
    case "MINIMIZE_COURSE_ROOM_CHANGES": {
      const maxChangesPerDay = Number(parameters.maxChangesPerDay ?? 1);
      if (!Number.isFinite(maxChangesPerDay) || maxChangesPerDay < 0) {
        throw new Error("maxChangesPerDay debe ser >= 0.");
      }
      break;
    }
    default:
      break;
  }
}

export const SchoolSetupService = {
  /**
   * Crea un establecimiento educacional y su cuenta SCHOOL_ADMIN inicial en una transacción atómica.
   */
  async createSchoolWithAdmin(
    schoolData: CreateSchoolInput,
    adminData: CreateAdminInput
  ) {
    const normalizedEmail = adminData.email.trim().toLowerCase();
    const normalizedRbd = schoolData.rbd.trim();

    return prisma.$transaction(async (tx) => {
      const existingRbd = await tx.school.findUnique({
        where: { rbd: normalizedRbd },
      });
      if (existingRbd) {
        throw new Error(`Ya existe un colegio registrado con el RBD ${normalizedRbd}.`);
      }

      const existingUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existingUser) {
        throw new Error(`Ya existe una cuenta registrada con el correo ${normalizedEmail}.`);
      }

      const school = await tx.school.create({
        data: {
          name: schoolData.name.trim(),
          rbd: normalizedRbd,
          commune: schoolData.commune.trim(),
          academicYear: schoolData.academicYear,
          isActive: true,
        },
      });

      const admin = await tx.user.create({
        data: {
          schoolId: school.id,
          email: normalizedEmail,
          passwordHash: hashPassword(adminData.password),
          firstName: adminData.firstName.trim(),
          lastName: adminData.lastName.trim(),
          role: "SCHOOL_ADMIN",
          isActive: true,
        },
        select: {
          id: true,
          schoolId: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
        },
      });

      // Crear una jornada horaria base por defecto para que el establecimiento pueda operar de inmediato
      const defaultBell = await tx.bellSchedule.create({
        data: {
          schoolId: school.id,
          name: "Jornada General",
          applicableLevels: ["BASIC_1_4", "BASIC_5_8", "MEDIA_1_2", "MEDIA_3_4"],
        },
      });

      return { school, admin, defaultBell };
    });
  },

  /**
   * Genera automáticamente la matriz de time_slots (Lunes a Viernes) con recreos, almuerzo y pair_group_id.
   * Los bloques contiguos entre recreos comparten el mismo pair_group_id (1-2, 3-4, 5-6, 7-8).
   * Un bloque aislado al final (ej. bloque 9) queda con pair_group_id = null.
   */
  async generateTimeGrid(bellScheduleId: string, config: TimeGridConfig) {
    const days = config.days && config.days.length > 0 ? config.days : [1, 2, 3, 4, 5];
    const breakMap = new Map(
      config.breaks.map((b) => [b.afterBlock, { duration: b.durationMinutes, type: b.type }])
    );

    const startMinutes = parseTimeToMinutes(config.startTime);
    const slotsToCreate: Prisma.TimeSlotCreateManyInput[] = [];

    for (const day of days) {
      const dayBlocks = Math.max(
        1,
        Math.min(12, Math.floor(config.blocksPerDayByDay?.[day] ?? config.blocksPerDay))
      );
      let cursor = startMinutes;
      let pairGroup = 1;
      let blocksInSegment = 0;

      // Primero precalcular tamaños de segmentos entre recreos/almuerzos para determinar pair_group_id
      const segmentSizes: number[] = [];
      let currentSeg = 0;
      for (let b = 1; b <= dayBlocks; b++) {
        currentSeg++;
        const hasBreakAfter = breakMap.has(b) && b < dayBlocks;
        if (hasBreakAfter || b === dayBlocks) {
          segmentSizes.push(currentSeg);
          currentSeg = 0;
        }
      }

      let segIdx = 0;
      for (let block = 1; block <= dayBlocks; block++) {
        const segSize = segmentSizes[segIdx] ?? 1;
        // Si el segmento tiene 2 o más bloques, agrupar en pares contiguos; si es 1 bloque aislado (ej. bloque 9), null
        const assignedPairGroup =
          segSize >= 2 ? pairGroup + Math.floor(blocksInSegment / 2) : null;

        const blockStart = cursor;
        const blockEnd = cursor + config.blockDurationMinutes;
        cursor = blockEnd;
        blocksInSegment++;

        slotsToCreate.push({
          bellScheduleId,
          dayOfWeek: day,
          blockNumber: block,
          pairGroupId: assignedPairGroup,
          startTime: formatMinutesToTime(blockStart),
          endTime: formatMinutesToTime(blockEnd),
          durationMinutes: config.blockDurationMinutes,
          slotType: "CLASS",
        });

        const brk = breakMap.get(block);
        if (brk && block < dayBlocks) {
          const brkStart = cursor;
          const brkEnd = cursor + brk.duration;
          cursor = brkEnd;
          slotsToCreate.push({
            bellScheduleId,
            dayOfWeek: day,
            blockNumber: block * 100 + (brk.type === "LUNCH" ? 2 : 1),
            pairGroupId: null,
            startTime: formatMinutesToTime(brkStart),
            endTime: formatMinutesToTime(brkEnd),
            durationMinutes: brk.duration,
            slotType: brk.type,
          });
          if (segSize >= 2) {
            pairGroup += Math.ceil(segSize / 2);
          }
          blocksInSegment = 0;
          segIdx++;
        }
      }
    }

    return prisma.$transaction(async (tx) => {
      const existingSlots = await tx.timeSlot.findMany({
        where: { bellScheduleId },
      });

      const slotKey = (s: { dayOfWeek: number; slotType: string; blockNumber: number }) =>
        `${s.dayOfWeek}:${s.slotType}:${s.blockNumber}`;

      const existingByKey = new Map(existingSlots.map((s) => [slotKey(s), s]));
      const desiredKeys = new Set(
        slotsToCreate.map((s) =>
          slotKey({
            dayOfWeek: s.dayOfWeek,
            slotType: s.slotType ?? "CLASS",
            blockNumber: s.blockNumber,
          })
        )
      );

      const slotsToRemove = existingSlots.filter((s) => !desiredKeys.has(slotKey(s)));
      if (slotsToRemove.length > 0) {
        const removeIds = slotsToRemove.map((s) => s.id);
        await tx.scheduleEntry.deleteMany({
          where: { timeSlotId: { in: removeIds } },
        });
        await tx.teacherNonTeachingActivity.deleteMany({
          where: { timeSlotId: { in: removeIds } },
        });
        await tx.timeSlot.deleteMany({
          where: { id: { in: removeIds } },
        });
      }

      const toCreate: Prisma.TimeSlotCreateManyInput[] = [];
      for (const slot of slotsToCreate) {
        const key = slotKey({
          dayOfWeek: slot.dayOfWeek,
          slotType: slot.slotType ?? "CLASS",
          blockNumber: slot.blockNumber,
        });
        const existing = existingByKey.get(key);
        if (existing) {
          await tx.timeSlot.update({
            where: { id: existing.id },
            data: {
              pairGroupId: slot.pairGroupId ?? null,
              startTime: slot.startTime,
              endTime: slot.endTime,
              durationMinutes: slot.durationMinutes,
            },
          });
        } else {
          toCreate.push(slot);
        }
      }

      if (toCreate.length > 0) {
        await tx.timeSlot.createMany({
          data: toCreate,
        });
      }

      return tx.timeSlot.findMany({
        where: { bellScheduleId },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      });
    });
  },

  /**
   * Crea o actualiza una regla de scheduling_rules validando el esquema del campo parameters.
   */
  async upsertSchedulingRule(schoolId: string, payload: UpsertSchedulingRuleInput) {
    validateRuleParameters(payload.ruleType, payload.parameters);

    const isForcedHardSyncRule = payload.ruleType === "FIXED_SYNC_GROUP_SLOT";
    const resolvedWeight = isForcedHardSyncRule ? "HARD" : payload.weight;
    const resolvedPenalty = resolvedWeight === "HARD" ? 100 : payload.penaltyScore;
    const resolvedTargetType = isForcedHardSyncRule ? "GLOBAL" : payload.targetEntityType;
    const resolvedTargetId = isForcedHardSyncRule ? null : (payload.targetEntityId ?? null);

    if (payload.id) {
      return prisma.schedulingRule.update({
        where: { id: payload.id },
        data: {
          ruleType: payload.ruleType,
          weight: resolvedWeight,
          penaltyScore: resolvedPenalty,
          targetEntityType: resolvedTargetType,
          targetEntityId: resolvedTargetId,
          parameters: payload.parameters as Prisma.InputJsonValue,
        },
      });
    }

    return prisma.schedulingRule.create({
      data: {
        schoolId,
        ruleType: payload.ruleType,
        weight: resolvedWeight,
        penaltyScore: resolvedPenalty,
        targetEntityType: resolvedTargetType,
        targetEntityId: resolvedTargetId,
        parameters: payload.parameters as Prisma.InputJsonValue,
      },
    });
  },

  /**
   * Previsualiza y valida una carga masiva (Excel/CSV) antes de persistir.
   * Detecta duplicados con distinta ortografía, proporción Ley 20.903 y descuadres.
   */
  async dryRunImport(
    schoolId: string,
    fileBuffer: Buffer,
    fileName: string
  ): Promise<DryRunImportResult> {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const issues: DryRunIssue[] = [];

    const readSheet = (candidates: string[]): Array<Record<string, unknown>> => {
      for (const name of workbook.SheetNames) {
        if (candidates.some((c) => normalizeKey(name).includes(c))) {
          return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], {
            defval: "",
          });
        }
      }
      // Si es CSV de una sola hoja, devolver la primera hoja para detección de columnas
      if (workbook.SheetNames.length === 1 && fileName.toLowerCase().endsWith(".csv")) {
        return XLSX.utils.sheet_to_json<Record<string, unknown>>(
          workbook.Sheets[workbook.SheetNames[0]],
          { defval: "" }
        );
      }
      return [];
    };

    const teacherRows = readSheet(["profesor", "docente", "teacher"]);
    const roomRows = readSheet(["sala", "room", "espacio"]);
    const subjectRows = readSheet(["asignatura", "materia", "subject"]);
    const courseRows = readSheet(["curso", "course"]);

    const [schoolRules, schoolBells] = await Promise.all([
      prisma.schedulingRule.findMany({ where: { schoolId } }),
      prisma.bellSchedule.findMany({
        where: { schoolId },
        include: { timeSlots: true },
      }),
    ]);
    const leyPolicy = extractLey20903Policy(schoolRules);
    const blockDurationMinutes = resolveBlockDurationMinutes(schoolBells, leyPolicy);

    const teachers: DryRunImportResult["preview"]["teachers"] = [];
    const seenTeachers = new Map<string, number>();

    teacherRows.forEach((row, idx) => {
      const firstName = normalizeStr(row.first_name ?? row.nombre ?? row.Nombre);
      const lastName = normalizeStr(row.last_name ?? row.apellido ?? row.Apellido);
      const email = normalizeStr(row.email ?? row.correo ?? row.Email).toLowerCase();
      const contractHours = Number(row.contract_hours ?? row.horas_contrato ?? row.Contrato ?? 44);
      const ratioOverride = normalizeTeacherLey20903Override(
        row.ley_20903_ratio ?? row.proporcion ?? row.Proporcion ?? "AUTO"
      );
      const ratio = resolveTeacherLey20903Ratio(ratioOverride, false, leyPolicy);
      const legalMax = calculateLegalMaxTeachingBlocks(contractHours, {
        ratio,
        blockDurationMinutes,
        includeBreaksInTeaching: leyPolicy.includeBreaksInTeaching,
        breakMinutesPerBlock: leyPolicy.breakMinutesPerBlock,
      });
      const maxTeachingBlocks = Number(
        row.max_teaching_blocks ?? row.bloques_lectivos ?? legalMax
      );

      if (!firstName || !lastName) {
        issues.push({
          severity: "ERROR",
          sheet: "Profesores",
          row: idx + 2,
          message: "Falta nombre o apellido del docente.",
        });
        return;
      }

      const key = normalizeKey(`${firstName} ${lastName}`);
      if (seenTeachers.has(key)) {
        issues.push({
          severity: "WARNING",
          sheet: "Profesores",
          row: idx + 2,
          message: `Posible docente duplicado (coincide con fila ${seenTeachers.get(key)}): ${firstName} ${lastName}.`,
        });
      } else {
        seenTeachers.set(key, idx + 2);
      }

      if (maxTeachingBlocks > legalMax) {
        issues.push({
          severity: leyPolicy.strictEnforcement ? "ERROR" : "WARNING",
          sheet: "Profesores",
          row: idx + 2,
          message: `${firstName} ${lastName}: ${maxTeachingBlocks} bloques lectivos superan el tope Ley 20.903 (${LEY_20903_RATIO_LABELS[ratio]}) de ${legalMax} bloques para ${contractHours}h de contrato.`,
        });
      }

      teachers.push({ firstName, lastName, email, contractHours, maxTeachingBlocks });
    });

    const rooms: DryRunImportResult["preview"]["rooms"] = [];
    const seenRooms = new Set<string>();
    roomRows.forEach((row, idx) => {
      const name = normalizeStr(row.name ?? row.nombre ?? row.Sala);
      const capacity = Number(row.capacity ?? row.capacidad ?? 40);
      const roomType = parseRoomType(normalizeStr(row.room_type ?? row.tipo ?? "CLASSROOM"));
      if (!name) {
        issues.push({
          severity: "ERROR",
          sheet: "Salas",
          row: idx + 2,
          message: "Falta nombre de la sala.",
        });
        return;
      }
      const key = normalizeKey(name);
      if (seenRooms.has(key)) {
        issues.push({
          severity: "WARNING",
          sheet: "Salas",
          row: idx + 2,
          message: `Sala duplicada con distinta ortografía: "${name}".`,
        });
        return;
      }
      seenRooms.add(key);
      rooms.push({ name, capacity: Number.isFinite(capacity) ? capacity : 40, roomType });
    });

    const subjects: DryRunImportResult["preview"]["subjects"] = [];
    const seenSubjects = new Set<string>();
    subjectRows.forEach((row, idx) => {
      const name = normalizeStr(row.name ?? row.nombre ?? row.Asignatura);
      const code = normalizeStr(row.code ?? row.codigo ?? name.slice(0, 3)).toUpperCase();
      const rawRoom = normalizeStr(row.requires_room_type ?? row.sala_especial ?? "");
      const requiresRoomType = rawRoom ? parseRoomType(rawRoom) : null;
      if (!name) {
        issues.push({
          severity: "ERROR",
          sheet: "Asignaturas",
          row: idx + 2,
          message: "Falta nombre de la asignatura.",
        });
        return;
      }
      if (seenSubjects.has(code)) {
        issues.push({
          severity: "WARNING",
          sheet: "Asignaturas",
          row: idx + 2,
          message: `Código de asignatura duplicado: "${code}".`,
        });
        return;
      }
      seenSubjects.add(code);
      subjects.push({ name, code, requiresRoomType });
    });

    const courses: DryRunImportResult["preview"]["courses"] = [];
    const seenCourses = new Set<string>();
    courseRows.forEach((row, idx) => {
      const name = normalizeStr(row.name ?? row.nombre ?? row.Curso);
      const code = normalizeStr(row.code ?? row.codigo ?? name.replace(/\s+/g, "")).toUpperCase();
      const levelCode = parseLevelCode(normalizeStr(row.level_code ?? row.nivel ?? name));
      if (!name) {
        issues.push({
          severity: "ERROR",
          sheet: "Cursos",
          row: idx + 2,
          message: "Falta nombre del curso.",
        });
        return;
      }
      if (seenCourses.has(code)) {
        issues.push({
          severity: "WARNING",
          sheet: "Cursos",
          row: idx + 2,
          message: `Código de curso duplicado: "${code}".`,
        });
        return;
      }
      seenCourses.add(code);
      courses.push({ name, code, levelCode });
    });

    const existingBellCount = await prisma.bellSchedule.count({ where: { schoolId } });
    if (existingBellCount === 0 && courses.length > 0) {
      issues.push({
        severity: "WARNING",
        sheet: "Cursos",
        row: 1,
        message: "El colegio aún no tiene jornadas horarias; se creará una Jornada General al importar.",
      });
    }

    if (teachers.length === 0 && rooms.length === 0 && subjects.length === 0 && courses.length === 0) {
      issues.push({
        severity: "ERROR",
        sheet: "Archivo",
        row: 1,
        message:
          "No se detectaron hojas válidas (Profesores, Salas, Asignaturas o Cursos). Revisa los encabezados del archivo.",
      });
    }

    const hasErrors = issues.some((i) => i.severity === "ERROR");

    return {
      valid: !hasErrors,
      summary: {
        teachers: teachers.length,
        rooms: rooms.length,
        subjects: subjects.length,
        courses: courses.length,
        assignments: 0,
      },
      issues,
      preview: { teachers, rooms, subjects, courses },
    };
  },

  /**
   * Persiste profesores, salas, asignaturas y cursos validados tras dryRunImport.
   */
  async importAcademicData(schoolId: string, fileBuffer: Buffer, fileName: string) {
    const dryRun = await this.dryRunImport(schoolId, fileBuffer, fileName);
    if (!dryRun.valid) {
      return { imported: false, dryRun };
    }

    const palette = TEACHER_AUTO_PALETTE;

    await prisma.$transaction(async (tx) => {
      let defaultBell = await tx.bellSchedule.findFirst({
        where: { schoolId },
        orderBy: { createdAt: "asc" },
      });
      if (!defaultBell) {
        defaultBell = await tx.bellSchedule.create({
          data: {
            schoolId,
            name: "Jornada General",
            applicableLevels: ["BASIC_1_4", "BASIC_5_8", "MEDIA_1_2", "MEDIA_3_4"],
          },
        });
      }

      for (let i = 0; i < dryRun.preview.teachers.length; i++) {
        const t = dryRun.preview.teachers[i];
        await tx.teacher.create({
          data: {
            schoolId,
            firstName: t.firstName,
            lastName: t.lastName,
            email: t.email || null,
            contractHours: t.contractHours,
            maxTeachingBlocks: t.maxTeachingBlocks,
            maxDailyHours: 8,
            colorHex: palette[i % palette.length],
          },
        });
      }

      for (const r of dryRun.preview.rooms) {
        await tx.room.upsert({
          where: { schoolId_name: { schoolId, name: r.name } },
          update: { capacity: r.capacity, roomType: r.roomType },
          create: {
            schoolId,
            name: r.name,
            capacity: r.capacity,
            roomType: r.roomType,
          },
        });
      }

      for (const s of dryRun.preview.subjects) {
        await tx.subject.upsert({
          where: { schoolId_code: { schoolId, code: s.code } },
          update: { name: s.name, requiresRoomType: s.requiresRoomType },
          create: {
            schoolId,
            name: s.name,
            code: s.code,
            requiresRoomType: s.requiresRoomType,
          },
        });
      }

      for (const c of dryRun.preview.courses) {
        await tx.course.upsert({
          where: { schoolId_code: { schoolId, code: c.code } },
          update: { name: c.name, levelCode: c.levelCode },
          create: {
            schoolId,
            bellScheduleId: defaultBell.id,
            name: c.name,
            code: c.code,
            levelCode: c.levelCode,
          },
        });
      }
    });

    return { imported: true, dryRun };
  },
};
