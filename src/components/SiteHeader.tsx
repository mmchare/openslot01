import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";

export function SiteHeader() {
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
        <a
          href="https://wa.me/237"
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-foreground/90 hover:border-primary/40 hover:text-foreground transition"
        >
          Support WhatsApp
        </a>
      </div>
    </header>
  );
}
