import { Link } from "@tanstack/react-router";
import { Loader2, User, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function SiteHeader() {
  const { user, loading } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">
            OpenSlot
          </span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
          <Link to="/" activeProps={{ className: "text-foreground" }}>
            Catalogue
          </Link>
          <a href="#how" className="hover:text-foreground transition">
            Comment ça marche
          </a>
          <a href="#faq" className="hover:text-foreground transition">
            FAQ
          </a>
        </nav>
        <div className="flex items-center gap-3">
          {loading ? (
            <span className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-foreground/90">
              <Loader2 className="h-4 w-4 animate-spin" />
            </span>
          ) : user ? (
            <Link
              to="/compte"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-foreground/90 hover:border-primary/40 hover:text-foreground transition"
            >
              <User className="h-4 w-4" /> Mon compte
            </Link>
          ) : (
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-foreground/90 hover:border-primary/40 hover:text-foreground transition"
            >
              <User className="h-4 w-4" /> Connexion
            </Link>
          )}
          <a
            href="https://wa.me/237683179424"
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-foreground/90 hover:border-primary/40 hover:text-foreground transition sm:inline-block"
          >
            Support WhatsApp
          </a>
        </div>
      </div>
    </header>
  );
}
