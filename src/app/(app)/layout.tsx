import Link from "next/link";
import { auth } from "@/auth";
import { SyncProvider } from "@/components/SyncProvider";
import { OnlineBadge } from "@/components/OnlineBadge";
import { BottomNav } from "@/components/BottomNav";

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
        <BottomNav />
      </div>
    </SyncProvider>
  );
}
