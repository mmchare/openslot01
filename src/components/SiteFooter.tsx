export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border/60 py-10 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 sm:flex-row sm:items-center sm:px-6">
        <div>
          <span className="font-display text-foreground">OpenSlot</span> —
          Accès premium livrés en moins de 60 secondes.
        </div>
        <div className="flex gap-6">
          <a href="#" className="hover:text-foreground transition">CGU</a>
          <a href="#" className="hover:text-foreground transition">Confidentialité</a>
          <a href="#" className="hover:text-foreground transition">Contact</a>
        </div>
      </div>
      <p className="mx-auto mt-4 max-w-6xl px-4 text-xs sm:px-6">
        © {new Date().getFullYear()} OpenSlot. Paiements sécurisés via Notch Pay (MTN MoMo & Orange Money).
      </p>
    </footer>
  );
}
