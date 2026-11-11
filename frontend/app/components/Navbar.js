"use client";

import Link from "next/link";
import { useContext, useState } from "react";
import { usePathname } from "next/navigation";
import { authContext } from "../auth-context";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sessions",  label: "My Sessions" },
];

export default function Navbar() {
  const { user, logout, isLoggingOut } = useContext(authContext);
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const initials = user
    ? (user.username || user.email || "U").charAt(0).toUpperCase()
    : "?";

  async function handleLogout() {
    setMenuOpen(false);
    try {
      await logout();
    } catch {
      /* error is surfaced via auth context */
    }
  }

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      {/* Brand */}
      <Link href="/dashboard" className="navbar-brand">
        <span className="navbar-brand-mark" aria-hidden="true">P</span>
        PrepWise
      </Link>

      {/* Primary nav links */}
      <div className="navbar-nav" role="menubar">
        {NAV_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            role="menuitem"
            className={`nav-link${pathname?.startsWith(href) ? " active" : ""}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Right side */}
      <div className="navbar-right">
        {user ? (
          <div style={{ position: "relative" }}>
            <button
              className="avatar-btn"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              aria-label="User menu"
              type="button"
            >
              <span className="avatar-circle" aria-hidden="true">
                {initials}
              </span>
              <span className="avatar-name">{user.username || user.email}</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 20 20"
                fill="currentColor"
                style={{ color: "var(--fg-muted)" }}
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {menuOpen && (
              <>
                {/* Backdrop to close on outside click */}
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 40,
                  }}
                  onClick={() => setMenuOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  aria-label="User options"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 8px)",
                    zIndex: 50,
                    minWidth: 200,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                    boxShadow: "var(--shadow-lg)",
                    padding: "6px",
                    overflow: "hidden",
                  }}
                >
                  {/* User info header */}
                  <div
                    style={{
                      padding: "10px 12px 10px",
                      borderBottom: "1px solid var(--border)",
                      marginBottom: "4px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--fg)",
                      }}
                    >
                      {user.username}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--fg-muted)",
                        marginTop: 2,
                      }}
                    >
                      {user.email}
                    </div>
                  </div>

                  <button
                    role="menuitem"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    type="button"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "8px 12px",
                      border: "none",
                      borderRadius: "var(--radius)",
                      background: "none",
                      cursor: "pointer",
                      fontSize: 13,
                      color: "var(--danger)",
                      fontWeight: 500,
                      transition: "background 140ms",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#fef2f2")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "none")
                    }
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    {isLoggingOut ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <Link href="/login" className="btn btn-primary btn-sm">
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
