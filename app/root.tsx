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
        {/*
          左右の余白を詰めて、狭い画面でも6つが1行に収まるようにしている。
          必要な幅は 332px なので、いまどきの Android（360px 以上）なら折り返さない。
        */}
        <nav className="mx-auto flex max-w-4xl gap-1 px-4 py-2 sm:gap-2">
          {/*
            ホームだけアイコン。狭い画面では文字が縦に折り返されるため、
            3文字の「ホーム」がヘッダーの高さを決めてしまっていた。
            家＝最初の画面はアイコン単体でも通じる数少ない例。
          */}
          <NavItem to="/" label="ホーム">
            <HomeIcon />
          </NavItem>
          <NavItem to="/units">部屋</NavItem>
          <NavItem to="/equipment">設備</NavItem>
          <NavItem to="/work-orders">修繕</NavItem>
          {/* 他のタブが2文字なので幅を揃える。ページ側の見出しは「書き出し」のまま */}
          <NavItem to="/export">書出</NavItem>
          <NavItem to="/settings">設定</NavItem>
        </nav>
      </header>
      <Outlet />
    </>
  );
}

/**
 * @param label 中身がアイコンのときの読み上げ用の名前。文字タブでは不要
 */
function NavItem({
  to,
  label,
  children,
}: {
  to: string;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      aria-label={label}
      // 詳細ページ（/units/:id など）でも親のタブを選択状態にする
      end={to === "/"}
      className={({ isActive }) =>
        // アイコンでも文字タブと同じ大きさで押せるように、高さを揃えて中央に置く。
        // leading-tight は、幅の足りない端末で折り返したときに2文字の隙間を詰めるため
        `flex min-h-12 items-center justify-center rounded-lg px-2 py-2 text-base font-medium leading-tight sm:px-4 ${
          isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

/**
 * ホームタブのアイコン。色は文字タブと揃うよう currentColor を使う。
 * 幅を2文字ぶん取って、隣の文字タブと同じ大きさで押せるようにしている。
 */
function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-8"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
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
