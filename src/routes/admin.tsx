import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock, Plus, Power, Trash2, X } from "lucide-react";
import {
  adminAddSlot,
  adminDeleteSlot,
  adminListApps,
  adminListSlots,
  adminToggleApp,
  verifyAdminPassword,
} from "@/lib/admin.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

const PWD_KEY = "openslot_admin_pwd";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — OpenSlot" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [password, setPassword] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(PWD_KEY);
    if (stored) setPassword(stored);
  }, []);

  if (!password) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <LoginGate
          onSuccess={(pwd) => {
            sessionStorage.setItem(PWD_KEY, pwd);
            setPassword(pwd);
          }}
        />
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <AdminDashboard
        password={password}
        onLogout={() => {
          sessionStorage.removeItem(PWD_KEY);
          setPassword(null);
        }}
      />
      <SiteFooter />
    </div>
  );
}

function LoginGate({ onSuccess }: { onSuccess: (pwd: string) => void }) {
  const verify = useServerFn(verifyAdminPassword);
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: (p: string) => verify({ data: { password: p } }),
    onSuccess: () => onSuccess(pwd),
    onError: (e: Error) => setErr(e.message || "Mot de passe invalide."),
  });

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-border bg-gradient-card p-6 shadow-card">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-primary" />
          <h1 className="font-display text-xl">Accès admin</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Entre le mot de passe administrateur pour gérer le catalogue et le
          stock.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            mut.mutate(pwd);
          }}
          className="mt-5 space-y-3"
        >
          <input
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="Mot de passe"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
            autoFocus
          />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <button
            type="submit"
            disabled={mut.isPending || !pwd}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
          >
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}

function AdminDashboard({
  password,
  onLogout,
}: {
  password: string;
  onLogout: () => void;
}) {
  const qc = useQueryClient();
  const listApps = useServerFn(adminListApps);
  const toggleApp = useServerFn(adminToggleApp);

  const { data: apps, isLoading, error } = useQuery({
    queryKey: ["admin-apps"],
    queryFn: () => listApps({ data: { password } }),
    retry: false,
  });

  // Si erreur d'auth → déconnexion auto
  useEffect(() => {
    if (error) onLogout();
  }, [error, onLogout]);

  const toggleMut = useMutation({
    mutationFn: (v: { application_id: string; is_active: boolean }) =>
      toggleApp({ data: { password, ...v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-apps"] }),
  });

  const [openAppId, setOpenAppId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">Panneau admin</h1>
          <p className="text-sm text-muted-foreground">
            Active/désactive les produits, ajoute ou retire des slots de stock.
          </p>
        </div>
        <button
          onClick={onLogout}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40"
        >
          Déconnexion
        </button>
      </div>

      {isLoading && (
        <div className="mt-10 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      )}

      <div className="mt-6 space-y-3">
        {(apps ?? []).map((a) => (
          <div
            key={a.id}
            className="rounded-xl border border-border bg-surface p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{a.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {a.category}
                  </span>
                  {!a.is_active && (
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-destructive">
                      Inactif
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {a.price_fcfa.toLocaleString("fr-FR")} FCFA ·{" "}
                  <span className="text-primary">
                    {a.stock_disponible} dispo
                  </span>{" "}
                  · {a.stock_vendu} vendus
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    toggleMut.mutate({
                      application_id: a.id,
                      is_active: !a.is_active,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs hover:border-primary/40"
                >
                  <Power className="h-3 w-3" />
                  {a.is_active ? "Désactiver" : "Activer"}
                </button>
                <button
                  onClick={() =>
                    setOpenAppId(openAppId === a.id ? null : a.id)
                  }
                  className="rounded-lg bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-glow"
                >
                  {openAppId === a.id ? "Fermer" : "Gérer le stock"}
                </button>
              </div>
            </div>

            {openAppId === a.id && (
              <StockManager appId={a.id} password={password} />
            )}
          </div>
        ))}
      </div>

      <div className="mt-10 text-center text-sm">
        <Link to="/" className="text-primary underline">
          ← Retour au catalogue
        </Link>
      </div>
    </div>
  );
}

function StockManager({ appId, password }: { appId: string; password: string }) {
  const qc = useQueryClient();
  const listSlots = useServerFn(adminListSlots);
  const addSlot = useServerFn(adminAddSlot);
  const delSlot = useServerFn(adminDeleteSlot);

  const { data: slots, isLoading } = useQuery({
    queryKey: ["admin-slots", appId],
    queryFn: () => listSlots({ data: { password, application_id: appId } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-slots", appId] });
    qc.invalidateQueries({ queryKey: ["admin-apps"] });
  };

  const addMut = useMutation({
    mutationFn: (v: {
      account_email: string;
      account_password: string;
      slot_number: number;
      profile_name: string | null;
    }) => addSlot({ data: { password, application_id: appId, ...v } }),
    onSuccess: () => {
      refresh();
      setForm({ account_email: "", account_password: "", slot_number: 1, profile_name: "" });
    },
  });

  const delMut = useMutation({
    mutationFn: (slot_id: string) => delSlot({ data: { password, slot_id } }),
    onSuccess: refresh,
  });

  const [form, setForm] = useState({
    account_email: "",
    account_password: "",
    slot_number: 1,
    profile_name: "",
  });

  return (
    <div className="mt-4 border-t border-border pt-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addMut.mutate({
            account_email: form.account_email.trim(),
            account_password: form.account_password,
            slot_number: Number(form.slot_number),
            profile_name: form.profile_name.trim() || null,
          });
        }}
        className="grid grid-cols-1 gap-2 sm:grid-cols-5"
      >
        <input
          required
          placeholder="Email du compte"
          value={form.account_email}
          onChange={(e) => setForm({ ...form, account_email: e.target.value })}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
        />
        <input
          required
          placeholder="Mot de passe"
          value={form.account_password}
          onChange={(e) =>
            setForm({ ...form, account_password: e.target.value })
          }
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <input
          required
          type="number"
          min={1}
          max={20}
          placeholder="N° écran"
          value={form.slot_number}
          onChange={(e) =>
            setForm({ ...form, slot_number: Number(e.target.value) })
          }
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <input
          placeholder="Profil (optionnel)"
          value={form.profile_name}
          onChange={(e) => setForm({ ...form, profile_name: e.target.value })}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={addMut.isPending}
          className="sm:col-span-5 inline-flex items-center justify-center gap-1 rounded-lg bg-primary/15 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/25 disabled:opacity-50"
        >
          {addMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Ajouter ce slot
        </button>
        {addMut.error && (
          <p className="text-xs text-destructive sm:col-span-5">
            {(addMut.error as Error).message}
          </p>
        )}
      </form>

      <div className="mt-5">
        {isLoading && (
          <div className="text-sm text-muted-foreground">Chargement…</div>
        )}
        {!isLoading && (slots ?? []).length === 0 && (
          <div className="text-sm text-muted-foreground">
            Aucun slot pour ce produit.
          </div>
        )}
        <div className="space-y-2">
          {(slots ?? []).map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-mono text-xs">
                  {s.account_email}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Écran {s.slot_number}
                  {s.profile_name ? ` — ${s.profile_name}` : ""} · {" "}
                  <span
                    className={
                      s.status === "disponible"
                        ? "text-primary"
                        : "text-muted-foreground"
                    }
                  >
                    {s.status}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  if (s.status !== "disponible") return;
                  if (confirm("Supprimer ce slot ?")) delMut.mutate(s.id);
                }}
                disabled={s.status !== "disponible" || delMut.isPending}
                className="rounded-md border border-border p-1.5 text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-40"
                title={
                  s.status === "disponible"
                    ? "Supprimer"
                    : "Slot vendu, non supprimable"
                }
              >
                {s.status === "disponible" ? (
                  <Trash2 className="h-3.5 w-3.5" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
