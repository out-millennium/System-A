import { redirect } from "next/navigation";

/* Legacy placeholder route. Admin sign-in was never a separate flow: admins use
   the normal /login, and users request admin rights via the working application
   form at /become-admin. This route used to show a dead "coming soon" stub, so
   we permanently redirect it to the real application page. */
export default function AdminLoginPage() {
  redirect("/become-admin");
}
