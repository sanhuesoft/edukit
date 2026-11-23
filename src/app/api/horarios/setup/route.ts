import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, resolveActiveSchoolId } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const schoolId = await resolveActiveSchoolId(user, searchParams.get("schoolId"));
  if (!schoolId) {
    return NextResponse.json({ error: "No hay establecimiento activo." }, { status: 404 });
  }

  const [school, bellSchedules, rooms, subjects, teachers, courses, rules, versions] =
    await Promise.all([
      prisma.school.findUnique({ where: { id: schoolId } }),
      prisma.bellSchedule.findMany({
        where: { schoolId },
        include: {
          timeSlots: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.room.findMany({
        where: { schoolId },
        orderBy: [{ roomType: "asc" }, { name: "asc" }],
      }),
      prisma.subject.findMany({
        where: { schoolId },
        orderBy: { name: "asc" },
      }),
      prisma.teacher.findMany({
        where: { schoolId },
        include: {
          qualifiedSubjects: { include: { subject: true } },
          qualifiedLevels: true,
          courseSubjects: {
            include: {
              courseSubject: {
                include: { course: true, subject: true },
              },
            },
          },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
      prisma.course.findMany({
        where: { schoolId },
        include: {
          bellSchedule: true,
          defaultRoom: true,
          courseSubjects: {
            include: {
              subject: true,
              teachers: { include: { teacher: true } },
            },
            orderBy: { subject: { name: "asc" } },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.schedulingRule.findMany({
        where: { schoolId },
        orderBy: [{ weight: "asc" }, { createdAt: "desc" }],
      }),
      prisma.scheduleVersion.findMany({
        where: { schoolId },
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: { entries: true, nonTeachingActivities: true, changeLogs: true },
          },
        },
      }),
    ]);

  return NextResponse.json({
    school,
    bellSchedules,
    rooms,
    subjects,
    teachers,
    courses,
    rules,
    versions,
  });
}
