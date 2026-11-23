import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  TimetableSolverService,
  type ScheduleConflict,
} from "@/services/TimetableSolverService";
import type { Prisma, SchedulingRule } from "@prisma/client";

export interface AISuggestionAction {
  type: "MOVE" | "SWAP";
  entryAId: string;
  entryBId?: string;
  targetTimeSlotId?: string;
}

export interface AISuggestionItem {
  id: string;
  kind: "CONFLICT_RESOLUTION" | "PEDAGOGICAL_AUDIT";
  title: string;
  rationale: string;
  expectedDeltaFitness: number;
  applied: boolean;
  action?: AISuggestionAction;
}

async function enhanceRationalesWithOpenAI(
  mode: "CONFLICT" | "AUDIT",
  suggestions: AISuggestionItem[],
  summaryContext: string
): Promise<AISuggestionItem[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || suggestions.length === 0) return suggestions;

  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const prompt = [
      `Eres un asesor experto en gestión curricular chilena (UTP) y optimización de horarios escolares.`,
      `Modo: ${mode === "CONFLICT" ? "Resolución de conflictos" : "Auditoría pedagógica"}.`,
      `Contexto: ${summaryContext}`,
      `Se han identificado estas propuestas accionables (JSON):`,
      JSON.stringify(
        suggestions.map((s) => ({ id: s.id, title: s.title, rationale: s.rationale }))
      ),
      `Devuelve un JSON con la clave "items": [{ "id": "...", "title": "...", "rationale": "..." }] mejorando la redacción pedagógica en español de Chile (conciso, 1-2 frases por propuesta). No cambies los IDs.`,
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) return suggestions;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) return suggestions;

    const parsed = JSON.parse(rawContent) as {
      items?: Array<{ id: string; title?: string; rationale?: string }>;
    };
    if (!Array.isArray(parsed.items)) return suggestions;

    const byId = new Map(parsed.items.map((i) => [i.id, i]));
    return suggestions.map((s) => {
      const enhanced = byId.get(s.id);
      if (!enhanced) return s;
      return {
        ...s,
        title: enhanced.title || s.title,
        rationale: enhanced.rationale || s.rationale,
      };
    });
  } catch {
    return suggestions;
  }
}

export const ScheduleAIService = {
  /**
   * Analiza conflictos duros o bloqueos del solver y genera 2 a 3 propuestas accionables
   * verificadas con simulateSwap.
   */
  async resolveConflictsWithAI(
    versionId: string,
    conflicts?: ScheduleConflict[],
    rules?: SchedulingRule[]
  ): Promise<AISuggestionItem[]> {
    const activeRuleCount = rules?.length ?? 0;
    const version = await prisma.scheduleVersion.findUnique({
      where: { id: versionId },
      include: {
        entries: {
          include: {
            courseSubject: { include: { course: true, subject: true } },
            timeSlot: true,
          },
        },
      },
    });
    if (!version) throw new Error("Versión no encontrada.");

    const audit = await TimetableSolverService.detectConflicts(versionId);
    const activeConflicts = conflicts ?? audit.hardConflicts;
    const suggestions: AISuggestionItem[] = [];

    const allSlots = await prisma.timeSlot.findMany({
      where: {
        bellSchedule: { schoolId: version.schoolId },
        slotType: "CLASS",
      },
      orderBy: [{ dayOfWeek: "asc" }, { blockNumber: "asc" }],
    });

    for (const conflict of activeConflicts.slice(0, 5)) {
      if (suggestions.length >= 3) break;
      const entryId = conflict.entryIds[0];
      if (!entryId) continue;

      const entry = version.entries.find((e) => e.id === entryId);
      if (!entry || entry.isLocked) continue;

      // Buscar un bloque destino en la misma jornada que reduzca conflictos
      const compatibleSlots = allSlots.filter(
        (s) => s.bellScheduleId === entry.timeSlot.bellScheduleId && s.id !== entry.timeSlotId
      );

      for (const slot of compatibleSlots.slice(0, 15)) {
        const sim = await TimetableSolverService.simulateSwap(versionId, {
          mode: "MOVE",
          entryAId: entry.id,
          targetTimeSlotId: slot.id,
        });

        if (sim.resolvedHardConflicts.length > 0 && sim.newHardConflicts.length === 0) {
          suggestions.push({
            id: crypto.randomUUID(),
            kind: "CONFLICT_RESOLUTION",
            title: `Reubicar ${entry.courseSubject.subject.name} (${entry.courseSubject.course.name})`,
            rationale: `Mover del Día ${entry.timeSlot.dayOfWeek} Bloque ${entry.timeSlot.blockNumber} al Día ${slot.dayOfWeek} Bloque ${slot.blockNumber} elimina el conflicto "${conflict.message}" sin generar nuevos topones.`,
            expectedDeltaFitness: sim.deltaFitness,
            applied: false,
            action: {
              type: "MOVE",
              entryAId: entry.id,
              targetTimeSlotId: slot.id,
            },
          });
          break;
        }
      }
    }

    // Si no hubo conflictos duros o no se encontró movimiento directo, ofrecer recomendación de relajación
    if (suggestions.length === 0) {
      suggestions.push({
        id: crypto.randomUUID(),
        kind: "CONFLICT_RESOLUTION",
        title:
          activeConflicts.length === 0
            ? "Horario sin conflictos duros detectados"
            : "Revisar disponibilidad docente o bloques fijados",
        rationale:
          activeConflicts.length === 0
            ? "No existen topones de docentes, salas ni cursos. Puedes ejecutar la Auditoría Pedagógica para optimizar la distribución semanal."
            : "Los conflictos actuales involucran bloques fijados manualmente o restricciones de disponibilidad estrictas. Sugerimos liberar temporalmente el candado de un bloque o flexibilizar la regla de franja horaria.",
        expectedDeltaFitness: 0,
        applied: false,
      });
    }

    const enhanced = await enhanceRationalesWithOpenAI(
      "CONFLICT",
      suggestions,
      `Hard conflicts: ${activeConflicts.length}, Reglas: ${activeRuleCount}, Fitness actual: ${audit.fitnessScore}`
    );

    await prisma.scheduleVersion.update({
      where: { id: versionId },
      data: { aiSuggestions: enhanced as unknown as Prisma.InputJsonValue },
    });

    return enhanced;
  },

  /**
   * Audita la calidad pedagógica global de un horario sin topones y propone permutaciones
   * concretas (ej. mover Matemática/Lenguaje desde viernes tarde hacia bloques de mañana).
   */
  async auditAndSuggestImprovements(versionId: string): Promise<AISuggestionItem[]> {
    const version = await prisma.scheduleVersion.findUnique({
      where: { id: versionId },
      include: {
        entries: {
          include: {
            courseSubject: { include: { course: true, subject: true } },
            timeSlot: true,
          },
        },
      },
    });
    if (!version) throw new Error("Versión no encontrada.");

    const audit = await TimetableSolverService.detectConflicts(versionId);
    const suggestions: AISuggestionItem[] = [];

    // 1. Evaluar swaps entre bloques del mismo curso para mejorar fitness (ej. sacar asignaturas densas del viernes tarde o reducir ventanas)
    const entriesByCourse = new Map<string, typeof version.entries>();
    for (const e of version.entries) {
      if (e.isLocked || e.courseSubject.syncGroupCode) continue;
      const arr = entriesByCourse.get(e.courseSubject.courseId) ?? [];
      arr.push(e);
      entriesByCourse.set(e.courseSubject.courseId, arr);
    }

    for (const [, courseEntries] of entriesByCourse) {
      if (suggestions.length >= 3) break;
      // Priorizar entradas en tarde (bloque >= 5) intercambiables con mañana (bloque <= 4)
      const afternoon = courseEntries.filter((e) => e.timeSlot.blockNumber >= 5);
      const morning = courseEntries.filter((e) => e.timeSlot.blockNumber <= 4);

      for (const a of afternoon.slice(0, 4)) {
        if (suggestions.length >= 3) break;
        for (const m of morning.slice(0, 4)) {
          if (a.courseSubjectId === m.courseSubjectId) continue;

          const sim = await TimetableSolverService.simulateSwap(versionId, {
            mode: "SWAP",
            entryAId: a.id,
            entryBId: m.id,
          });

          if (sim.valid && sim.deltaFitness > 0.5) {
            suggestions.push({
              id: crypto.randomUUID(),
              kind: "PEDAGOGICAL_AUDIT",
              title: `Intercambiar ${a.courseSubject.subject.code} y ${m.courseSubject.subject.code} en ${a.courseSubject.course.name}`,
              rationale: `Permutar ${a.courseSubject.subject.name} (Día ${a.timeSlot.dayOfWeek} B${a.timeSlot.blockNumber}) con ${m.courseSubject.subject.name} (Día ${m.timeSlot.dayOfWeek} B${m.timeSlot.blockNumber}) mejora el equilibrio pedagógico y reduce penalizaciones blandas (+${sim.deltaFitness} pts).`,
              expectedDeltaFitness: sim.deltaFitness,
              applied: false,
              action: {
                type: "SWAP",
                entryAId: a.id,
                entryBId: m.id,
              },
            });
            break;
          }
        }
      }
    }

    if (suggestions.length === 0) {
      suggestions.push({
        id: crypto.randomUUID(),
        kind: "PEDAGOGICAL_AUDIT",
        title: "Distribución pedagógica en nivel óptimo",
        rationale: `El horario alcanza un puntaje de ${audit.fitnessScore}/100 con ${audit.hardCount} conflictos duros y ${audit.softCount} observaciones blandas. No se detectaron permutaciones simples con ganancia significativa.`,
        expectedDeltaFitness: 0,
        applied: false,
      });
    }

    const enhanced = await enhanceRationalesWithOpenAI(
      "AUDIT",
      suggestions,
      `Fitness: ${audit.fitnessScore}/100, Soft violations: ${audit.softCount}`
    );

    await prisma.scheduleVersion.update({
      where: { id: versionId },
      data: { aiSuggestions: enhanced as unknown as Prisma.InputJsonValue },
    });

    return enhanced;
  },

  /**
   * Ejecuta automáticamente una sugerencia de la IA, registra el cambio en schedule_change_logs
   * con action_type = AI_APPLY y recalcula fitness_score.
   */
  async applyAISuggestion(versionId: string, suggestionId: string, userId: string) {
    const version = await prisma.scheduleVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new Error("Versión no encontrada.");

    const suggestions = (Array.isArray(version.aiSuggestions)
      ? version.aiSuggestions
      : []) as unknown as AISuggestionItem[];

    const target = suggestions.find((s) => s.id === suggestionId);
    if (!target || !target.action) {
      throw new Error("Sugerencia de IA no encontrada o no contiene una acción ejecutable.");
    }
    if (target.applied) {
      throw new Error("Esta sugerencia ya fue aplicada anteriormente.");
    }

    await prisma.$transaction(async (tx) => {
      const action = target.action!;
      const prevEntries: Array<{ id: string; timeSlotId: string; roomId: string; isLocked: boolean }> = [];
      const nextEntries: Array<{ id: string; timeSlotId: string; roomId: string; isLocked: boolean }> = [];

      if (action.type === "MOVE" && action.targetTimeSlotId) {
        const entryA = await tx.scheduleEntry.findUnique({ where: { id: action.entryAId } });
        if (!entryA) throw new Error("Bloque origen no encontrado.");
        prevEntries.push({
          id: entryA.id,
          timeSlotId: entryA.timeSlotId,
          roomId: entryA.roomId,
          isLocked: entryA.isLocked,
        });
        const updated = await tx.scheduleEntry.update({
          where: { id: entryA.id },
          data: { timeSlotId: action.targetTimeSlotId },
        });
        nextEntries.push({
          id: updated.id,
          timeSlotId: updated.timeSlotId,
          roomId: updated.roomId,
          isLocked: updated.isLocked,
        });
      } else if (action.type === "SWAP" && action.entryBId) {
        const [entryA, entryB] = await Promise.all([
          tx.scheduleEntry.findUnique({ where: { id: action.entryAId } }),
          tx.scheduleEntry.findUnique({ where: { id: action.entryBId } }),
        ]);
        if (!entryA || !entryB) throw new Error("Bloques a permutar no encontrados.");
        prevEntries.push(
          { id: entryA.id, timeSlotId: entryA.timeSlotId, roomId: entryA.roomId, isLocked: entryA.isLocked },
          { id: entryB.id, timeSlotId: entryB.timeSlotId, roomId: entryB.roomId, isLocked: entryB.isLocked }
        );
        const updatedA = await tx.scheduleEntry.update({
          where: { id: entryA.id },
          data: { timeSlotId: entryB.timeSlotId },
        });
        const updatedB = await tx.scheduleEntry.update({
          where: { id: entryB.id },
          data: { timeSlotId: entryA.timeSlotId },
        });
        nextEntries.push(
          { id: updatedA.id, timeSlotId: updatedA.timeSlotId, roomId: updatedA.roomId, isLocked: updatedA.isLocked },
          { id: updatedB.id, timeSlotId: updatedB.timeSlotId, roomId: updatedB.roomId, isLocked: updatedB.isLocked }
        );
      }

      const updatedSuggestions = suggestions.map((s) =>
        s.id === suggestionId ? { ...s, applied: true } : s
      );

      await tx.scheduleVersion.update({
        where: { id: versionId },
        data: {
          versionLockNumber: { increment: 1 },
          aiSuggestions: updatedSuggestions as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.scheduleChangeLog.create({
        data: {
          versionId,
          userId,
          actionType: "AI_APPLY",
          previousState: { entries: prevEntries, suggestionId } as unknown as Prisma.InputJsonValue,
          newState: { entries: nextEntries, suggestionId } as unknown as Prisma.InputJsonValue,
        },
      });
    });

    const audit = await TimetableSolverService.detectConflicts(versionId);
    const syncedVersion = await prisma.scheduleVersion.update({
      where: { id: versionId },
      data: { fitnessScore: audit.fitnessScore },
    });

    return { version: syncedVersion, audit };
  },
};
