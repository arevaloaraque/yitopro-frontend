import { redirect } from "next/navigation";

/** La raíz entra directo al producto. `RequireAuth` manda a `/login` si no hay sesión. */
export default function Home() {
  redirect("/dashboard");
}
