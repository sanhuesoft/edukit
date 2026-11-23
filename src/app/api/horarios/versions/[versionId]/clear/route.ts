import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  OptimisticLockError,
  ScheduleOperationsService,
} from "@/services/ScheduleOperationsService";

export async function POST(
  request: Request,
  context: { params: Promise<{ versionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const { versionId } = await context.params;
    const existing = await prisma.scheduleVersion.findUnique({
      where: { id: versionId },
      select: { id: true, schoolId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Versión no encontrada." }, { status: 404 });
    }
    if (user.role === "SCHOOL_ADMIN" && existing.schoolId !== user.schoolId) {
      return NextResponse.json({ error: "Sin acceso a esta versión." }, { status: 403 });
    }

    let expectedLockNumber: number | undefined;
    try {
      const body = (await request.json()) as { expectedLockNumber?: number };
      expectedLockNumber = body.expectedLockNumber;
    } catch {
      // Body opcional
    }

    const result = await ScheduleOperationsService.clearSchedule(
      versionId,
      expectedLockNumber
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OptimisticLockError) {
      return NextResponse.json(
        { error: err.message, currentLockNumber: err.currentLockNumber },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al limpiar el horario." },
      { status: 400 }
    );
  }
}
