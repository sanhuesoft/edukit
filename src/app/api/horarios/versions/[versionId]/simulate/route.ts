import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  TimetableSolverService,
  type SimulateSwapPayload,
} from "@/services/TimetableSolverService";

export async function POST(
  request: Request,
  context: { params: Promise<{ versionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const { versionId } = await context.params;
    const body = (await request.json()) as SimulateSwapPayload;
    const result = await TimetableSolverService.simulateSwap(versionId, body);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al simular cambio." },
      { status: 400 }
    );
  }
}
