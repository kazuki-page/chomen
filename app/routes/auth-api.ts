import { getAuth } from "~/lib/auth.server";
import type { Route } from "./+types/auth-api";

/** Better Auth のエンドポイント（/api/auth/*） */
export async function loader({ request }: Route.LoaderArgs) {
  return getAuth(request).handler(request);
}

export async function action({ request }: Route.ActionArgs) {
  return getAuth(request).handler(request);
}
