"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

export default function AppHeader({ user }) {
  const pathname = usePathname() || "/";
  const isActive = (href) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand">
          classical chill
        </Link>

        <nav className="main-nav" aria-label="main">
          <Link href="/" aria-current={isActive("/") ? "page" : undefined} className={isActive("/") ? "nav-link active" : "nav-link"}>
            home
          </Link>
          <Link
            href="/recently-played"
            aria-current={isActive("/recently-played") ? "page" : undefined}
            className={isActive("/recently-played") ? "nav-link active" : "nav-link"}
          >
            recent
          </Link>
          <Link
            href="/favorites"
            aria-current={isActive("/favorites") ? "page" : undefined}
            className={isActive("/favorites") ? "nav-link active" : "nav-link"}
          >
            favorites
          </Link>
          <Link
            href="/profile"
            aria-current={isActive("/profile") ? "page" : undefined}
            className={isActive("/profile") ? "nav-link active" : "nav-link"}
          >
            profile
          </Link>
        </nav>

        <div className="auth-zone">
          {user ? (
            <>
              <span className="hello">hi, {user.name || user.email}</span>
              <button type="button" className="ghost-btn" onClick={() => signOut({ callbackUrl: "/" })}>
                sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/signin" className="ghost-btn">
                sign in
              </Link>
              <Link href="/register" className="solid-btn">
                register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
