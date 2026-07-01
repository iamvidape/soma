import Link from "next/link";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { SyncProvider } from "@/components/SyncProvider";
import { OnlineBadge } from "@/components/OnlineBadge";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = session!.user.id;
  const initial = session?.user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <SyncProvider userId={userId}>
      <div className="app-shell">
        {/* Top nav */}
        <nav className="top-nav">
          <div className="nav-inner">
            <Link href="/" className="nav-logo">SOMA</Link>
            <div className="nav-right">
              <OnlineBadge />
              <div className="nav-avatar">{initial}</div>
            </div>
          </div>
        </nav>

        {/* Page content */}
        <main className="app-content">{children}</main>

        {/* Bottom nav */}
        <nav className="bottom-nav">
          <Link href="/" className="bottom-nav-item active">
            <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            <span>Home</span>
          </Link>
          <Link href="/study" className="bottom-nav-item">
            <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <rect x="2" y="3" width="20" height="14" rx="1" /><path d="M8 21h8M12 17v4" />
            </svg>
            <span>Study</span>
          </Link>
          <button className="bottom-nav-item">
            <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M3 3h18v18H3zM9 9h6M9 13h6" />
            </svg>
            <span>Stats</span>
          </button>
          <SignOutButton />
        </nav>
      </div>
    </SyncProvider>
  );
}
