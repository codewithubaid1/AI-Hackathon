"use client";

import { useRouter } from "next/navigation";
import { useContext, useEffect } from "react";
import { authContext } from "./auth-context";

/**
 * Root route ("/") — smart redirect:
 *   - authenticated   → /dashboard
 *   - unauthenticated → /login
 *   - error           → /login  (backend down — login page shows the error)
 *   - loading         → spinner while we find out
 *
 * The backend OAuth callback lands here with ?oauth=success. The
 * AuthProvider picks up the new cookies on mount, sets status to
 * "authenticated", and this effect fires the dashboard redirect.
 */
export default function RootPage() {
  const { status, isAuthenticated } = useContext(authContext);
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && isAuthenticated) {
      router.replace("/dashboard");
    } else if (status === "unauthenticated" || status === "error") {
      router.replace("/login");
    }
    // "loading" — wait for AuthProvider to resolve
  }, [status, isAuthenticated, router]);

  return (
    <div className="page-loading" role="status">
      <span className="spinner" />
      <span>Loading PrepWise…</span>
    </div>
  );
}
