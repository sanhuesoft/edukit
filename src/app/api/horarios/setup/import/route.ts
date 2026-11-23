import { NextResponse } from "next/server";
import { getCurrentUser, resolveActiveSchoolId } from "@/lib/auth";
import { SchoolSetupService } from "@/services/SchoolSetupService";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const schoolId = await resolveActiveSchoolId(user);
  if (!schoolId) {
    return NextResponse.json({ error: "No hay establecimiento activo." }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const mode = String(formData.get("mode") || "dryRun");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Archivo Excel o CSV requerido." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (mode === "commit") {
      const result = await SchoolSetupService.importAcademicData(schoolId, buffer, file.name);
      return NextResponse.json(result);
    }

    const dryRun = await SchoolSetupService.dryRunImport(schoolId, buffer, file.name);
    return NextResponse.json({ dryRun });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al procesar el archivo." },
      { status: 400 }
    );
  }
}
