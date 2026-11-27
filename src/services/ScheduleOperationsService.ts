import { prisma } from "@/lib/prisma";
import { resolveEntryParticipants } from "@/lib/scheduling/entryParticipants";
import { TimetableSolverService } from "@/services/TimetableSolverService";
import { Prisma, type ScheduleChangeActionType } from "@prisma/client";

export class OptimisticLockError extends Error {
  public readonly currentLockNumber: number;
  constructor(expected: number, current: number) {
    super(
      `Conflicto de edición concurrente: la versión fue modificada por otro usuario (esperado v${expected}, actual v${current}). Recarga la grilla antes de guardar.`
    );
    this.name = "OptimisticLockError";
    this.currentLockNumber = current;
  }
}

export interface ManualChangePayload {
  actionType: ScheduleChangeActionType;
  entryAId: string;
  entryBId?: string;
  targetTimeSlotId?: string;
  targetRoomId?: string;
  isLocked?: boolean;
}

export interface SubstitutionDateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface SubstitutionCandidate {
  teacherId: string;
  teacherName: string;
  score: number;
  reasons: string[];
  hasWindowAdjacent: boolean;
  qualifiedForSubject: boolean;
  qualifiedForLevel: boolean;
}

export interface SubstitutionSlotPlan {
  date: string;
  dayOfWeek: number;
  blockNumber: number;
  startTime: string;
  endTime: string;
  courseName: string;
  subjectName: string;
  roomName: string;
  candidates: SubstitutionCandidate[];
}

interface SnapshotEntry {
  id: string;
  timeSlotId: string;
  roomId: string;
  isLocked: boolean;
}

export const ScheduleOperationsService = {
  /**
   * Aplica cambios manuales validando version_lock_number (Optimistic Locking)
   * y registra previous_state / new_state en schedule_change_logs.
   */
  async applyManualChange(
    versionId: string,
    userId: string,
    expectedLockNumber: number,
    changePayload: ManualChangePayload
  ) {
    const result = await prisma.$transaction(async (tx) => {
      const version = await tx.scheduleVersion.findUnique({
        where: { id: versionId },
      });
      if (!version) throw new Error("Versión de horario no encontrada.");

      if (version.versionLockNumber !== expectedLockNumber) {
        throw new OptimisticLockError(expectedLockNumber, version.versionLockNumber);
      }

      const entryA = await tx.scheduleEntry.findUnique({
        where: { id: changePayload.entryAId },
        include: {
          timeSlot: true,
          courseSubject: { include: { course: true } },
        },
      });
      if (!entryA || entryA.versionId !== versionId) {
        throw new Error("Bloque origen no encontrado en esta versión.");
      }

      const loadGroupEntries = async (anchor: typeof entryA) => {
        if (!anchor.courseSubject.syncGroupCode) return [anchor];
        return tx.scheduleEntry.findMany({
          where: {
            versionId,
            courseSubject: { syncGroupCode: anchor.courseSubject.syncGroupCode },
            timeSlot: {
              dayOfWeek: anchor.timeSlot.dayOfWeek,
              blockNumber: anchor.timeSlot.blockNumber,
            },
          },
          include: {
            timeSlot: true,
            courseSubject: { include: { course: true } },
          },
        });
      };

      const resolveTargetSlotId = async (
        entry: typeof entryA,
        targetDay: number,
        targetBlock: number
      ): Promise<string> => {
        const slot = await tx.timeSlot.findFirst({
          where: {
            bellScheduleId: entry.courseSubject.course.bellScheduleId,
            dayOfWeek: targetDay,
            blockNumber: targetBlock,
            slotType: "CLASS",
          },
        });
        if (!slot) {
          throw new Error(
            `El curso ${entry.courseSubject.course.name}${entry.courseSubject.syncGroupCode ? ` (grupo "${entry.courseSubject.syncGroupCode}")` : ""} no tiene bloque disponible en Día ${targetDay}, Bloque ${targetBlock}.`
          );
        }
        return slot.id;
      };

      const toSnapshot = (e: {
        id: string;
        timeSlotId: string;
        roomId: string;
        isLocked: boolean;
      }): SnapshotEntry => ({
        id: e.id,
        timeSlotId: e.timeSlotId,
        roomId: e.roomId,
        isLocked: e.isLocked,
      });

      const previousEntries: SnapshotEntry[] = [];
      const newEntries: SnapshotEntry[] = [];

      if (changePayload.actionType === "MOVE") {
        if (!changePayload.targetTimeSlotId) {
          throw new Error("targetTimeSlotId es requerido para MOVE.");
        }
        const targetSlot = await tx.timeSlot.findUnique({
          where: { id: changePayload.targetTimeSlotId },
        });
        if (!targetSlot) {
          throw new Error("Bloque horario destino no encontrado.");
        }

        const groupA = await loadGroupEntries(entryA);
        if (groupA.some((e) => e.isLocked)) {
          throw new Error("Uno o más bloques del grupo sincronizado están fijados con candado.");
        }

        const plannedMoves = await Promise.all(
          groupA.map(async (e) => ({
            entry: e,
            destSlotId:
              e.courseSubject.course.bellScheduleId === targetSlot.bellScheduleId
                ? targetSlot.id
                : await resolveTargetSlotId(e, targetSlot.dayOfWeek, targetSlot.blockNumber),
          }))
        );

        for (const { entry, destSlotId } of plannedMoves) {
          previousEntries.push(toSnapshot(entry));
          const updated = await tx.scheduleEntry.update({
            where: { id: entry.id },
            data: {
              timeSlotId: destSlotId,
              roomId:
                groupA.length === 1
                  ? (changePayload.targetRoomId ?? entry.roomId)
                  : entry.roomId,
            },
          });
          newEntries.push(toSnapshot(updated));
        }
      } else if (changePayload.actionType === "SWAP") {
        if (!changePayload.entryBId) {
          throw new Error("entryBId es requerido para SWAP.");
        }
        const entryB = await tx.scheduleEntry.findUnique({
          where: { id: changePayload.entryBId },
          include: {
            timeSlot: true,
            courseSubject: { include: { course: true } },
          },
        });
        if (!entryB || entryB.versionId !== versionId) {
          throw new Error("Bloque destino no encontrado en esta versión.");
        }

        const groupA = await loadGroupEntries(entryA);
        const groupB = await loadGroupEntries(entryB);
        const groupAIds = new Set(groupA.map((e) => e.id));
        const sameGroupSlot = groupB.some((e) => groupAIds.has(e.id));

        if (!sameGroupSlot) {
          if (groupA.some((e) => e.isLocked) || groupB.some((e) => e.isLocked)) {
            throw new Error("Uno o más bloques del grupo sincronizado están fijados con candado.");
          }

          const movesA = await Promise.all(
            groupA.map(async (e) => ({
              entry: e,
              destSlotId:
                e.courseSubject.course.bellScheduleId === entryB.timeSlot.bellScheduleId
                  ? entryB.timeSlotId
                  : await resolveTargetSlotId(
                      e,
                      entryB.timeSlot.dayOfWeek,
                      entryB.timeSlot.blockNumber
                    ),
            }))
          );
          const movesB = await Promise.all(
            groupB.map(async (e) => ({
              entry: e,
              destSlotId:
                e.courseSubject.course.bellScheduleId === entryA.timeSlot.bellScheduleId
                  ? entryA.timeSlotId
                  : await resolveTargetSlotId(
                      e,
                      entryA.timeSlot.dayOfWeek,
                      entryA.timeSlot.blockNumber
                    ),
            }))
          );

          for (const { entry, destSlotId } of [...movesA, ...movesB]) {
            previousEntries.push(toSnapshot(entry));
            const updated = await tx.scheduleEntry.update({
              where: { id: entry.id },
              data: { timeSlotId: destSlotId },
            });
            newEntries.push(toSnapshot(updated));
          }
        }
      } else if (
        changePayload.actionType === "LOCK" ||
        changePayload.actionType === "UNLOCK"
      ) {
        const lockVal = changePayload.actionType === "LOCK";
        const groupA = await loadGroupEntries(entryA);
        for (const entry of groupA) {
          previousEntries.push(toSnapshot(entry));
          const updated = await tx.scheduleEntry.update({
            where: { id: entry.id },
            data: { isLocked: lockVal },
          });
          newEntries.push(toSnapshot(updated));
        }
      } else {
        throw new Error(`Tipo de acción no soportado manualmente: ${changePayload.actionType}`);
      }

      const updatedVersion = await tx.scheduleVersion.update({
        where: { id: versionId },
        data: { versionLockNumber: { increment: 1 } },
      });

      const log = await tx.scheduleChangeLog.create({
        data: {
          versionId,
          userId,
          actionType: changePayload.actionType,
          previousState: { entries: previousEntries } as unknown as Prisma.InputJsonValue,
          newState: { entries: newEntries } as unknown as Prisma.InputJsonValue,
        },
      });

      return { version: updatedVersion, log };
    });

    const audit = await TimetableSolverService.detectConflicts(versionId);
    const syncedVersion = await prisma.scheduleVersion.update({
      where: { id: versionId },
      data: { fitnessScore: audit.fitnessScore },
    });

    return { version: syncedVersion, log: result.log, audit };
  },

  /**
   * Deshace un cambio manual restaurando previous_state registrado en schedule_change_logs.
   */
  async revertChange(versionId: string, logId: string, userId: string) {
    const targetLog = await prisma.scheduleChangeLog.findUnique({
      where: { id: logId },
    });
    if (!targetLog || targetLog.versionId !== versionId) {
      throw new Error("Registro de historial no encontrado.");
    }

    const prev = targetLog.previousState as { entries?: SnapshotEntry[] } | null;
    const prevEntries = prev?.entries ?? [];
    if (prevEntries.length === 0) {
      throw new Error("El registro no contiene un estado previo restaurable.");
    }

    await prisma.$transaction(async (tx) => {
      const currentSnapshot: SnapshotEntry[] = [];

      for (const snap of prevEntries) {
        const curr = await tx.scheduleEntry.findUnique({ where: { id: snap.id } });
        if (!curr) continue;
        currentSnapshot.push({
          id: curr.id,
          timeSlotId: curr.timeSlotId,
          roomId: curr.roomId,
          isLocked: curr.isLocked,
        });
        await tx.scheduleEntry.update({
          where: { id: snap.id },
          data: {
            timeSlotId: snap.timeSlotId,
            roomId: snap.roomId,
            isLocked: snap.isLocked,
          },
        });
      }

      await tx.scheduleVersion.update({
        where: { id: versionId },
        data: { versionLockNumber: { increment: 1 } },
      });

      await tx.scheduleChangeLog.create({
        data: {
          versionId,
          userId,
          actionType: targetLog.actionType,
          previousState: { entries: currentSnapshot, revertedFromLogId: logId } as unknown as Prisma.InputJsonValue,
          newState: { entries: prevEntries } as unknown as Prisma.InputJsonValue,
        },
      });
    });

    const audit = await TimetableSolverService.detectConflicts(versionId);
    const updatedVersion = await prisma.scheduleVersion.update({
      where: { id: versionId },
      data: { fitnessScore: audit.fitnessScore },
    });

    return { version: updatedVersion, audit };
  },

  /**
   * Limpia por completo el horario de una versión (bloques asignados, actividades no lectivas e historial de cambios).
   */
  async clearSchedule(versionId: string, expectedLockNumber?: number) {
    const counts = await prisma.$transaction(async (tx) => {
      const version = await tx.scheduleVersion.findUnique({
        where: { id: versionId },
      });
      if (!version) throw new Error("Versión de horario no encontrada.");

      if (
        expectedLockNumber !== undefined &&
        version.versionLockNumber !== expectedLockNumber
      ) {
        throw new OptimisticLockError(expectedLockNumber, version.versionLockNumber);
      }

      const deletedEntries = await tx.scheduleEntry.deleteMany({
        where: { versionId },
      });
      const deletedActivities = await tx.teacherNonTeachingActivity.deleteMany({
        where: { versionId },
      });
      await tx.scheduleChangeLog.deleteMany({
        where: { versionId },
      });

      await tx.scheduleVersion.update({
        where: { id: versionId },
        data: {
          versionLockNumber: { increment: 1 },
          aiSuggestions: Prisma.DbNull,
        },
      });

      return {
        clearedEntries: deletedEntries.count,
        clearedActivities: deletedActivities.count,
      };
    });

    const audit = await TimetableSolverService.detectConflicts(versionId);
    const updatedVersion = await prisma.scheduleVersion.update({
      where: { id: versionId },
      data: { fitnessScore: audit.fitnessScore },
    });

    return {
      version: updatedVersion,
      audit,
      ...counts,
    };
  },

  /**
   * Ante ausencias o licencias médicas, identifica docentes disponibles en cada bloque afectado
   * y propone un plan de cobertura ordenado por idoneidad y cercanía horaria.
   */
  async generateSubstitutionPlan(
    versionId: string,
    absentTeacherId: string,
    dateRange: SubstitutionDateRange
  ) {
    const version = await prisma.scheduleVersion.findUnique({
      where: { id: versionId },
      include: {
        entries: {
          include: {
            courseSubject: {
              include: {
                course: true,
                subject: true,
                teachers: true,
              },
            },
            timeSlot: true,
            room: true,
            teachers: {
              select: { teacherId: true, roomId: true, room: { select: { name: true } } },
            },
          },
        },
        nonTeachingActivities: {
          include: { timeSlot: true },
        },
      },
    });
    if (!version) throw new Error("Versión de horario no encontrada.");

    const teachers = await prisma.teacher.findMany({
      where: { schoolId: version.schoolId },
      include: {
        qualifiedSubjects: true,
        qualifiedLevels: true,
      },
    });

    const absentTeacher = teachers.find((t) => t.id === absentTeacherId);
    if (!absentTeacher) throw new Error("Docente ausente no encontrado.");

    const rules = await prisma.schedulingRule.findMany({
      where: { schoolId: version.schoolId, ruleType: "TEACHER_UNAVAILABILITY" },
    });

    // Mapa de ocupación por docente y (dayOfWeek:blockNumber)
    const busySet = new Set<string>();
    const teacherDayBlocks = new Map<string, Set<number>>();

    for (const e of version.entries) {
      for (const cst of resolveEntryParticipants(e)) {
        const k = `${cst.teacherId}:${e.timeSlot.dayOfWeek}:${e.timeSlot.blockNumber}`;
        busySet.add(k);
        const tdKey = `${cst.teacherId}:${e.timeSlot.dayOfWeek}`;
        const set = teacherDayBlocks.get(tdKey) ?? new Set<number>();
        set.add(e.timeSlot.blockNumber);
        teacherDayBlocks.set(tdKey, set);
      }
    }

    for (const act of version.nonTeachingActivities) {
      const k = `${act.teacherId}:${act.timeSlot.dayOfWeek}:${act.timeSlot.blockNumber}`;
      busySet.add(k);
    }

    // Construir fechas hábiles (Lunes=1 .. Viernes=5) en el rango
    const start = new Date(`${dateRange.startDate}T12:00:00`);
    const end = new Date(`${dateRange.endDate}T12:00:00`);
    const plan: SubstitutionSlotPlan[] = [];

    const cursor = new Date(start);
    let safetyDays = 0;
    while (cursor <= end && safetyDays < 31) {
      safetyDays++;
      const jsDay = cursor.getDay(); // 0=Dom, 1=Lun..5=Vie
      if (jsDay >= 1 && jsDay <= 5) {
        const dateStr = cursor.toISOString().slice(0, 10);
        const affectedEntries = version.entries
          .filter(
            (e) =>
              e.timeSlot.dayOfWeek === jsDay &&
              resolveEntryParticipants(e).some((t) => t.teacherId === absentTeacherId)
          )
          .sort((a, b) => a.timeSlot.blockNumber - b.timeSlot.blockNumber);

        for (const entry of affectedEntries) {
          const candidates: SubstitutionCandidate[] = [];

          for (const candidate of teachers) {
            if (candidate.id === absentTeacherId) continue;

            const slotKey = `${candidate.id}:${jsDay}:${entry.timeSlot.blockNumber}`;
            if (busySet.has(slotKey)) continue;

            // Verificar regla de indisponibilidad
            const unavailable = rules.some((r) => {
              if (r.targetEntityId !== candidate.id) return false;
              const p = (r.parameters ?? {}) as {
                unavailableDays?: number[];
                unavailableBlocks?: Array<{ day: number; block: number }>;
              };
              if (p.unavailableDays?.includes(jsDay)) return true;
              if (
                p.unavailableBlocks?.some(
                  (b) => b.day === jsDay && b.block === entry.timeSlot.blockNumber
                )
              ) {
                return true;
              }
              return false;
            });
            if (unavailable) continue;

            const dayBlocks = teacherDayBlocks.get(`${candidate.id}:${jsDay}`) ?? new Set<number>();
            const hasWindowAdjacent =
              dayBlocks.has(entry.timeSlot.blockNumber - 1) ||
              dayBlocks.has(entry.timeSlot.blockNumber + 1);
            const isInSchoolThatDay = dayBlocks.size > 0;
            const qualifiedForSubject = candidate.qualifiedSubjects.some(
              (qs) => qs.subjectId === entry.courseSubject.subjectId
            );
            const qualifiedForLevel = candidate.qualifiedLevels.some(
              (ql) => ql.levelCode === entry.courseSubject.course.levelCode
            );

            let score = 40;
            const reasons: string[] = [];

            if (qualifiedForSubject) {
              score += 35;
              reasons.push("Habilitado en la asignatura");
            }
            if (qualifiedForLevel) {
              score += 15;
              reasons.push("Experiencia en el nivel");
            }
            if (hasWindowAdjacent) {
              score += 10;
              reasons.push("Ventana contigua en el establecimiento");
            } else if (isInSchoolThatDay) {
              score += 5;
              reasons.push("Presente en el colegio ese día");
            } else {
              reasons.push("Disponible (sin clases ese día)");
            }

            candidates.push({
              teacherId: candidate.id,
              teacherName: `${candidate.firstName} ${candidate.lastName}`,
              score,
              reasons,
              hasWindowAdjacent,
              qualifiedForSubject,
              qualifiedForLevel,
            });
          }

          candidates.sort((a, b) => b.score - a.score);

          plan.push({
            date: dateStr,
            dayOfWeek: jsDay,
            blockNumber: entry.timeSlot.blockNumber,
            startTime: entry.timeSlot.startTime,
            endTime: entry.timeSlot.endTime,
            courseName: entry.courseSubject.course.name,
            subjectName: entry.courseSubject.subject.name,
            // Sala donde estaba el docente ausente (ej. Aula de Recursos si es apoyo PIE)
            roomName:
              entry.teachers.find((t) => t.teacherId === absentTeacherId)?.room?.name ??
              entry.room.name,
            candidates: candidates.slice(0, 5),
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      absentTeacher: {
        id: absentTeacher.id,
        name: `${absentTeacher.firstName} ${absentTeacher.lastName}`,
      },
      dateRange,
      totalAffectedBlocks: plan.length,
      plan,
    };
  },
};
