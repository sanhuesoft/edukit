import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ScheduleOperationsService } from "@/services/ScheduleOperationsService";

export async function POST(
  request: Request,
  context: { params: Promise<{ versionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const { versionId } = await context.params;
    const body = (await request.json()) as {
      absentTeacherId: string;
      startDate: string;
      endDate: string;
    };

    const result = await ScheduleOperationsService.generateSubstitutionPlan(
      versionId,
      body.absentTeacherId,
      { startDate: body.startDate, endDate: body.endDate }
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al generar plan de reemplazos." },
      { status: 400 }
    );
  }
}
