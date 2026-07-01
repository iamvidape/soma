import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  providers: [],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
};
