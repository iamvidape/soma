"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";

function navClass(pathname: string, href: string): string {
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return `bottom-nav-item${isActive ? " active" : ""}`;
}

// The study route requires a ?decks= param (StudyPage redirects to "/"
// without one) — read the deck selection persisted on the dashboard
// (SOM-7) so tapping Study can jump straight into a session, falling back
// to the dashboard (where decks can be picked) if nothing's selected.
function goToStudy(router: ReturnType<typeof useRouter>) {
  try {
    const saved = localStorage.getItem("soma-selected-decks");
    const ids: string[] = saved ? JSON.parse(saved) : [];
    if (Array.isArray(ids) && ids.length > 0) {
      router.push(`/study?decks=${ids.join(",")}`);
      return;
    }
  } catch {}
  router.push("/");
}

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        <Link href="/" className={navClass(pathname, "/")}>
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          <span>Home</span>
        </Link>
        <button className={navClass(pathname, "/study")} onClick={() => goToStudy(router)}>
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <rect x="2" y="3" width="20" height="14" rx="1" /><path d="M8 21h8M12 17v4" />
          </svg>
          <span>Study</span>
        </button>
        <Link href="/stats" className={navClass(pathname, "/stats")}>
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path d="M3 3h18v18H3zM9 9h6M9 13h6" />
          </svg>
          <span>Stats</span>
        </Link>
        <SignOutButton />
      </div>
    </nav>
  );
}
