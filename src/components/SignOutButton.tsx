"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button className="bottom-nav-item" onClick={() => signOut({ callbackUrl: "/login" })}>
      <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
      <span>Sign out</span>
    </button>
  );
}
