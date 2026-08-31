"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { clearAdminToken, getAdminToken } from "../../lib/admin-api";

const NAV = [
  { href: "/admin", label: "Ingest" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/demotions", label: "Demotions" },
  { href: "/admin/sponsors", label: "Sponsors" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/dev", label: "Dev" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const isLogin = pathname === "/admin/login";

  useEffect(() => {
    if (isLogin) {
      setReady(true);
      return;
    }
    if (!getAdminToken()) {
      router.replace("/admin/login");
      return;
    }
    setReady(true);
  }, [isLogin, pathname, router]);

  if (!ready && !isLogin) {
    return (
      <div className="admin-app">
        <p className="admin-muted">Checking auth…</p>
      </div>
    );
  }

  if (isLogin) {
    return <div className="admin-app">{children}</div>;
  }

  return (
    <div className="admin-app">
      <header className="admin-header">
        <div className="admin-brand">
          <span className="admin-brand-mark">Bored</span>
          <span className="admin-brand-sub">Admin</span>
        </div>
        <nav className="admin-nav">
          {NAV.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "admin-nav-link active" : "admin-nav-link"}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          className="admin-btn ghost"
          onClick={() => {
            clearAdminToken();
            router.push("/admin/login");
          }}
        >
          Log out
        </button>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}
