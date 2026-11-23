import { NextResponse } from "next/server";
import { getCurrentUser, resolveActiveSchoolId } from "@/lib/auth";
import { TimetableSolverService } from "@/services/TimetableSolverService";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const schoolId = await resolveActiveSchoolId(user);
  if (!schoolId) {
    return NextResponse.json({ error: "No hay establecimiento activo." }, { status: 404 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      baseVersionId?: string;
      maxOptimizationSteps?: number;
    };

    const result = await TimetableSolverService.generateSchedule(schoolId, {
      name: body.name,
      baseVersionId: body.baseVersionId,
      maxOptimizationSteps: body.maxOptimizationSteps,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al generar el horario." },
      { status: 400 }
    );
  }
}
