import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, LogOut, Package, Save, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { updateProfile } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/compte")({
  head: () => ({
    meta: [
      { title: "Mon compte — OpenSlot" },
      { name: "description", content: "Gère ton profil et ton historique OpenSlot." },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { user } = Route.useRouteContext();
  const updateProfileFn = useServerFn(updateProfile);

  const metadata = user.user_metadata || {};
  const [fullName, setFullName] = useState<string>(metadata.full_name || "");
  const [phone, setPhone] = useState<string>(metadata.phone || "+237");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const updates: { full_name?: string; phone?: string } = {};
      if (fullName.trim().length >= 2) updates.full_name = fullName.trim();
      if (phone.replace(/\s/g, "").length >= 8) updates.phone = phone.replace(/\s/g, "");

      await updateProfileFn({ data: updates });
      await supabase.auth.updateUser({
        data: { full_name: fullName.trim(), phone: phone.replace(/\s/g, "") },
      });
      setMessage("Profil mis à jour.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>

        <div className="mt-6 rounded-2xl border border-border bg-gradient-card p-6 shadow-card sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold">Mon compte</h1>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="mt-8 space-y-4">
            <div>
              <label className="block text-sm font-medium">Nom complet</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex: Aïcha N."
                className="input-account"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Téléphone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+237 6xx xxx xxx"
                className="input-account"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary-foreground">
                {message}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-90 disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Enregistrer
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent"
              >
                <LogOut className="h-4 w-4" /> Se déconnecter
              </button>
            </div>
          </form>

          <div className="mt-8 border-t border-border pt-6">
            <Link
              to="/compte/commandes"
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 transition hover:border-primary/40"
            >
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-primary" />
                <span className="font-medium">Mes commandes</span>
              </div>
              <span className="text-sm text-muted-foreground">Voir l'historique →</span>
            </Link>
          </div>
        </div>
      </div>
      <style>{`
        .input-account {
          width: 100%;
          margin-top: 0.375rem;
          background: var(--input);
          border: 1px solid var(--border);
          color: var(--foreground);
          border-radius: 0.625rem;
          padding: 0.65rem 0.85rem;
          font-size: 0.9rem;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .input-account:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 25%, transparent);
        }
      `}</style>
      <SiteFooter />
    </div>
  );
}
