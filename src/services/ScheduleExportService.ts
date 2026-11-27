import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { resolveEntryParticipants } from "@/lib/scheduling/entryParticipants";
import {
  DAYS_OF_WEEK,
  ACTIVITY_TYPE_LABELS,
  calculateLey20903Breakdown,
  extractLey20903Policy,
  formatChronologicalMinutes,
  resolveBlockDurationMinutes,
  resolveTeacherLey20903Ratio,
} from "@/lib/scheduling/constants";

function sanitizeText(str: string): string {
  // Standard Helvetica en pdf-lib soporta WinAnsi; reemplazar caracteres fuera de rango
  return str
    .replace(/°/g, "o")
    .replace(/—/g, "-")
    .replace(/·/g, "-")
    .replace(/[^\x20-\xFF]/g, "");
}

function slugify(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
}

interface GridCell {
  primary: string;
  secondary: string;
  accent?: boolean;
}

async function renderWeeklyGridPDF(opts: {
  schoolName: string;
  versionName: string;
  title: string;
  subtitle: string;
  rows: Array<{
    label: string;
    time: string;
    isBreak: boolean;
    cells: Record<number, GridCell | null>;
  }>;
  footerSummary?: string;
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  // Landscape Letter (792 x 612)
  const page = pdfDoc.addPage([792, 612]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 36;
  const pageW = 792;
  const pageH = 612;

  // Header
  page.drawRectangle({
    x: margin,
    y: pageH - margin - 52,
    width: pageW - margin * 2,
    height: 52,
    color: rgb(0.012, 0.325, 0.643), // #0353a4
  });

  page.drawText(sanitizeText(opts.title), {
    x: margin + 14,
    y: pageH - margin - 24,
    size: 15,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(sanitizeText(`${opts.schoolName} | ${opts.versionName} | ${opts.subtitle}`), {
    x: margin + 14,
    y: pageH - margin - 42,
    size: 9,
    font,
    color: rgb(0.92, 0.9, 1),
  });

  // Table geometry
  const tableTop = pageH - margin - 66;
  const tableW = pageW - margin * 2;
  const timeColW = 92;
  const dayColW = (tableW - timeColW) / 5;
  const headerH = 24;

  // Table header
  page.drawRectangle({
    x: margin,
    y: tableTop - headerH,
    width: tableW,
    height: headerH,
    color: rgb(0.09, 0.1, 0.14),
  });

  page.drawText("Bloque / Hora", {
    x: margin + 8,
    y: tableTop - 16,
    size: 9,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  DAYS_OF_WEEK.forEach((d, i) => {
    page.drawText(sanitizeText(d.label), {
      x: margin + timeColW + i * dayColW + 8,
      y: tableTop - 16,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
  });

  const availH = tableTop - headerH - margin - 24;
  const rowCount = Math.max(opts.rows.length, 1);
  const normalRowH = Math.min(44, Math.max(22, availH / rowCount));
  let cursorY = tableTop - headerH;

  for (const row of opts.rows) {
    const rowH = row.isBreak ? Math.min(18, normalRowH * 0.55) : normalRowH;
    cursorY -= rowH;
    if (cursorY < margin + 18) break;

    if (row.isBreak) {
      page.drawRectangle({
        x: margin,
        y: cursorY,
        width: tableW,
        height: rowH,
        color: rgb(0.94, 0.93, 0.98),
        borderColor: rgb(0.84, 0.84, 0.88),
        borderWidth: 0.5,
      });
      page.drawText(sanitizeText(`${row.label} (${row.time})`), {
        x: margin + 8,
        y: cursorY + rowH / 2 - 3,
        size: 7.5,
        font: fontBold,
        color: rgb(0.35, 0.25, 0.55),
      });
      continue;
    }

    // Time column cell
    page.drawRectangle({
      x: margin,
      y: cursorY,
      width: timeColW,
      height: rowH,
      color: rgb(0.98, 0.98, 0.99),
      borderColor: rgb(0.84, 0.84, 0.88),
      borderWidth: 0.5,
    });
    page.drawText(sanitizeText(row.label), {
      x: margin + 6,
      y: cursorY + rowH - 13,
      size: 8.5,
      font: fontBold,
      color: rgb(0.1, 0.12, 0.2),
    });
    page.drawText(sanitizeText(row.time), {
      x: margin + 6,
      y: cursorY + rowH - 24,
      size: 7,
      font,
      color: rgb(0.4, 0.44, 0.52),
    });

    // Day cells
    DAYS_OF_WEEK.forEach((d, i) => {
      const cell = row.cells[d.value];
      const cellX = margin + timeColW + i * dayColW;

      page.drawRectangle({
        x: cellX,
        y: cursorY,
        width: dayColW,
        height: rowH,
        color: cell
          ? cell.accent
            ? rgb(0.99, 0.95, 0.88)
            : rgb(0.96, 0.95, 1)
          : rgb(1, 1, 1),
        borderColor: rgb(0.84, 0.84, 0.88),
        borderWidth: 0.5,
      });

      if (cell) {
        page.drawText(sanitizeText(cell.primary).slice(0, 24), {
          x: cellX + 6,
          y: cursorY + rowH - 13,
          size: 8,
          font: fontBold,
          color: rgb(0.1, 0.1, 0.18),
        });
        if (cell.secondary) {
          page.drawText(sanitizeText(cell.secondary).slice(0, 28), {
            x: cellX + 6,
            y: cursorY + rowH - 24,
            size: 6.8,
            font,
            color: rgb(0.35, 0.38, 0.46),
          });
        }
      }
    });
  }

  if (opts.footerSummary) {
    page.drawText(sanitizeText(opts.footerSummary), {
      x: margin,
      y: margin - 6,
      size: 8,
      font,
      color: rgb(0.35, 0.38, 0.46),
    });
  }

  return pdfDoc.save();
}

export const ScheduleExportService = {
  /**
   * Genera el horario semanal de un curso en PDF.
   */
  async renderCourseTimetablePDF(versionId: string, courseId: string): Promise<Uint8Array> {
    const [version, course] = await Promise.all([
      prisma.scheduleVersion.findUnique({
        where: { id: versionId },
        include: {
          school: true,
          entries: {
            where: { courseSubject: { courseId } },
            include: {
              courseSubject: {
                include: {
                  subject: true,
                  teachers: { include: { teacher: true } },
                },
              },
              timeSlot: true,
              room: true,
              teachers: { include: { teacher: true, room: true } },
            },
          },
        },
      }),
      prisma.course.findUnique({
        where: { id: courseId },
        include: {
          bellSchedule: {
            include: {
              timeSlots: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
            },
          },
        },
      }),
    ]);

    if (!version || !course) throw new Error("Versión o curso no encontrado.");

    const day1Slots = course.bellSchedule.timeSlots.filter((s) => s.dayOfWeek === 1);
    const rows = day1Slots.map((refSlot) => {
      const isBreak = refSlot.slotType !== "CLASS";
      const cells: Record<number, GridCell | null> = {};
      if (!isBreak) {
        for (const d of DAYS_OF_WEEK) {
          const match = version.entries.find(
            (e) =>
              e.timeSlot.dayOfWeek === d.value &&
              e.timeSlot.blockNumber === refSlot.blockNumber
          );
          if (match) {
            // Docentes de este bloque; el apoyo PIE en otra sala se indica entre paréntesis
            const teacherNames =
              match.teachers.length > 0
                ? match.teachers
                    .map(
                      (t) =>
                        `${t.teacher.firstName[0]}. ${t.teacher.lastName}` +
                        (t.room && t.roomId !== match.roomId ? ` (${t.room.name})` : "")
                    )
                    .join(" / ")
                : match.courseSubject.teachers
                    .map((t) => `${t.teacher.firstName[0]}. ${t.teacher.lastName}`)
                    .join(" / ");
            cells[d.value] = {
              primary: match.courseSubject.subject.name,
              secondary: `${teacherNames} - ${match.room.name}`,
            };
          } else {
            cells[d.value] = null;
          }
        }
      }
      return {
        label: isBreak
          ? refSlot.slotType === "LUNCH"
            ? "ALMUERZO"
            : "RECREO"
          : `Bloque ${refSlot.blockNumber}`,
        time: `${refSlot.startTime} - ${refSlot.endTime}`,
        isBreak,
        cells,
      };
    });

    return renderWeeklyGridPDF({
      schoolName: version.school.name,
      versionName: version.name,
      title: `Horario de Curso: ${course.name}`,
      subtitle: `Jornada: ${course.bellSchedule.name} | Total bloques: ${version.entries.length}`,
      rows,
      footerSummary: `Generado por ProfeKit Horarios - Fitness del horario: ${version.fitnessScore}/100`,
    });
  },

  /**
   * Genera el horario individual de un docente en PDF (clases, codocencias y actividades no lectivas).
   */
  async renderTeacherTimetablePDF(versionId: string, teacherId: string): Promise<Uint8Array> {
    const [version, teacher] = await Promise.all([
      prisma.scheduleVersion.findUnique({
        where: { id: versionId },
        include: {
          school: true,
          entries: {
            where: {
              courseSubject: { teachers: { some: { teacherId } } },
            },
            include: {
              courseSubject: {
                include: { course: true, subject: true, teachers: { select: { teacherId: true } } },
              },
              timeSlot: true,
              room: true,
              teachers: { include: { room: true } },
            },
          },
          nonTeachingActivities: {
            where: { teacherId },
            include: { timeSlot: true, room: true },
          },
        },
      }),
      prisma.teacher.findUnique({
        where: { id: teacherId },
        include: { qualifiedLevels: true },
      }),
    ]);

    if (!version || !teacher) throw new Error("Versión o docente no encontrado.");

    // Solo los bloques en que este docente participa (el apoyo PIE no acompaña todos los bloques),
    // con la sala donde está él/ella (ej. Aula de Recursos).
    const teacherEntries = version.entries
      .filter((e) => resolveEntryParticipants(e).some((p) => p.teacherId === teacherId))
      .map((e) => {
        const own = e.teachers.find((t) => t.teacherId === teacherId);
        return { ...e, teacherRoomName: own?.room?.name ?? e.room.name };
      });

    const [firstBell, schoolRules] = await Promise.all([
      prisma.bellSchedule.findFirst({
        where: { schoolId: version.schoolId },
        include: { timeSlots: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] } },
      }),
      prisma.schedulingRule.findMany({ where: { schoolId: version.schoolId } }),
    ]);

    const leyPolicy = extractLey20903Policy(schoolRules);
    const blockDurationMinutes = resolveBlockDurationMinutes(
      firstBell ? [firstBell] : [],
      leyPolicy
    );
    const teachesBasic1to4 =
      teacherEntries.some((e) => e.courseSubject.course.levelCode === "BASIC_1_4") ||
      (teacherEntries.length === 0 &&
        teacher.qualifiedLevels.some((ql) => ql.levelCode === "BASIC_1_4"));
    const ratio = resolveTeacherLey20903Ratio(teacher.ley20903Ratio, teachesBasic1to4, leyPolicy);
    const breakdown = calculateLey20903Breakdown({
      contractHours: teacher.contractHours,
      ratio,
      blockDurationMinutes,
      includeBreaksInTeaching: leyPolicy.includeBreaksInTeaching,
      breakMinutesPerBlock: leyPolicy.breakMinutesPerBlock,
      assignedTeachingBlocks: teacherEntries.length,
      scheduledNonTeachingBlocks: version.nonTeachingActivities.length,
    });

    const day1Slots = (firstBell?.timeSlots ?? []).filter((s) => s.dayOfWeek === 1);
    const rows = day1Slots.map((refSlot) => {
      const isBreak = refSlot.slotType !== "CLASS";
      const cells: Record<number, GridCell | null> = {};
      if (!isBreak) {
        for (const d of DAYS_OF_WEEK) {
          const entry = teacherEntries.find(
            (e) =>
              e.timeSlot.dayOfWeek === d.value &&
              e.timeSlot.blockNumber === refSlot.blockNumber
          );
          if (entry) {
            cells[d.value] = {
              primary: `${entry.courseSubject.subject.code} - ${entry.courseSubject.course.name}`,
              secondary: entry.teacherRoomName,
            };
          } else {
            const act = version.nonTeachingActivities.find(
              (a) =>
                a.timeSlot.dayOfWeek === d.value &&
                a.timeSlot.blockNumber === refSlot.blockNumber
            );
            cells[d.value] = act
              ? {
                  primary: act.title,
                  secondary: ACTIVITY_TYPE_LABELS[act.activityType],
                  accent: true,
                }
              : null;
          }
        }
      }
      return {
        label: isBreak
          ? refSlot.slotType === "LUNCH"
            ? "ALMUERZO"
            : "RECREO"
          : `Bloque ${refSlot.blockNumber}`,
        time: `${refSlot.startTime} - ${refSlot.endTime}`,
        isBreak,
        cells,
      };
    });

    return renderWeeklyGridPDF({
      schoolName: version.school.name,
      versionName: version.name,
      title: `Horario Docente: ${teacher.firstName} ${teacher.lastName}`,
      subtitle: `Contrato: ${teacher.contractHours}h (${breakdown.ratioLabel}) | Lectivos: ${teacherEntries.length}/${breakdown.legalMaxTeachingBlocks} blq (${breakdown.actualTeachingPct}%) | No lectivos min: ${formatChronologicalMinutes(breakdown.minNonTeachingChronologicalMinutes)} (agendados: ${version.nonTeachingActivities.length} blq)`,
      rows,
      footerSummary: `Generado por ProfeKit Horarios - Ley 20.903 (${breakdown.ratioLabel}, bloque ${breakdown.blockDurationMinutes}m${breakdown.breakMinutesPerBlock > 0 ? ` + ${breakdown.breakMinutesPerBlock}m recreo` : ""})`,
    });
  },

  /**
   * Genera la programación semanal de ocupación de una sala o espacio especial en PDF.
   */
  async renderRoomOccupancyPDF(versionId: string, roomId: string): Promise<Uint8Array> {
    const [version, room] = await Promise.all([
      prisma.scheduleVersion.findUnique({
        where: { id: versionId },
        include: {
          school: true,
          entries: {
            // Bloques que usan la sala, o en que un docente de apoyo trabaja en ella (Aula de Recursos)
            where: { OR: [{ roomId }, { teachers: { some: { roomId } } }] },
            include: {
              courseSubject: {
                include: {
                  course: true,
                  subject: true,
                  teachers: { include: { teacher: true } },
                },
              },
              timeSlot: true,
              teachers: { include: { teacher: true } },
            },
          },
        },
      }),
      prisma.room.findUnique({ where: { id: roomId } }),
    ]);

    if (!version || !room) throw new Error("Versión o sala no encontrada.");

    const firstBell = await prisma.bellSchedule.findFirst({
      where: { schoolId: version.schoolId },
      include: { timeSlots: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] } },
    });

    const day1Slots = (firstBell?.timeSlots ?? []).filter((s) => s.dayOfWeek === 1);
    const rows = day1Slots.map((refSlot) => {
      const isBreak = refSlot.slotType !== "CLASS";
      const cells: Record<number, GridCell | null> = {};
      if (!isBreak) {
        for (const d of DAYS_OF_WEEK) {
          const entry = version.entries.find(
            (e) =>
              e.timeSlot.dayOfWeek === d.value &&
              e.timeSlot.blockNumber === refSlot.blockNumber
          );
          if (entry) {
            const teacher =
              entry.roomId === roomId
                ? (entry.courseSubject.teachers.find((t) => t.role === "LEAD") ??
                    entry.courseSubject.teachers[0])?.teacher
                : entry.teachers.find((t) => t.roomId === roomId)?.teacher;
            cells[d.value] = {
              primary: `${entry.courseSubject.course.name} - ${entry.courseSubject.subject.code}`,
              secondary: teacher ? `${teacher.firstName[0]}. ${teacher.lastName}` : "",
            };
          } else {
            cells[d.value] = null;
          }
        }
      }
      return {
        label: isBreak
          ? refSlot.slotType === "LUNCH"
            ? "ALMUERZO"
            : "RECREO"
          : `Bloque ${refSlot.blockNumber}`,
        time: `${refSlot.startTime} - ${refSlot.endTime}`,
        isBreak,
        cells,
      };
    });

    return renderWeeklyGridPDF({
      schoolName: version.school.name,
      versionName: version.name,
      title: `Ocupacion de Recinto: ${room.name}`,
      subtitle: `Tipo: ${room.roomType} | Capacidad: ${room.capacity} | Bloques ocupados: ${version.entries.length}`,
      rows,
      footerSummary: `Generado por ProfeKit Horarios - Programacion de Espacios Compartidos`,
    });
  },

  /**
   * Genera la sábana maestra en tamaño Carta horizontal (792 x 612 pt):
   * Filas = Bloques + Recreos/Almuerzo, Columnas = Cursos de ancho uniforme (1 página por día).
   */
  async renderMasterWallChartPDF(versionId: string): Promise<Uint8Array> {
    const version = await prisma.scheduleVersion.findUnique({
      where: { id: versionId },
      include: {
        school: true,
        entries: {
          include: {
            courseSubject: {
              include: {
                course: true,
                subject: true,
                teachers: { include: { teacher: true } },
              },
            },
            timeSlot: true,
            room: true,
          },
        },
      },
    });
    if (!version) throw new Error("Versión no encontrada.");

    const [courses, firstBell] = await Promise.all([
      prisma.course.findMany({
        where: { schoolId: version.schoolId },
        include: { defaultRoom: true },
        orderBy: { name: "asc" },
      }),
      prisma.bellSchedule.findFirst({
        where: { schoolId: version.schoolId },
        include: { timeSlots: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] } },
      }),
    ]);

    const maxUsedBlock = Math.max(
      version.entries.reduce((m, e) => Math.max(m, e.timeSlot.blockNumber), 0),
      6
    );
    const day1All = (firstBell?.timeSlots ?? []).filter((s) => s.dayOfWeek === 1);
    const lastClassIdx = day1All.reduce(
      (last, s, idx) =>
        s.slotType === "CLASS" && s.blockNumber <= maxUsedBlock ? idx : last,
      -1
    );
    const visibleSlots = lastClassIdx >= 0 ? day1All.slice(0, lastClassIdx + 1) : day1All;

    const pdfDoc = await PDFDocument.create();
    // Tamaño Carta horizontal (US Letter Landscape): 792 x 612 pt
    const pageW = 792;
    const pageH = 612;
    const margin = 28;
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    for (const day of DAYS_OF_WEEK) {
      const page = pdfDoc.addPage([pageW, pageH]);
      page.drawRectangle({
        x: margin,
        y: pageH - margin - 40,
        width: pageW - margin * 2,
        height: 40,
        color: rgb(0.529, 0.129, 0.992),
      });
      page.drawText(
        sanitizeText(`Sabana Maestra - ${day.label} | ${version.school.name} (${version.name})`),
        {
          x: margin + 12,
          y: pageH - margin - 25,
          size: 13,
          font: fontBold,
          color: rgb(1, 1, 1),
        }
      );

      const tableTop = pageH - margin - 50;
      const tableW = pageW - margin * 2;
      const blockColW = 86;
      const courseCount = Math.max(courses.length, 1);
      const courseColW = (tableW - blockColW) / courseCount;
      const headerH = 26;

      page.drawRectangle({
        x: margin,
        y: tableTop - headerH,
        width: tableW,
        height: headerH,
        color: rgb(0.1, 0.11, 0.16),
      });
      page.drawText("Bloque / Hora", {
        x: margin + 6,
        y: tableTop - 16,
        size: 8,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      courses.forEach((c, i) => {
        const cx = margin + blockColW + i * courseColW;
        page.drawText(sanitizeText(c.name).slice(0, 18), {
          x: cx + 5,
          y: tableTop - 12,
          size: 8,
          font: fontBold,
          color: rgb(1, 1, 1),
        });
        if (c.defaultRoom) {
          page.drawText(sanitizeText(c.defaultRoom.name).slice(0, 18), {
            x: cx + 5,
            y: tableTop - 22,
            size: 6.5,
            font,
            color: rgb(0.8, 0.82, 0.9),
          });
        }
      });

      const classCount = visibleSlots.filter((s) => s.slotType === "CLASS").length || 1;
      const breakCount = visibleSlots.filter((s) => s.slotType !== "CLASS").length;
      const breakH = 16;
      const availH = tableTop - headerH - margin - 14 - breakCount * breakH;
      const rowH = Math.min(54, Math.max(26, availH / classCount));
      let y = tableTop - headerH;

      for (const slot of visibleSlots) {
        if (slot.slotType !== "CLASS") {
          y -= breakH;
          if (y < margin + 12) break;
          page.drawRectangle({
            x: margin,
            y,
            width: tableW,
            height: breakH,
            color: rgb(0.94, 0.93, 0.98),
            borderColor: rgb(0.82, 0.82, 0.88),
            borderWidth: 0.5,
          });
          page.drawText(
            sanitizeText(
              `${slot.slotType === "LUNCH" ? "ALMUERZO" : "RECREO"} (${slot.startTime} - ${slot.endTime})`
            ),
            {
              x: margin + 8,
              y: y + 5,
              size: 7,
              font: fontBold,
              color: rgb(0.35, 0.25, 0.55),
            }
          );
          continue;
        }

        y -= rowH;
        if (y < margin + 12) break;

        page.drawRectangle({
          x: margin,
          y,
          width: blockColW,
          height: rowH,
          color: rgb(0.97, 0.97, 0.99),
          borderColor: rgb(0.82, 0.82, 0.88),
          borderWidth: 0.5,
        });
        page.drawText(`Bloque ${slot.blockNumber}`, {
          x: margin + 6,
          y: y + rowH - 13,
          size: 8,
          font: fontBold,
          color: rgb(0.1, 0.1, 0.2),
        });
        page.drawText(`${slot.startTime}-${slot.endTime}`, {
          x: margin + 6,
          y: y + rowH - 23,
          size: 6.5,
          font,
          color: rgb(0.4, 0.44, 0.52),
        });

        courses.forEach((course, i) => {
          const entry = version.entries.find(
            (e) =>
              e.courseSubject.courseId === course.id &&
              e.timeSlot.dayOfWeek === day.value &&
              e.timeSlot.blockNumber === slot.blockNumber
          );
          const x = margin + blockColW + i * courseColW;
          page.drawRectangle({
            x,
            y,
            width: courseColW,
            height: rowH,
            color: entry ? rgb(0.96, 0.95, 1) : rgb(1, 1, 1),
            borderColor: rgb(0.82, 0.82, 0.88),
            borderWidth: 0.5,
          });
          if (entry) {
            const teacher = entry.courseSubject.teachers[0]?.teacher;
            page.drawText(sanitizeText(entry.courseSubject.subject.code), {
              x: x + 5,
              y: y + rowH - 13,
              size: 8.5,
              font: fontBold,
              color: rgb(0.15, 0.1, 0.35),
            });
            if (teacher) {
              page.drawText(
                sanitizeText(`${teacher.firstName[0]}. ${teacher.lastName}`).slice(0, 20),
                {
                  x: x + 5,
                  y: y + rowH - 24,
                  size: 7,
                  font,
                  color: rgb(0.32, 0.35, 0.44),
                }
              );
            }
          }
        });
      }

      page.drawText(
        sanitizeText(`Generado por ProfeKit Horarios - Formato Carta Horizontal | Fitness: ${version.fitnessScore}/100`),
        {
          x: margin,
          y: margin - 6,
          size: 7.5,
          font,
          color: rgb(0.4, 0.42, 0.5),
        }
      );
    }

    return pdfDoc.save();
  },

  /**
   * Empaqueta todos los reportes PDF en un archivo .zip organizado por carpetas:
   * cursos/, profesores/, salas/ y maestro/.
   */
  async exportMasterScheduleBundle(versionId: string): Promise<Uint8Array> {
    const version = await prisma.scheduleVersion.findUnique({
      where: { id: versionId },
      include: { school: true },
    });
    if (!version) throw new Error("Versión no encontrada.");

    const [courses, teachers, rooms] = await Promise.all([
      prisma.course.findMany({ where: { schoolId: version.schoolId } }),
      prisma.teacher.findMany({ where: { schoolId: version.schoolId } }),
      prisma.room.findMany({ where: { schoolId: version.schoolId } }),
    ]);

    const zip = new JSZip();
    const cursosFolder = zip.folder("cursos");
    const profesoresFolder = zip.folder("profesores");
    const salasFolder = zip.folder("salas");
    const maestroFolder = zip.folder("maestro");

    for (const c of courses) {
      const pdf = await this.renderCourseTimetablePDF(versionId, c.id);
      cursosFolder?.file(`${slugify(c.code || c.name)}.pdf`, pdf);
    }

    for (const t of teachers) {
      const pdf = await this.renderTeacherTimetablePDF(versionId, t.id);
      profesoresFolder?.file(`${slugify(`${t.firstName}_${t.lastName}`)}.pdf`, pdf);
    }

    for (const r of rooms) {
      const pdf = await this.renderRoomOccupancyPDF(versionId, r.id);
      salasFolder?.file(`${slugify(r.name)}.pdf`, pdf);
    }

    const masterPdf = await this.renderMasterWallChartPDF(versionId);
    maestroFolder?.file(`sabana_maestra_${slugify(version.name)}.pdf`, masterPdf);

    return zip.generateAsync({ type: "uint8array" });
  },
};
