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
    const body = (await request.json()) as { logId: string };
    const result = await ScheduleOperationsService.revertChange(
      versionId,
      body.logId,
      user.id
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al deshacer cambio." },
      { status: 400 }
    );
  }
}
