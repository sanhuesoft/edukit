import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, resolveActiveSchoolId } from "@/lib/auth";
import {
  SchoolSetupService,
  type TimeGridConfig,
  type UpsertSchedulingRuleInput,
} from "@/services/SchoolSetupService";
import {
  calculateLegalMaxTeachingBlocks,
  extractLey20903Policy,
  normalizeTeacherLey20903Override,
  resolveBlockDurationMinutes,
  resolveTeacherLey20903Ratio,
} from "@/lib/scheduling/constants";
import type { LevelCode, Prisma, RoomType, TeacherAssignmentRole } from "@prisma/client";

const DEFAULT_AUTO_ROOM_CAPACITY = 45;

type TeacherAssignmentInput = {
  teacherId: string;
  role?: TeacherAssignmentRole;
  assignedBlocks?: number | null;
  resourceRoomBlocks?: number | null;
  resourceRoomId?: string | null;
};

/**
 * Limpia la configuración de un docente en una asignatura:
 * - assignedBlocks: null = participa en todos los bloques; si es >= weeklyBlocks se guarda null.
 * - resourceRoomBlocks / resourceRoomId: solo aplican al apoyo PIE (bloques en Aula de Recursos).
 */
function normalizeTeacherAssignment(
  t: TeacherAssignmentInput,
  weeklyBlocks: number,
  pieRoomIds: Set<string>
) {
  const role: TeacherAssignmentRole = t.role ?? "LEAD";
  const rawAssigned =
    t.assignedBlocks === null || t.assignedBlocks === undefined ? null : Math.round(Number(t.assignedBlocks));
  const assignedBlocks =
    rawAssigned === null || !Number.isFinite(rawAssigned) || rawAssigned >= weeklyBlocks
      ? null
      : Math.max(1, rawAssigned);
  const supportBlocks = assignedBlocks ?? weeklyBlocks;

  if (role !== "PIE_SUPPORT") {
    return { role, assignedBlocks, resourceRoomBlocks: 0, resourceRoomId: null };
  }
  const rawResource = Math.round(Number(t.resourceRoomBlocks ?? 0));
  const resourceRoomBlocks = Number.isFinite(rawResource)
    ? Math.min(supportBlocks, Math.max(0, rawResource))
    : 0;
  const resourceRoomId =
    resourceRoomBlocks > 0 && t.resourceRoomId && pieRoomIds.has(t.resourceRoomId)
      ? t.resourceRoomId
      : null;
  return { role, assignedBlocks, resourceRoomBlocks, resourceRoomId };
}

async function loadPieRoomIds(schoolId: string): Promise<Set<string>> {
  const rooms = await prisma.room.findMany({
    where: { schoolId, roomType: "PIE_ROOM" },
    select: { id: true },
  });
  return new Set(rooms.map((r) => r.id));
}

async function resolveAutoDefaultRoomId(
  tx: Prisma.TransactionClient,
  params: {
    schoolId: string;
    courseName: string;
    excludeCourseId?: string;
    capacity?: number;
  }
): Promise<string> {
  const trimmedCourseName = params.courseName.trim();
  if (!trimmedCourseName) {
    throw new Error("El nombre del curso es requerido para crear su sala base.");
  }

  const roomName = `Sala ${trimmedCourseName}`;
  const existingRoom = await tx.room.findUnique({
    where: { schoolId_name: { schoolId: params.schoolId, name: roomName } },
    include: {
      defaultForCourses: {
        select: { id: true, name: true },
      },
    },
  });

  if (existingRoom) {
    const otherCourse = existingRoom.defaultForCourses.find(
      (c) => c.id !== params.excludeCourseId
    );
    if (otherCourse) {
      throw new Error(
        `Ya existe "${roomName}" y está asignada como sala base del curso ${otherCourse.name}. Elige otra sala o "Sin sala fija".`
      );
    }
    return existingRoom.id;
  }

  const parsedCapacity = Number(params.capacity);
  const capacity =
    Number.isFinite(parsedCapacity) && parsedCapacity >= 1
      ? Math.round(parsedCapacity)
      : DEFAULT_AUTO_ROOM_CAPACITY;

  const createdRoom = await tx.room.create({
    data: {
      schoolId: params.schoolId,
      name: roomName,
      capacity,
      roomType: "CLASSROOM",
      floor: 1,
      equipmentTags: [],
    },
  });

  return createdRoom.id;
}

async function loadSchoolLey20903Context(schoolId: string) {
  const [rules, bellSchedules] = await Promise.all([
    prisma.schedulingRule.findMany({ where: { schoolId } }),
    prisma.bellSchedule.findMany({
      where: { schoolId },
      include: { timeSlots: true },
    }),
  ]);
  const policy = extractLey20903Policy(rules);
  const blockDurationMinutes = resolveBlockDurationMinutes(bellSchedules, policy);
  return { policy, blockDurationMinutes };
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
      entity: string;
      data: Record<string, unknown>;
    };

    switch (body.entity) {
      case "bellSchedule": {
        const name = String(body.data.name || "").trim();
        const applicableLevels = Array.isArray(body.data.applicableLevels)
          ? body.data.applicableLevels
          : ["MEDIA_1_2", "MEDIA_3_4"];
        if (!name) throw new Error("Nombre de jornada requerido.");

        const bell = await prisma.bellSchedule.create({
          data: { schoolId, name, applicableLevels },
        });

        const gridConfig = body.data.gridConfig as TimeGridConfig | undefined;
        if (gridConfig) {
          await SchoolSetupService.generateTimeGrid(bell.id, gridConfig);
        }

        const fullBell = await prisma.bellSchedule.findUnique({
          where: { id: bell.id },
          include: { timeSlots: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] } },
        });
        return NextResponse.json({ item: fullBell }, { status: 201 });
      }

      case "timeGrid": {
        const bellScheduleId = String(body.data.bellScheduleId || "");
        const config = body.data.config as TimeGridConfig;
        if (!bellScheduleId || !config) {
          throw new Error("bellScheduleId y config son requeridos.");
        }
        const slots = await SchoolSetupService.generateTimeGrid(bellScheduleId, config);
        return NextResponse.json({ slots });
      }

      case "room": {
        const equipmentTags = Array.isArray(body.data.equipmentTags)
          ? body.data.equipmentTags.map((t) => String(t).trim()).filter(Boolean)
          : [];
        const item = await prisma.room.create({
          data: {
            schoolId,
            name: String(body.data.name || "").trim(),
            capacity: Number(body.data.capacity || DEFAULT_AUTO_ROOM_CAPACITY),
            roomType: (body.data.roomType as RoomType) || "CLASSROOM",
            campus: body.data.campus ? String(body.data.campus).trim() : null,
            floor: Number(body.data.floor || 1),
            equipmentTags,
          },
        });
        return NextResponse.json({ item }, { status: 201 });
      }

      case "subject": {
        const name = String(body.data.name || "").trim();
        const code = String(body.data.code || name.slice(0, 3)).trim().toUpperCase();
        const colorHex = String(body.data.colorHex || "#2563EB").trim().toUpperCase();
        const requiresRoomType = body.data.requiresRoomType
          ? (body.data.requiresRoomType as RoomType)
          : null;
        const requiredRoomId =
          requiresRoomType && body.data.requiredRoomId
            ? String(body.data.requiredRoomId)
            : null;
        const cognitiveWeight = Number(body.data.cognitiveWeight ?? 1);
        const requiredEquipment = body.data.requiredEquipment
          ? String(body.data.requiredEquipment).trim()
          : null;
        const item = await prisma.subject.create({
          data: {
            schoolId,
            name,
            code,
            colorHex,
            requiresRoomType,
            requiredRoomId,
            cognitiveWeight: Number.isFinite(cognitiveWeight) ? Math.max(1, Math.min(3, cognitiveWeight)) : 1,
            requiredEquipment,
          },
        });
        return NextResponse.json({ item }, { status: 201 });
      }

      case "bulkCreateSubjects": {
        const rawItems = Array.isArray(body.data.items)
          ? (body.data.items as Array<{
              name: string;
              code: string;
              colorHex?: string;
              requiresRoomType?: RoomType | null;
              cognitiveWeight?: number;
            }>)
          : [];
        if (rawItems.length === 0) {
          throw new Error("Selecciona al menos una asignatura para agregar.");
        }
        const existing = await prisma.subject.findMany({
          where: { schoolId },
          select: { code: true },
        });
        const existingCodes = new Set(existing.map((s) => s.code.toUpperCase()));
        const toCreate = rawItems
          .filter((item) => item.name?.trim() && item.code?.trim())
          .filter((item) => !existingCodes.has(item.code.trim().toUpperCase()))
          .map((item) => ({
            schoolId,
            name: item.name.trim(),
            code: item.code.trim().toUpperCase(),
            colorHex: String(item.colorHex || "#2563EB").trim().toUpperCase(),
            requiresRoomType: item.requiresRoomType ?? null,
            cognitiveWeight: Number.isFinite(Number(item.cognitiveWeight))
              ? Math.max(1, Math.min(3, Number(item.cognitiveWeight)))
              : 1,
          }));
        if (toCreate.length > 0) {
          await prisma.subject.createMany({ data: toCreate, skipDuplicates: true });
        }
        return NextResponse.json({ createdCount: toCreate.length }, { status: 201 });
      }

      case "bulkCreateCourseRooms": {
        const courseIds = Array.isArray(body.data.courseIds)
          ? (body.data.courseIds as string[]).filter(Boolean)
          : null;
        const targetCourses = await prisma.course.findMany({
          where: {
            schoolId,
            defaultRoomId: null,
            ...(courseIds && courseIds.length > 0 ? { id: { in: courseIds } } : {}),
          },
          orderBy: { name: "asc" },
        });
        let createdCount = 0;
        await prisma.$transaction(async (tx) => {
          for (const course of targetCourses) {
            const roomId = await resolveAutoDefaultRoomId(tx, {
              schoolId,
              courseName: course.name,
              excludeCourseId: course.id,
              capacity: Math.max(course.studentCount, DEFAULT_AUTO_ROOM_CAPACITY),
            });
            await tx.course.update({
              where: { id: course.id },
              data: { defaultRoomId: roomId },
            });
            createdCount++;
          }
        });
        return NextResponse.json({ createdCount }, { status: 201 });
      }

      case "copyCoursePlan": {
        const sourceCourseId = String(body.data.sourceCourseId || "");
        const targetCourseIds = Array.isArray(body.data.targetCourseIds)
          ? (body.data.targetCourseIds as string[]).filter((id) => id && id !== sourceCourseId)
          : [];
        if (!sourceCourseId || targetCourseIds.length === 0) {
          throw new Error("Debes elegir el curso origen y al menos un curso destino.");
        }
        const sourceSubjects = await prisma.courseSubject.findMany({
          where: { courseId: sourceCourseId, course: { schoolId } },
          include: { teachers: true },
        });
        let copiedCount = 0;
        await prisma.$transaction(async (tx) => {
          for (const targetId of targetCourseIds) {
            const existingInTarget = await tx.courseSubject.findMany({
              where: { courseId: targetId, course: { schoolId } },
              select: { subjectId: true },
            });
            const existingSubIds = new Set(existingInTarget.map((cs) => cs.subjectId));
            for (const src of sourceSubjects) {
              if (existingSubIds.has(src.subjectId)) continue;
              await tx.courseSubject.create({
                data: {
                  courseId: targetId,
                  subjectId: src.subjectId,
                  weeklyBlocks: src.weeklyBlocks,
                  requiresConsecutiveBlocks: src.requiresConsecutiveBlocks,
                  syncGroupCode: src.syncGroupCode,
                  isSplitClass: src.isSplitClass,
                  teachers: {
                    create: src.teachers.map((t) => ({
                      teacherId: t.teacherId,
                      role: t.role,
                      assignedBlocks: t.assignedBlocks,
                      resourceRoomBlocks: t.resourceRoomBlocks,
                      resourceRoomId: t.resourceRoomId,
                    })),
                  },
                },
              });
              copiedCount++;
            }
          }
        });
        return NextResponse.json({ copiedCount }, { status: 201 });
      }

      case "teacher": {
        const contractHours = Number(body.data.contractHours || 44);
        const ley20903Ratio = normalizeTeacherLey20903Override(body.data.ley20903Ratio);
        const subjectIds = Array.isArray(body.data.subjectIds)
          ? (body.data.subjectIds as string[])
          : [];
        const levelCodes = Array.isArray(body.data.levelCodes)
          ? (body.data.levelCodes as LevelCode[])
          : [];
        const { policy, blockDurationMinutes } = await loadSchoolLey20903Context(schoolId);
        const ratio = resolveTeacherLey20903Ratio(
          ley20903Ratio,
          levelCodes.includes("BASIC_1_4"),
          policy
        );
        const legalMax = calculateLegalMaxTeachingBlocks(contractHours, {
          ratio,
          blockDurationMinutes,
          includeBreaksInTeaching: policy.includeBreaksInTeaching,
          breakMinutesPerBlock: policy.breakMinutesPerBlock,
        });
        const maxTeachingBlocks =
          body.data.maxTeachingBlocks !== undefined &&
          body.data.maxTeachingBlocks !== "" &&
          body.data.maxTeachingBlocks !== null
            ? Number(body.data.maxTeachingBlocks)
            : legalMax;

        const item = await prisma.teacher.create({
          data: {
            schoolId,
            firstName: String(body.data.firstName || "").trim(),
            lastName: String(body.data.lastName || "").trim(),
            email: body.data.email ? String(body.data.email).trim() : null,
            phone: body.data.phone ? String(body.data.phone).trim() : null,
            contractHours,
            maxTeachingBlocks,
            maxDailyHours: Number(body.data.maxDailyHours || 7),
            ley20903Ratio,
            colorHex: String(body.data.colorHex || "#0353A4"),
            qualifiedSubjects: {
              create: subjectIds.map((subjectId) => ({ subjectId })),
            },
            qualifiedLevels: {
              create: levelCodes.map((levelCode) => ({ levelCode })),
            },
          },
          include: { qualifiedSubjects: true, qualifiedLevels: true },
        });
        return NextResponse.json({ item }, { status: 201 });
      }

      case "recalculate_ley20903": {
        const { policy, blockDurationMinutes } = await loadSchoolLey20903Context(schoolId);
        const teachers = await prisma.teacher.findMany({
          where: { schoolId },
          include: {
            qualifiedLevels: true,
            courseSubjects: {
              include: { courseSubject: { include: { course: true } } },
            },
          },
        });
        let updatedCount = 0;
        for (const t of teachers) {
          const teachesBasic1to4 =
            t.courseSubjects.some((cs) => cs.courseSubject.course.levelCode === "BASIC_1_4") ||
            (t.courseSubjects.length === 0 &&
              t.qualifiedLevels.some((ql) => ql.levelCode === "BASIC_1_4"));
          const ratio = resolveTeacherLey20903Ratio(t.ley20903Ratio, teachesBasic1to4, policy);
          const nextMax = calculateLegalMaxTeachingBlocks(t.contractHours, {
            ratio,
            blockDurationMinutes,
            includeBreaksInTeaching: policy.includeBreaksInTeaching,
            breakMinutesPerBlock: policy.breakMinutesPerBlock,
          });
          if (nextMax !== t.maxTeachingBlocks) {
            await prisma.teacher.update({
              where: { id: t.id },
              data: { maxTeachingBlocks: nextMax },
            });
            updatedCount++;
          }
        }
        return NextResponse.json({ updatedCount, totalTeachers: teachers.length });
      }

      case "course": {
        const courseName = String(body.data.name || "").trim();
        const autoCreateDefaultRoom = Boolean(body.data.autoCreateDefaultRoom);
        const item = await prisma.$transaction(async (tx) => {
          const defaultRoomId = autoCreateDefaultRoom
            ? await resolveAutoDefaultRoomId(tx, {
                schoolId,
                courseName,
                capacity:
                  body.data.autoRoomCapacity !== undefined
                    ? Number(body.data.autoRoomCapacity)
                    : DEFAULT_AUTO_ROOM_CAPACITY,
              })
            : body.data.defaultRoomId
              ? String(body.data.defaultRoomId)
              : null;

          return tx.course.create({
            data: {
              schoolId,
              bellScheduleId: String(body.data.bellScheduleId),
              name: courseName,
              code: String(body.data.code || "").trim().toUpperCase(),
              levelCode: (body.data.levelCode as LevelCode) || "MEDIA_1_2",
              defaultRoomId,
              studentCount: Number(body.data.studentCount ?? 35),
              requiresGroundFloor: Boolean(body.data.requiresGroundFloor),
            },
          });
        });
        return NextResponse.json({ item }, { status: 201 });
      }

      case "courseSubject": {
        const teachersInput = Array.isArray(body.data.teachers)
          ? (body.data.teachers as TeacherAssignmentInput[])
          : [];
        const pieRoomIds = await loadPieRoomIds(schoolId);

        const item = await prisma.courseSubject.create({
          data: {
            courseId: String(body.data.courseId),
            subjectId: String(body.data.subjectId),
            weeklyBlocks: Number(body.data.weeklyBlocks || 2),
            requiresConsecutiveBlocks: Boolean(body.data.requiresConsecutiveBlocks),
            syncGroupCode: body.data.syncGroupCode
              ? String(body.data.syncGroupCode).trim()
              : null,
            isSplitClass: Boolean(body.data.isSplitClass),
            teachers: {
              create: teachersInput.map((t) => ({
                teacherId: t.teacherId,
                ...normalizeTeacherAssignment(t, Number(body.data.weeklyBlocks || 2), pieRoomIds),
              })),
            },
          },
          include: {
            subject: true,
            teachers: { include: { teacher: true } },
          },
        });
        return NextResponse.json({ item }, { status: 201 });
      }

      case "rule": {
        const item = await SchoolSetupService.upsertSchedulingRule(
          schoolId,
          body.data as unknown as UpsertSchedulingRuleInput
        );
        return NextResponse.json({ item }, { status: 201 });
      }

      default:
        return NextResponse.json({ error: "Entidad no soportada." }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al guardar registro." },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const schoolId = await resolveActiveSchoolId(user);
  if (!schoolId) {
    return NextResponse.json({ error: "No hay establecimiento activo." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      entity: string;
      id: string;
      data: Record<string, unknown>;
    };

    if (!body.entity || !body.id) {
      return NextResponse.json({ error: "entity e id requeridos." }, { status: 400 });
    }

    switch (body.entity) {
      case "bellSchedule": {
        const existing = await prisma.bellSchedule.findFirst({
          where: { id: body.id, schoolId },
        });
        if (!existing) {
          return NextResponse.json({ error: "Jornada no encontrada." }, { status: 404 });
        }

        const name = String(body.data.name ?? existing.name).trim();
        if (!name) throw new Error("Nombre de jornada requerido.");

        const applicableLevels = Array.isArray(body.data.applicableLevels)
          ? body.data.applicableLevels
          : undefined;

        const gridConfig = body.data.gridConfig as TimeGridConfig | undefined;
        if (gridConfig) {
          await SchoolSetupService.generateTimeGrid(existing.id, gridConfig);
        }

        const item = await prisma.bellSchedule.update({
          where: { id: existing.id },
          data: {
            name,
            ...(applicableLevels ? { applicableLevels } : {}),
          },
          include: { timeSlots: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] } },
        });
        return NextResponse.json({ item });
      }

      case "subject": {
        const existing = await prisma.subject.findFirst({
          where: { id: body.id, schoolId },
        });
        if (!existing) {
          return NextResponse.json({ error: "Asignatura no encontrada." }, { status: 404 });
        }
        const name = String(body.data.name || existing.name).trim();
        const code = String(body.data.code || existing.code).trim().toUpperCase();
        const colorHex =
          body.data.colorHex !== undefined
            ? String(body.data.colorHex || existing.colorHex).trim().toUpperCase()
            : existing.colorHex;
        const requiresRoomType =
          body.data.requiresRoomType !== undefined
            ? body.data.requiresRoomType
              ? (body.data.requiresRoomType as RoomType)
              : null
            : existing.requiresRoomType;
        const requiredRoomId = !requiresRoomType
          ? null
          : body.data.requiredRoomId !== undefined
            ? body.data.requiredRoomId
              ? String(body.data.requiredRoomId)
              : null
            : existing.requiredRoomId;
        const cognitiveWeight =
          body.data.cognitiveWeight !== undefined
            ? Math.max(1, Math.min(3, Number(body.data.cognitiveWeight) || 1))
            : existing.cognitiveWeight;
        const requiredEquipment =
          body.data.requiredEquipment !== undefined
            ? body.data.requiredEquipment
              ? String(body.data.requiredEquipment).trim()
              : null
            : existing.requiredEquipment;

        const item = await prisma.subject.update({
          where: { id: body.id },
          data: {
            name,
            code,
            colorHex,
            requiresRoomType,
            requiredRoomId,
            cognitiveWeight,
            requiredEquipment,
          },
        });
        return NextResponse.json({ item });
      }

      case "room": {
        const existing = await prisma.room.findFirst({
          where: { id: body.id, schoolId },
        });
        if (!existing) {
          return NextResponse.json({ error: "Sala no encontrada." }, { status: 404 });
        }
        const name = String(body.data.name || existing.name).trim();
        const capacity = Number(body.data.capacity ?? existing.capacity);
        const roomType = (body.data.roomType as RoomType) || existing.roomType;
        const campus =
          body.data.campus !== undefined
            ? body.data.campus
              ? String(body.data.campus).trim()
              : null
            : existing.campus;
        const floor =
          body.data.floor !== undefined ? Number(body.data.floor) || 1 : existing.floor;
        const equipmentTags =
          body.data.equipmentTags !== undefined
            ? Array.isArray(body.data.equipmentTags)
              ? body.data.equipmentTags.map((t) => String(t).trim()).filter(Boolean)
              : []
            : (existing.equipmentTags as string[]);

        const item = await prisma.room.update({
          where: { id: body.id },
          data: { name, capacity, roomType, campus, floor, equipmentTags },
        });
        return NextResponse.json({ item });
      }

      case "teacher": {
        const existing = await prisma.teacher.findFirst({
          where: { id: body.id, schoolId },
          include: {
            qualifiedLevels: true,
            courseSubjects: {
              include: { courseSubject: { include: { course: true } } },
            },
          },
        });
        if (!existing) {
          return NextResponse.json({ error: "Docente no encontrado." }, { status: 404 });
        }
        const contractHours = Number(body.data.contractHours ?? existing.contractHours);
        const ley20903Ratio =
          body.data.ley20903Ratio !== undefined
            ? normalizeTeacherLey20903Override(body.data.ley20903Ratio)
            : normalizeTeacherLey20903Override(existing.ley20903Ratio);
        const { policy, blockDurationMinutes } = await loadSchoolLey20903Context(schoolId);
        const teachesBasic1to4 =
          existing.courseSubjects.some((cs) => cs.courseSubject.course.levelCode === "BASIC_1_4") ||
          (existing.courseSubjects.length === 0 &&
            existing.qualifiedLevels.some((ql) => ql.levelCode === "BASIC_1_4"));
        const ratio = resolveTeacherLey20903Ratio(ley20903Ratio, teachesBasic1to4, policy);
        const legalMax = calculateLegalMaxTeachingBlocks(contractHours, {
          ratio,
          blockDurationMinutes,
          includeBreaksInTeaching: policy.includeBreaksInTeaching,
          breakMinutesPerBlock: policy.breakMinutesPerBlock,
        });
        const maxTeachingBlocks =
          body.data.maxTeachingBlocks !== undefined &&
          body.data.maxTeachingBlocks !== "" &&
          body.data.maxTeachingBlocks !== null
            ? Number(body.data.maxTeachingBlocks)
            : legalMax;

        const subjectIds = Array.isArray(body.data.subjectIds)
          ? (body.data.subjectIds as string[]).filter(Boolean)
          : null;
        const levelCodes = Array.isArray(body.data.levelCodes)
          ? (body.data.levelCodes as LevelCode[]).filter(Boolean)
          : null;

        const item = await prisma.teacher.update({
          where: { id: body.id },
          data: {
            firstName: String(body.data.firstName ?? existing.firstName).trim(),
            lastName: String(body.data.lastName ?? existing.lastName).trim(),
            email:
              body.data.email !== undefined
                ? body.data.email
                  ? String(body.data.email).trim()
                  : null
                : existing.email,
            phone:
              body.data.phone !== undefined
                ? body.data.phone
                  ? String(body.data.phone).trim()
                  : null
                : existing.phone,
            contractHours,
            maxTeachingBlocks,
            maxDailyHours: Number(body.data.maxDailyHours ?? existing.maxDailyHours),
            ley20903Ratio,
            colorHex: String(body.data.colorHex ?? existing.colorHex),
            ...(subjectIds !== null
              ? {
                  qualifiedSubjects: {
                    deleteMany: {},
                    create: subjectIds.map((subjectId) => ({ subjectId })),
                  },
                }
              : {}),
            ...(levelCodes !== null
              ? {
                  qualifiedLevels: {
                    deleteMany: {},
                    create: levelCodes.map((levelCode) => ({ levelCode })),
                  },
                }
              : {}),
          },
          include: {
            qualifiedSubjects: { include: { subject: true } },
            qualifiedLevels: true,
          },
        });
        return NextResponse.json({ item });
      }

      case "course": {
        const existing = await prisma.course.findFirst({
          where: { id: body.id, schoolId },
        });
        if (!existing) {
          return NextResponse.json({ error: "Curso no encontrado." }, { status: 404 });
        }
        const nextName = String(body.data.name ?? existing.name).trim();
        const autoCreateDefaultRoom = Boolean(body.data.autoCreateDefaultRoom);
        const item = await prisma.$transaction(async (tx) => {
          const nextDefaultRoomId = autoCreateDefaultRoom
            ? await resolveAutoDefaultRoomId(tx, {
                schoolId,
                courseName: nextName,
                excludeCourseId: existing.id,
                capacity:
                  body.data.autoRoomCapacity !== undefined
                    ? Number(body.data.autoRoomCapacity)
                    : DEFAULT_AUTO_ROOM_CAPACITY,
              })
            : body.data.defaultRoomId !== undefined
              ? body.data.defaultRoomId
                ? String(body.data.defaultRoomId)
                : null
              : existing.defaultRoomId;

          return tx.course.update({
            where: { id: body.id },
            data: {
              name: nextName,
              code: String(body.data.code ?? existing.code).trim().toUpperCase(),
              levelCode: (body.data.levelCode as LevelCode) ?? existing.levelCode,
              bellScheduleId: String(body.data.bellScheduleId ?? existing.bellScheduleId),
              defaultRoomId: nextDefaultRoomId,
              studentCount:
                body.data.studentCount !== undefined
                  ? Number(body.data.studentCount) || 35
                  : existing.studentCount,
              requiresGroundFloor:
                body.data.requiresGroundFloor !== undefined
                  ? Boolean(body.data.requiresGroundFloor)
                  : existing.requiresGroundFloor,
            },
          });
        });
        return NextResponse.json({ item });
      }

      case "courseSubject": {
        const existing = await prisma.courseSubject.findFirst({
          where: { id: body.id, course: { schoolId } },
        });
        if (!existing) {
          return NextResponse.json(
            { error: "Carga curricular no encontrada." },
            { status: 404 }
          );
        }

        const nextCourseId =
          body.data.courseId !== undefined ? String(body.data.courseId) : existing.courseId;
        if (nextCourseId !== existing.courseId) {
          const targetCourse = await prisma.course.findFirst({
            where: { id: nextCourseId, schoolId },
            select: { id: true },
          });
          if (!targetCourse) {
            return NextResponse.json({ error: "Curso destino no encontrado." }, { status: 404 });
          }
        }

        const nextSubjectId =
          body.data.subjectId !== undefined ? String(body.data.subjectId) : existing.subjectId;
        if (nextSubjectId !== existing.subjectId) {
          const targetSubject = await prisma.subject.findFirst({
            where: { id: nextSubjectId, schoolId },
            select: { id: true },
          });
          if (!targetSubject) {
            return NextResponse.json(
              { error: "Asignatura destino no encontrada." },
              { status: 404 }
            );
          }
        }

        const nextSyncGroupCode =
          body.data.syncGroupCode !== undefined
            ? body.data.syncGroupCode
              ? String(body.data.syncGroupCode).trim()
              : null
            : existing.syncGroupCode;

        const teachersInput = Array.isArray(body.data.teachers)
          ? (body.data.teachers as TeacherAssignmentInput[])
          : null;
        const pieRoomIds = teachersInput ? await loadPieRoomIds(schoolId) : new Set<string>();

        const shouldPropagateSyncRename =
          Boolean(body.data.propagateSyncRename) &&
          Boolean(existing.syncGroupCode) &&
          Boolean(nextSyncGroupCode) &&
          existing.syncGroupCode !== nextSyncGroupCode;

        const { item, propagatedCount } = await prisma.$transaction(async (tx) => {
          const updatedItem = await tx.courseSubject.update({
            where: { id: body.id },
            data: {
              courseId: nextCourseId,
              subjectId: nextSubjectId,
              weeklyBlocks:
                body.data.weeklyBlocks !== undefined
                  ? Number(body.data.weeklyBlocks) || existing.weeklyBlocks
                  : existing.weeklyBlocks,
              requiresConsecutiveBlocks:
                body.data.requiresConsecutiveBlocks !== undefined
                  ? Boolean(body.data.requiresConsecutiveBlocks)
                  : existing.requiresConsecutiveBlocks,
              syncGroupCode: nextSyncGroupCode,
              isSplitClass:
                body.data.isSplitClass !== undefined
                  ? Boolean(body.data.isSplitClass)
                  : Boolean(nextSyncGroupCode),
              ...(teachersInput
                ? {
                    teachers: {
                      deleteMany: {},
                      create: teachersInput.map((t) => ({
                        teacherId: t.teacherId,
                        ...normalizeTeacherAssignment(
                          t,
                          body.data.weeklyBlocks !== undefined
                            ? Number(body.data.weeklyBlocks) || existing.weeklyBlocks
                            : existing.weeklyBlocks,
                          pieRoomIds
                        ),
                      })),
                    },
                  }
                : {}),
            },
            include: {
              subject: true,
              teachers: { include: { teacher: true } },
            },
          });

          let extraUpdated = 0;
          if (shouldPropagateSyncRename && existing.syncGroupCode && nextSyncGroupCode) {
            const bulkRes = await tx.courseSubject.updateMany({
              where: {
                id: { not: body.id },
                course: { schoolId },
                syncGroupCode: existing.syncGroupCode,
              },
              data: {
                syncGroupCode: nextSyncGroupCode,
                isSplitClass: true,
              },
            });
            extraUpdated = bulkRes.count;

            // Actualizar también reglas de bloque fijo que apunten al nombre anterior del grupo
            const syncRules = await tx.schedulingRule.findMany({
              where: { schoolId, ruleType: "FIXED_SYNC_GROUP_SLOT" },
            });
            for (const rule of syncRules) {
              const params = (rule.parameters ?? {}) as Record<string, unknown>;
              if (
                typeof params.syncGroupCode === "string" &&
                params.syncGroupCode.trim() === existing.syncGroupCode
              ) {
                await tx.schedulingRule.update({
                  where: { id: rule.id },
                  data: {
                    parameters: {
                      ...params,
                      syncGroupCode: nextSyncGroupCode,
                    } as Prisma.InputJsonValue,
                  },
                });
              }
            }
          }

          return { item: updatedItem, propagatedCount: extraUpdated };
        });

        return NextResponse.json({ item, propagatedCount });
      }

      case "courseSubjectBulkSync": {
        const ids = Array.isArray(body.data.ids)
          ? (body.data.ids as unknown[]).map((id) => String(id)).filter(Boolean)
          : [];
        if (ids.length === 0) {
          return NextResponse.json(
            { error: "Selecciona al menos una carga curricular." },
            { status: 400 }
          );
        }
        const syncGroupCode = body.data.syncGroupCode
          ? String(body.data.syncGroupCode).trim()
          : null;
        const result = await prisma.courseSubject.updateMany({
          where: { id: { in: ids }, course: { schoolId } },
          data: {
            syncGroupCode,
            isSplitClass: Boolean(syncGroupCode),
          },
        });
        return NextResponse.json({ updatedCount: result.count });
      }

      default:
        return NextResponse.json({ error: "Entidad no soportada." }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al actualizar registro." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const schoolId = await resolveActiveSchoolId(user);
  if (!schoolId) return NextResponse.json({ error: "Sin establecimiento" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const entity = searchParams.get("entity");
  const id = searchParams.get("id");
  if (!entity || !id) {
    return NextResponse.json({ error: "entity e id requeridos" }, { status: 400 });
  }

  try {
    switch (entity) {
      case "room":
        await prisma.room.deleteMany({ where: { id, schoolId } });
        break;
      case "subject":
        await prisma.subject.deleteMany({ where: { id, schoolId } });
        break;
      case "teacher":
        await prisma.teacher.deleteMany({ where: { id, schoolId } });
        break;
      case "course":
        await prisma.course.deleteMany({ where: { id, schoolId } });
        break;
      case "courseSubject":
        await prisma.courseSubject.delete({ where: { id } });
        break;
      case "rule":
        await prisma.schedulingRule.deleteMany({ where: { id, schoolId } });
        break;
      case "bellSchedule":
        await prisma.bellSchedule.deleteMany({ where: { id, schoolId } });
        break;
      default:
        return NextResponse.json({ error: "Entidad no soportada" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo eliminar (puede tener registros asociados)." },
      { status: 400 }
    );
  }
}
