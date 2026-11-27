/**
 * Participación de docentes por bloque.
 *
 * Un bloque (ScheduleEntry) puede tener filas ScheduleEntryTeacher que dicen qué docentes
 * participan en ese bloque concreto y en qué sala está cada uno. Esto permite, por ejemplo,
 * que la educadora diferencial (PIE) acompañe solo algunos bloques de Matemática y que en
 * algunos de ellos trabaje en el Aula de Recursos mientras el titular sigue en la sala del curso.
 *
 * Versiones generadas antes de este cambio no tienen filas: en ese caso participan todos
 * los docentes asignados a la asignatura, en la sala del bloque.
 */

export interface EntryTeacherRow {
  teacherId: string;
  roomId: string | null;
}

export interface ResolvedEntryParticipant {
  teacherId: string;
  /** Sala donde está este docente en el bloque. */
  roomId: string;
  /** true si el docente está en una sala distinta a la del bloque (ej. Aula de Recursos). */
  inOtherRoom: boolean;
}

export function resolveEntryParticipants(entry: {
  roomId: string;
  teachers?: EntryTeacherRow[] | null;
  courseSubject: { teachers: Array<{ teacherId: string }> };
}): ResolvedEntryParticipant[] {
  const rows = entry.teachers ?? [];
  if (rows.length > 0) {
    return rows.map((r) => ({
      teacherId: r.teacherId,
      roomId: r.roomId ?? entry.roomId,
      inOtherRoom: Boolean(r.roomId && r.roomId !== entry.roomId),
    }));
  }
  return entry.courseSubject.teachers.map((t) => ({
    teacherId: t.teacherId,
    roomId: entry.roomId,
    inOtherRoom: false,
  }));
}

/**
 * Un docente de apoyo (codocente o PIE) que no acompaña todos los bloques de la asignatura.
 * El generador elige en cuáles de los bloques participa.
 */
export function isPartialSupportAssignment(
  assignment: { role: string; assignedBlocks: number | null },
  weeklyBlocks: number
): boolean {
  return (
    assignment.role !== "LEAD" &&
    assignment.assignedBlocks !== null &&
    assignment.assignedBlocks < weeklyBlocks
  );
}

/** Bloques semanales en que participa el docente en la asignatura. */
export function effectiveAssignedBlocks(
  assignment: { assignedBlocks: number | null },
  weeklyBlocks: number
): number {
  return Math.min(weeklyBlocks, assignment.assignedBlocks ?? weeklyBlocks);
}
