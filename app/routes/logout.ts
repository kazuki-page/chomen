import { redirect } from "react-router";

import { cookieHeaders, getAuth } from "~/lib/auth.server";
import type { Route } from "./+types/logout";

export async function action({ request }: Route.ActionArgs) {
  const response = await getAuth(request).api.signOut({
    headers: request.headers,
    asResponse: true,
  });
  return redirect("/login", { headers: cookieHeaders(response) });
}

export async function loader() {
  return redirect("/");
}
