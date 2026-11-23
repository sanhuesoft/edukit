import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ScheduleExportService } from "@/services/ScheduleExportService";

export async function GET(
  request: Request,
  context: { params: Promise<{ versionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const { versionId } = await context.params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "master";
    const entityId = searchParams.get("entityId") || "";

    if (type === "bundle") {
      const zipBytes = await ScheduleExportService.exportMasterScheduleBundle(versionId);
      return new NextResponse(Buffer.from(zipBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="horarios_edukit_${versionId.slice(0, 8)}.zip"`,
        },
      });
    }

    let pdfBytes: Uint8Array;
    let filename = `horario_${type}.pdf`;

    if (type === "course") {
      if (!entityId) return NextResponse.json({ error: "entityId requerido" }, { status: 400 });
      pdfBytes = await ScheduleExportService.renderCourseTimetablePDF(versionId, entityId);
      filename = `horario_curso_${entityId.slice(0, 8)}.pdf`;
    } else if (type === "teacher") {
      if (!entityId) return NextResponse.json({ error: "entityId requerido" }, { status: 400 });
      pdfBytes = await ScheduleExportService.renderTeacherTimetablePDF(versionId, entityId);
      filename = `horario_docente_${entityId.slice(0, 8)}.pdf`;
    } else if (type === "room") {
      if (!entityId) return NextResponse.json({ error: "entityId requerido" }, { status: 400 });
      pdfBytes = await ScheduleExportService.renderRoomOccupancyPDF(versionId, entityId);
      filename = `ocupacion_sala_${entityId.slice(0, 8)}.pdf`;
    } else {
      pdfBytes = await ScheduleExportService.renderMasterWallChartPDF(versionId);
      filename = `sabana_maestra_carta_${versionId.slice(0, 8)}.pdf`;
    }

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al exportar documento." },
      { status: 400 }
    );
  }
}
