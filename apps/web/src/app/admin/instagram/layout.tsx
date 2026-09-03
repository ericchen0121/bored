"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const TABS = [
  { href: "/admin/instagram", label: "Creators", exact: true },
  { href: "/admin/instagram/token", label: "Token", exact: false },
];

export default function InstagramAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="admin-stack">
      <div className="admin-page-head">
        <h1>Instagram</h1>
      </div>
      <nav className="admin-subnav" aria-label="Instagram admin">
        {TABS.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={active ? "admin-subnav-link active" : "admin-subnav-link"}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
