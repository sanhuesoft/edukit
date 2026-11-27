import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { TimetableSolverService } from "@/services/TimetableSolverService";
import type { ScheduleVersionStatus } from "@prisma/client";

export async function GET(
  _request: Request,
  context: { params: Promise<{ versionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { versionId } = await context.params;

  const version = await prisma.scheduleVersion.findUnique({
    where: { id: versionId },
    include: {
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
          teachers: { select: { id: true, teacherId: true, roomId: true } },
        },
      },
      nonTeachingActivities: {
        include: {
          teacher: true,
          timeSlot: true,
          room: true,
        },
      },
      changeLogs: {
        orderBy: { createdAt: "desc" },
        take: 25,
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  if (!version) {
    return NextResponse.json({ error: "Versión no encontrada." }, { status: 404 });
  }
  if (user.role === "SCHOOL_ADMIN" && version.schoolId !== user.schoolId) {
    return NextResponse.json({ error: "Sin acceso a esta versión." }, { status: 403 });
  }

  const audit = await TimetableSolverService.detectConflicts(versionId);
  if (audit.fitnessScore !== version.fitnessScore) {
    await prisma.scheduleVersion.update({
      where: { id: versionId },
      data: { fitnessScore: audit.fitnessScore },
    });
    version.fitnessScore = audit.fitnessScore;
  }

  return NextResponse.json({ version, audit });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ versionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { versionId } = await context.params;
  const body = (await request.json()) as {
    name?: string;
    status?: ScheduleVersionStatus;
  };

  const existing = await prisma.scheduleVersion.findUnique({ where: { id: versionId } });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (user.role === "SCHOOL_ADMIN" && existing.schoolId !== user.schoolId) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  // Si se publica esta versión, archivar la publicada anterior
  const updated = await prisma.$transaction(async (tx) => {
    if (body.status === "PUBLISHED") {
      await tx.scheduleVersion.updateMany({
        where: { schoolId: existing.schoolId, status: "PUBLISHED", id: { not: versionId } },
        data: { status: "ARCHIVED" },
      });
    }
    return tx.scheduleVersion.update({
      where: { id: versionId },
      data: {
        ...(body.name ? { name: body.name.trim() } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
    });
  });

  return NextResponse.json({ version: updated });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ versionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { versionId } = await context.params;
  const existing = await prisma.scheduleVersion.findUnique({ where: { id: versionId } });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (user.role === "SCHOOL_ADMIN" && existing.schoolId !== user.schoolId) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  await prisma.scheduleVersion.delete({ where: { id: versionId } });
  return NextResponse.json({ ok: true });
}
