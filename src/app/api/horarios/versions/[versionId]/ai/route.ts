import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ScheduleAIService } from "@/services/ScheduleAIService";

export async function POST(
  request: Request,
  context: { params: Promise<{ versionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const { versionId } = await context.params;
    const body = (await request.json()) as {
      action: "resolve" | "audit" | "apply";
      suggestionId?: string;
    };

    if (body.action === "resolve") {
      const suggestions = await ScheduleAIService.resolveConflictsWithAI(versionId);
      return NextResponse.json({ suggestions });
    }

    if (body.action === "audit") {
      const suggestions = await ScheduleAIService.auditAndSuggestImprovements(versionId);
      return NextResponse.json({ suggestions });
    }

    if (body.action === "apply") {
      if (!body.suggestionId) {
        return NextResponse.json({ error: "suggestionId requerido" }, { status: 400 });
      }
      const result = await ScheduleAIService.applyAISuggestion(
        versionId,
        body.suggestionId,
        user.id
      );
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Acción de IA no soportada." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error en asistente de IA." },
      { status: 400 }
    );
  }
}
