import { NextResponse } from "next/server";
import { getCurrentUser, resolveActiveSchoolId } from "@/lib/auth";
import { TimetableSolverService } from "@/services/TimetableSolverService";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const schoolId = await resolveActiveSchoolId(user);
  if (!schoolId) {
    return NextResponse.json({ error: "No hay establecimiento activo." }, { status: 404 });
  }

  const result = await TimetableSolverService.validatePreconditions(schoolId);
  return NextResponse.json(result);
}
