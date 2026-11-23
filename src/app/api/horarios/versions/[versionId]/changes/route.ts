import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  OptimisticLockError,
  ScheduleOperationsService,
  type ManualChangePayload,
} from "@/services/ScheduleOperationsService";

export async function POST(
  request: Request,
  context: { params: Promise<{ versionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const { versionId } = await context.params;
    const body = (await request.json()) as {
      expectedLockNumber: number;
      change: ManualChangePayload;
    };

    const result = await ScheduleOperationsService.applyManualChange(
      versionId,
      user.id,
      body.expectedLockNumber,
      body.change
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
      { error: err instanceof Error ? err.message : "Error al aplicar cambio." },
      { status: 400 }
    );
  }
}
