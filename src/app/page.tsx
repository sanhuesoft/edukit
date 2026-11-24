import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { HorariosLanding } from "@/components/landing/HorariosLanding";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/horarios");
  }

  return <HorariosLanding />;
}
