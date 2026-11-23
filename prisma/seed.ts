import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { SchoolSetupService } from "../src/services/SchoolSetupService";
import { TimetableSolverService } from "../src/services/TimetableSolverService";
import { calculateLegalMaxTeachingBlocks } from "../src/lib/scheduling/constants";

async function main() {
  console.log("Sembrando datos iniciales de EduKit (Generador de Horarios)...");

  // 1. SUPER_ADMIN
  await prisma.user.upsert({
    where: { email: "superadmin@edukit.cl" },
    update: {},
    create: {
      email: "superadmin@edukit.cl",
      passwordHash: hashPassword("Admin123!"),
      firstName: "Super",
      lastName: "Admin",
      role: "SUPER_ADMIN",
      schoolId: null,
      isActive: true,
    },
  });

  // 2. Colegio demo
  let school = await prisma.school.findUnique({ where: { rbd: "12345-6" } });
  if (!school) {
    school = await prisma.school.create({
      data: {
        name: "Liceo Bicentenario Demo",
        rbd: "12345-6",
        commune: "Providencia",
        academicYear: 2026,
        isActive: true,
      },
    });
  }

  // 3. SCHOOL_ADMIN
  await prisma.user.upsert({
    where: { email: "utp@edukit.cl" },
    update: { schoolId: school.id },
    create: {
      email: "utp@edukit.cl",
      passwordHash: hashPassword("Admin123!"),
      firstName: "Camila",
      lastName: "Rojas (UTP)",
      role: "SCHOOL_ADMIN",
      schoolId: school.id,
      isActive: true,
    },
  });

  // 3b. Colegio vacío y cuenta UTP sin datos cargados para pruebas
  let emptySchool = await prisma.school.findUnique({ where: { rbd: "99999-9" } });
  if (!emptySchool) {
    emptySchool = await prisma.school.create({
      data: {
        name: "Colegio Pruebas (Sin Datos)",
        rbd: "99999-9",
        commune: "Santiago",
        academicYear: 2026,
        isActive: true,
      },
    });
  }

  await prisma.user.upsert({
    where: { email: "utp2@edukit.cl" },
    update: { schoolId: emptySchool.id },
    create: {
      email: "utp2@edukit.cl",
      passwordHash: hashPassword("Admin123!"),
      firstName: "Prueba",
      lastName: "UTP (Sin datos)",
      role: "SCHOOL_ADMIN",
      schoolId: emptySchool.id,
      isActive: true,
    },
  });

  // Evitar duplicar datos académicos si ya existen cursos en el colegio demo
  const existingCourses = await prisma.course.count({ where: { schoolId: school.id } });
  if (existingCourses > 0) {
    console.log("El colegio demo ya tiene datos académicos cargados. Seed completado.");
    return;
  }

  // 4. Jornadas horarias (bell_schedules + time_slots)
  const bellMedia = await prisma.bellSchedule.create({
    data: {
      schoolId: school.id,
      name: "Jornada Enseñanza Media",
      applicableLevels: ["MEDIA_1_2", "MEDIA_3_4"],
    },
  });

  const bellBasica = await prisma.bellSchedule.create({
    data: {
      schoolId: school.id,
      name: "Jornada Básica",
      applicableLevels: ["BASIC_1_4", "BASIC_5_8"],
    },
  });

  await SchoolSetupService.generateTimeGrid(bellMedia.id, {
    startTime: "08:00",
    blockDurationMinutes: 45,
    blocksPerDay: 8,
    breaks: [
      { afterBlock: 2, durationMinutes: 15, type: "BREAK" },
      { afterBlock: 4, durationMinutes: 15, type: "BREAK" },
      { afterBlock: 6, durationMinutes: 45, type: "LUNCH" },
    ],
  });

  await SchoolSetupService.generateTimeGrid(bellBasica.id, {
    startTime: "08:15",
    blockDurationMinutes: 45,
    blocksPerDay: 7,
    breaks: [
      { afterBlock: 2, durationMinutes: 15, type: "BREAK" },
      { afterBlock: 4, durationMinutes: 15, type: "BREAK" },
      { afterBlock: 6, durationMinutes: 45, type: "LUNCH" },
    ],
  });

  // 5. Salas y espacios especiales
  const [sala101, sala102, sala201, sala202] =
    await Promise.all([
      prisma.room.create({ data: { schoolId: school.id, name: "Sala 101", capacity: 38, roomType: "CLASSROOM" } }),
      prisma.room.create({ data: { schoolId: school.id, name: "Sala 102", capacity: 38, roomType: "CLASSROOM" } }),
      prisma.room.create({ data: { schoolId: school.id, name: "Sala 201", capacity: 36, roomType: "CLASSROOM" } }),
      prisma.room.create({ data: { schoolId: school.id, name: "Sala 202", capacity: 36, roomType: "CLASSROOM" } }),
      prisma.room.create({ data: { schoolId: school.id, name: "Laboratorio Ciencias", capacity: 32, roomType: "LAB" } }),
      prisma.room.create({ data: { schoolId: school.id, name: "Gimnasio", capacity: 60, roomType: "GYM" } }),
      prisma.room.create({ data: { schoolId: school.id, name: "Sala Computación", capacity: 32, roomType: "COMPUTER_LAB" } }),
    ]);

  // 6. Catálogo de asignaturas
  const [mat, len, cie, his, ing, edf, tec, ele] = await Promise.all([
    prisma.subject.create({ data: { schoolId: school.id, name: "Matemática", code: "MAT" } }),
    prisma.subject.create({ data: { schoolId: school.id, name: "Lenguaje y Literatura", code: "LEN" } }),
    prisma.subject.create({ data: { schoolId: school.id, name: "Ciencias Naturales", code: "CIE", requiresRoomType: "LAB" } }),
    prisma.subject.create({ data: { schoolId: school.id, name: "Historia y Geografía", code: "HIS" } }),
    prisma.subject.create({ data: { schoolId: school.id, name: "Inglés", code: "ING" } }),
    prisma.subject.create({ data: { schoolId: school.id, name: "Educación Física", code: "EDF", requiresRoomType: "GYM" } }),
    prisma.subject.create({ data: { schoolId: school.id, name: "Tecnología", code: "TEC", requiresRoomType: "COMPUTER_LAB" } }),
    prisma.subject.create({ data: { schoolId: school.id, name: "Electivo Plan Diferenciado", code: "ELE" } }),
  ]);

  // 7. Docentes (con proporción Ley 20.903 y codocente PIE)
  const createTeacher = async (
    firstName: string,
    lastName: string,
    email: string,
    contractHours: number,
    colorHex: string,
    subjectIds: string[],
    levels: Array<"BASIC_1_4" | "BASIC_5_8" | "MEDIA_1_2" | "MEDIA_3_4">
  ) => {
    return prisma.teacher.create({
      data: {
        schoolId: school.id,
        firstName,
        lastName,
        email,
        contractHours,
        maxTeachingBlocks: calculateLegalMaxTeachingBlocks(contractHours),
        maxDailyHours: 7,
        colorHex,
        qualifiedSubjects: {
          create: subjectIds.map((subjectId) => ({ subjectId })),
        },
        qualifiedLevels: {
          create: levels.map((levelCode) => ({ levelCode })),
        },
      },
    });
  };

  const tMat = await createTeacher("Rodrigo", "Fuentes", "rfuentes@demo.cl", 44, "#8721FD", [mat.id, ele.id], ["BASIC_5_8", "MEDIA_1_2", "MEDIA_3_4"]);
  const tLen = await createTeacher("Valentina", "Soto", "vsoto@demo.cl", 44, "#6366f1", [len.id, ele.id], ["BASIC_5_8", "MEDIA_1_2", "MEDIA_3_4"]);
  const tCie = await createTeacher("Sebastián", "Morales", "smorales@demo.cl", 38, "#10b981", [cie.id], ["BASIC_5_8", "MEDIA_1_2", "MEDIA_3_4"]);
  const tHis = await createTeacher("Carolina", "Vega", "cvega@demo.cl", 36, "#f59e0b", [his.id], ["BASIC_5_8", "MEDIA_1_2", "MEDIA_3_4"]);
  const tIng = await createTeacher("Matías", "Araya", "maraya@demo.cl", 30, "#0ea5e9", [ing.id], ["BASIC_5_8", "MEDIA_1_2", "MEDIA_3_4"]);
  const tEdf = await createTeacher("Javiera", "Pinto", "jpinto@demo.cl", 30, "#ec4899", [edf.id], ["BASIC_5_8", "MEDIA_1_2", "MEDIA_3_4"]);
  const tTec = await createTeacher("Diego", "Navarro", "dnavarro@demo.cl", 30, "#14b8a6", [tec.id, mat.id], ["BASIC_5_8", "MEDIA_1_2", "MEDIA_3_4"]);
  const tPie = await createTeacher("Francisca", "Muñoz (PIE)", "fmunoz@demo.cl", 30, "#f97316", [mat.id, len.id], ["BASIC_5_8", "MEDIA_1_2"]);

  // 8. Cursos
  const [c8BA, c1MA, c3MA, c3MB] = await Promise.all([
    prisma.course.create({
      data: {
        schoolId: school.id,
        bellScheduleId: bellBasica.id,
        name: "8° Básico A",
        code: "8BA",
        levelCode: "BASIC_5_8",
        defaultRoomId: sala101.id,
      },
    }),
    prisma.course.create({
      data: {
        schoolId: school.id,
        bellScheduleId: bellMedia.id,
        name: "1° Medio A",
        code: "1MA",
        levelCode: "MEDIA_1_2",
        defaultRoomId: sala102.id,
      },
    }),
    prisma.course.create({
      data: {
        schoolId: school.id,
        bellScheduleId: bellMedia.id,
        name: "3° Medio A",
        code: "3MA",
        levelCode: "MEDIA_3_4",
        defaultRoomId: sala201.id,
      },
    }),
    prisma.course.create({
      data: {
        schoolId: school.id,
        bellScheduleId: bellMedia.id,
        name: "3° Medio B",
        code: "3MB",
        levelCode: "MEDIA_3_4",
        defaultRoomId: sala202.id,
      },
    }),
  ]);

  // Helper para asignar plan de estudio
  const assignCS = async (
    courseId: string,
    subjectId: string,
    weeklyBlocks: number,
    teachers: Array<{ teacherId: string; role?: "LEAD" | "CO_TEACHER" | "PIE_SUPPORT"; assignedBlocks?: number }>,
    opts?: { requiresConsecutiveBlocks?: boolean; syncGroupCode?: string; isSplitClass?: boolean }
  ) => {
    return prisma.courseSubject.create({
      data: {
        courseId,
        subjectId,
        weeklyBlocks,
        requiresConsecutiveBlocks: opts?.requiresConsecutiveBlocks ?? false,
        syncGroupCode: opts?.syncGroupCode ?? null,
        isSplitClass: opts?.isSplitClass ?? false,
        teachers: {
          create: teachers.map((t) => ({
            teacherId: t.teacherId,
            role: t.role ?? "LEAD",
            assignedBlocks: t.assignedBlocks ?? null,
          })),
        },
      },
    });
  };

  // 8° Básico A (24 bloques)
  await assignCS(c8BA.id, mat.id, 6, [{ teacherId: tMat.id }, { teacherId: tPie.id, role: "PIE_SUPPORT", assignedBlocks: 2 }], { requiresConsecutiveBlocks: true });
  await assignCS(c8BA.id, len.id, 6, [{ teacherId: tLen.id }], { requiresConsecutiveBlocks: true });
  await assignCS(c8BA.id, cie.id, 4, [{ teacherId: tCie.id }], { requiresConsecutiveBlocks: true });
  await assignCS(c8BA.id, his.id, 3, [{ teacherId: tHis.id }]);
  await assignCS(c8BA.id, ing.id, 3, [{ teacherId: tIng.id }]);
  await assignCS(c8BA.id, edf.id, 2, [{ teacherId: tEdf.id }], { requiresConsecutiveBlocks: true });

  // 1° Medio A (26 bloques)
  await assignCS(c1MA.id, mat.id, 6, [{ teacherId: tMat.id }, { teacherId: tPie.id, role: "PIE_SUPPORT", assignedBlocks: 2 }], { requiresConsecutiveBlocks: true });
  await assignCS(c1MA.id, len.id, 6, [{ teacherId: tLen.id }], { requiresConsecutiveBlocks: true });
  await assignCS(c1MA.id, cie.id, 4, [{ teacherId: tCie.id }], { requiresConsecutiveBlocks: true });
  await assignCS(c1MA.id, his.id, 4, [{ teacherId: tHis.id }]);
  await assignCS(c1MA.id, ing.id, 2, [{ teacherId: tIng.id }]);
  await assignCS(c1MA.id, edf.id, 2, [{ teacherId: tEdf.id }], { requiresConsecutiveBlocks: true });
  await assignCS(c1MA.id, tec.id, 2, [{ teacherId: tTec.id }], { requiresConsecutiveBlocks: true });

  // 3° Medio A (26 bloques, incluye Electivo sincronizado ELECTIVO_3M_A)
  await assignCS(c3MA.id, mat.id, 6, [{ teacherId: tMat.id }], { requiresConsecutiveBlocks: true });
  await assignCS(c3MA.id, len.id, 4, [{ teacherId: tLen.id }], { requiresConsecutiveBlocks: true });
  await assignCS(c3MA.id, cie.id, 4, [{ teacherId: tCie.id }], { requiresConsecutiveBlocks: true });
  await assignCS(c3MA.id, his.id, 4, [{ teacherId: tHis.id }]);
  await assignCS(c3MA.id, ing.id, 2, [{ teacherId: tIng.id }]);
  await assignCS(c3MA.id, edf.id, 2, [{ teacherId: tEdf.id }], { requiresConsecutiveBlocks: true });
  await assignCS(c3MA.id, ele.id, 4, [{ teacherId: tTec.id }], { syncGroupCode: "ELECTIVO_3M_A", isSplitClass: true });

  // 3° Medio B (26 bloques, incluye Electivo sincronizado ELECTIVO_3M_A)
  await assignCS(c3MB.id, mat.id, 6, [{ teacherId: tTec.id }], { requiresConsecutiveBlocks: true });
  await assignCS(c3MB.id, len.id, 4, [{ teacherId: tLen.id }], { requiresConsecutiveBlocks: true });
  await assignCS(c3MB.id, cie.id, 4, [{ teacherId: tCie.id }], { requiresConsecutiveBlocks: true });
  await assignCS(c3MB.id, his.id, 4, [{ teacherId: tHis.id }]);
  await assignCS(c3MB.id, ing.id, 2, [{ teacherId: tIng.id }]);
  await assignCS(c3MB.id, edf.id, 2, [{ teacherId: tEdf.id }], { requiresConsecutiveBlocks: true });
  await assignCS(c3MB.id, ele.id, 4, [{ teacherId: tMat.id }], { syncGroupCode: "ELECTIVO_3M_A", isSplitClass: true });

  // 9. Reglas de configuración inicial
  await SchoolSetupService.upsertSchedulingRule(school.id, {
    ruleType: "TEACHER_UNAVAILABILITY",
    weight: "HARD",
    penaltyScore: 100,
    targetEntityType: "TEACHER",
    targetEntityId: tIng.id,
    parameters: { unavailableDays: [5] }, // Matías Araya (part-time) no trabaja los viernes
  });

  await SchoolSetupService.upsertSchedulingRule(school.id, {
    ruleType: "SUBJECT_PREFERRED_TIME_RANGE",
    weight: "SOFT",
    penaltyScore: 18,
    targetEntityType: "SUBJECT",
    targetEntityId: mat.id,
    parameters: { period: "MORNING", maxBlock: 4 },
  });

  await SchoolSetupService.upsertSchedulingRule(school.id, {
    ruleType: "MAX_CONSECUTIVE_TEACHER_BLOCKS",
    weight: "SOFT",
    penaltyScore: 25,
    targetEntityType: "GLOBAL",
    parameters: { max: 4 },
  });

  await SchoolSetupService.upsertSchedulingRule(school.id, {
    ruleType: "MAX_DAILY_BLOCKS_PER_SUBJECT",
    weight: "HARD",
    penaltyScore: 60,
    targetEntityType: "GLOBAL",
    parameters: { max: 2 },
  });

  await SchoolSetupService.upsertSchedulingRule(school.id, {
    ruleType: "PRIORITIZE_PAIR_GROUPS",
    weight: "SOFT",
    penaltyScore: 20,
    targetEntityType: "GLOBAL",
    parameters: { enabled: true },
  });

  await SchoolSetupService.upsertSchedulingRule(school.id, {
    ruleType: "NO_SAME_SUBJECT_AROUND_LUNCH",
    weight: "SOFT",
    penaltyScore: 20,
    targetEntityType: "GLOBAL",
    parameters: { enabled: true },
  });

  await SchoolSetupService.upsertSchedulingRule(school.id, {
    ruleType: "FIRST_LAST_BLOCK_EQUITY",
    weight: "SOFT",
    penaltyScore: 15,
    targetEntityType: "GLOBAL",
    parameters: { maxFirstOrLast: 3 },
  });

  // 10. Generar borrador inicial automáticamente
  const generated = await TimetableSolverService.generateSchedule(school.id, {
    name: "Borrador Inicial 2026",
  });

  // Agregar un Consejo de Profesores no lectivo el Miércoles bloque 8
  const wedBlock8 = await prisma.timeSlot.findFirst({
    where: {
      bellScheduleId: bellMedia.id,
      dayOfWeek: 3,
      blockNumber: 8,
      slotType: "CLASS",
    },
  });
  if (wedBlock8) {
    await prisma.teacherNonTeachingActivity.create({
      data: {
        versionId: generated.version.id,
        teacherId: tMat.id,
        timeSlotId: wedBlock8.id,
        activityType: "STAFF_MEETING",
        title: "Consejo de Profesores",
      },
    });
  }

  console.log(
    `Seed completado: Colegio "${school.name}" | Versión "${generated.version.name}" | Bloques ubicados: ${generated.placedCount} | Sin ubicar: ${generated.unplacedCount} | Fitness: ${generated.audit.fitnessScore}/100`
  );
}

main()
  .catch((e) => {
    console.error("Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
