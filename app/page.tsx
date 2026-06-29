import { redirect } from "next/navigation";

/** The root goes straight into the product. `RequireAuth` sends to `/login` if there's no session. */
export default function Home() {
  redirect("/dashboard");
}
