import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { HorariosWorkspace } from "@/components/horarios/HorariosWorkspace";

export const dynamic = "force-dynamic";

export default async function HorariosPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      <HorariosWorkspace user={user} />
    </div>
  );
}
