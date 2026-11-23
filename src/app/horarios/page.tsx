import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { AppNavbar } from "@/components/AppNavbar";
import { AppFooter } from "@/components/AppFooter";
import { HorariosWorkspace } from "@/components/horarios/HorariosWorkspace";

export const dynamic = "force-dynamic";

export default async function HorariosPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="page-wrapper relative">
      <div className="bg-mesh" aria-hidden="true" />
      <AppNavbar
        currentSection="Generador de Horarios"
        sectionIcon={<CalendarDays className="h-4 w-4" />}
        fullWidth
        user={user}
      />

      <main className="relative z-10 flex-1 py-6">
        <div className="w-full px-4 sm:px-6 xl:px-10">
          <HorariosWorkspace user={user} />
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
