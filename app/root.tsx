import {
  isRouteErrorResponse,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { getAppSession } from "~/lib/auth.server";
import type { Route } from "./+types/root";
import "./app.css";

/**
 * Web フォントは読み込まない。
 * 主な利用環境が Android であり、日本語は OS 標準フォントのほうが読みやすく速い。
 */
export const links: Route.LinksFunction = () => [];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-slate-50 text-slate-900">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export async function loader({ request }: Route.LoaderArgs) {
  // 認証を要求しない。ログイン画面でもこの loader は走る
  return { session: await getAppSession(request) };
}

export default function App({ loaderData }: Route.ComponentProps) {
  if (!loaderData.session) return <Outlet />;

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-4xl gap-2 px-4 py-2">
          <NavItem to="/">ホーム</NavItem>
          <NavItem to="/units">部屋</NavItem>
          <NavItem to="/work-orders">修繕</NavItem>
          <NavItem to="/settings">設定</NavItem>
        </nav>
      </header>
      <Outlet />
    </>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      // 詳細ページ（/units/:id など）でも親のタブを選択状態にする
      end={to === "/"}
      className={({ isActive }) =>
        `rounded-lg px-4 py-2 text-base font-medium ${
          isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
