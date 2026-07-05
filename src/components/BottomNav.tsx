"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";

function navClass(pathname: string, href: string): string {
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return `bottom-nav-item${isActive ? " active" : ""}`;
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav">
      <Link href="/" className={navClass(pathname, "/")}>
        <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
        <span>Home</span>
      </Link>
      <Link href="/study" className={navClass(pathname, "/study")}>
        <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <rect x="2" y="3" width="20" height="14" rx="1" /><path d="M8 21h8M12 17v4" />
        </svg>
        <span>Study</span>
      </Link>
      <Link href="/stats" className={navClass(pathname, "/stats")}>
        <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path d="M3 3h18v18H3zM9 9h6M9 13h6" />
        </svg>
        <span>Stats</span>
      </Link>
      <SignOutButton />
    </nav>
  );
}
