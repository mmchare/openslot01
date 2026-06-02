import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ImageIcon, Loader2, Lock, Pencil, Plus, Power, Timer, Trash2, Upload, X } from "lucide-react";
import {
  adminAddSlot,
  adminCreateApp,
  adminCreateApkUploadUrl,
  adminDeleteSlot,
  adminFinalizeApkUpload,
  adminListApps,
  adminListSlots,
  adminToggleApp,
  adminUpdateApkVersion,
  adminUpdateAppDuration,
  adminUpdateAppImage,
  adminUpdateAppPrice,
  adminUploadAppImage,
  verifyAdminPassword,
} from "@/lib/admin.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { supabase } from "@/integrations/supabase/client";


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
  const updatePrice = useServerFn(adminUpdateAppPrice);
  const updateImage = useServerFn(adminUpdateAppImage);
  const updateDuration = useServerFn(adminUpdateAppDuration);

  const { data: apps, isLoading, error } = useQuery({
    queryKey: ["admin-apps"],
    queryFn: () => listApps({ data: { password } }),
    retry: false,
  });

  useEffect(() => {
    if (error) onLogout();
  }, [error, onLogout]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-apps"] });

  const toggleMut = useMutation({
    mutationFn: (v: { application_id: string; is_active: boolean }) =>
      toggleApp({ data: { password, ...v } }),
    onSuccess: invalidate,
  });

  const priceMut = useMutation({
    mutationFn: (v: { application_id: string; price_fcfa: number }) =>
      updatePrice({ data: { password, ...v } }),
    onSuccess: invalidate,
  });

  const imageMut = useMutation({
    mutationFn: (v: { application_id: string; image_url: string | null }) =>
      updateImage({ data: { password, ...v } }),
    onSuccess: invalidate,
  });

  const durationMut = useMutation({
    mutationFn: (v: { application_id: string; subscription_duration_days: number }) =>
      updateDuration({ data: { password, ...v } }),
    onSuccess: invalidate,
  });

  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState<string>("");
  const [editingDurationId, setEditingDurationId] = useState<string | null>(null);
  const [durationDraft, setDurationDraft] = useState<string>("");
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [imageDraft, setImageDraft] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);

  const [openAppId, setOpenAppId] = useState<string | null>(null);


  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">Panneau admin</h1>
          <p className="text-sm text-muted-foreground">
            Gère le catalogue, les icônes, les prix, la durée d'abonnement et le stock.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-glow"
          >
            <Plus className="h-3 w-3" />
            {showCreate ? "Fermer" : "Nouvelle app"}
          </button>
          <button
            onClick={onLogout}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40"
          >
            Déconnexion
          </button>
        </div>
      </div>

      {showCreate && (
        <CreateAppForm
          password={password}
          onCreated={() => {
            invalidate();
            setShowCreate(false);
          }}
        />
      )}

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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingImageId(a.id);
                    setImageDraft(a.image_url ?? "");
                  }}
                  className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-background"
                  title="Modifier l'icône"
                >
                  {a.image_url ? (
                    <img src={a.image_url} alt={a.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 transition group-hover:opacity-100">
                    <Pencil className="h-3.5 w-3.5 text-primary" />
                  </div>
                </button>
                <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{a.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {a.category}
                  </span>
                  {a.product_type === "apk" && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
                      APK
                    </span>
                  )}
                  {!a.is_active && (
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-destructive">
                      Inactif
                    </span>
                  )}
                </div>
                {editingImageId === a.id && (
                  <div className="mt-2 space-y-2">
                    <IconUpload
                      password={password}
                      applicationId={a.id}
                      currentUrl={imageDraft || a.image_url || null}
                      onUploaded={(url) => {
                        setImageDraft(url);
                        qc.invalidateQueries({ queryKey: ["admin-apps"] });
                        setEditingImageId(null);
                      }}
                    />
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        imageMut.mutate(
                          { application_id: a.id, image_url: imageDraft.trim() || null },
                          { onSuccess: () => setEditingImageId(null) },
                        );
                      }}
                      className="flex flex-wrap items-center gap-1"
                    >
                      <input
                        type="url"
                        placeholder="…ou coller une URL https://"
                        value={imageDraft}
                        onChange={(e) => setImageDraft(e.target.value)}
                        className="w-64 rounded-md border border-border bg-background px-2 py-1 text-xs"
                      />
                      <button
                        type="submit"
                        disabled={imageMut.isPending}
                        className="rounded-md bg-primary/15 p-1 text-primary hover:bg-primary/25 disabled:opacity-50"
                      >
                        {imageMut.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingImageId(null)}
                        className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      {imageMut.error && (
                        <span className="w-full text-xs text-destructive">
                          {(imageMut.error as Error).message}
                        </span>
                      )}
                    </form>
                  </div>
                )}

                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {editingPriceId === a.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const n = Number(priceDraft);
                        if (!Number.isFinite(n) || n < 0) return;
                        priceMut.mutate(
                          { application_id: a.id, price_fcfa: Math.round(n) },
                          { onSuccess: () => setEditingPriceId(null) },
                        );
                      }}
                      className="flex items-center gap-1"
                    >
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={priceDraft}
                        onChange={(e) => setPriceDraft(e.target.value)}
                        autoFocus
                        className="w-28 rounded-md border border-border bg-background px-2 py-1 text-sm"
                      />
                      <span className="text-xs">FCFA</span>
                      <button
                        type="submit"
                        disabled={priceMut.isPending}
                        className="rounded-md bg-primary/15 p-1 text-primary hover:bg-primary/25 disabled:opacity-50"
                        title="Enregistrer"
                      >
                        {priceMut.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPriceId(null)}
                        className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground"
                        title="Annuler"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPriceId(a.id);
                        setPriceDraft(String(a.price_fcfa));
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted"
                      title="Modifier le prix"
                    >
                      <span className="font-medium text-foreground">
                        {a.price_fcfa.toLocaleString("fr-FR")} FCFA
                      </span>
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                  <span>·</span>
                  {a.product_type === "apk" ? (
                    <span className="text-primary">
                      {a.apk_file_path ? "APK prêt" : "APK manquant"}
                      {a.apk_version ? ` · v${a.apk_version}` : ""}
                    </span>
                  ) : (
                    <>
                      <span className="text-primary">
                        {a.stock_disponible} dispo
                      </span>
                      <span>· {a.stock_vendu} vendus</span>
                    </>
                  )}
                  <span>·</span>
                  {editingDurationId === a.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const n = Number(durationDraft);
                        if (!Number.isFinite(n) || n < 1) return;
                        durationMut.mutate(
                          { application_id: a.id, subscription_duration_days: Math.round(n) },
                          { onSuccess: () => setEditingDurationId(null) },
                        );
                      }}
                      className="flex items-center gap-1"
                    >
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        value={durationDraft}
                        onChange={(e) => setDurationDraft(e.target.value)}
                        autoFocus
                        className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm"
                      />
                      <span className="text-xs">jours</span>
                      <button
                        type="submit"
                        disabled={durationMut.isPending}
                        className="rounded-md bg-primary/15 p-1 text-primary hover:bg-primary/25 disabled:opacity-50"
                      >
                        {durationMut.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingDurationId(null)}
                        className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDurationId(a.id);
                        setDurationDraft(String(a.subscription_duration_days));
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted"
                      title="Modifier la durée d'abonnement"
                    >
                      <Timer className="h-3 w-3" />
                      <span className="font-medium text-foreground">
                        {a.subscription_duration_days} j
                      </span>
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
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
                  {openAppId === a.id
                    ? "Fermer"
                    : a.product_type === "apk"
                      ? "Gérer l'APK"
                      : "Gérer le stock"}
                </button>
              </div>
            </div>

            {openAppId === a.id &&
              (a.product_type === "apk" ? (
                <ApkManager
                  appId={a.id}
                  password={password}
                  currentVersion={a.apk_version}
                  currentPath={a.apk_file_path}
                  currentSize={a.apk_size_bytes}
                />
              ) : (
                <StockManager appId={a.id} password={password} />
              ))}
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
      profile_password: string | null;
    }) => addSlot({ data: { password, application_id: appId, ...v } }),
    onSuccess: () => {
      refresh();
      setForm({ account_email: "", account_password: "", slot_number: 1, profile_name: "", profile_password: "" });
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
    profile_password: "",
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
            profile_password: form.profile_password.trim() || null,
          });
        }}
        className="grid grid-cols-1 gap-2 sm:grid-cols-6"
      >
        <input
          required
          placeholder="Email du compte"
          value={form.account_email}
          onChange={(e) => setForm({ ...form, account_email: e.target.value })}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-3"
        />
        <input
          required
          placeholder="Mot de passe du compte"
          value={form.account_password}
          onChange={(e) =>
            setForm({ ...form, account_password: e.target.value })
          }
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-3"
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
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
        />
        <input
          placeholder="Nom du profil (optionnel)"
          value={form.profile_name}
          onChange={(e) => setForm({ ...form, profile_name: e.target.value })}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
        />
        <input
          placeholder="Code/PIN du profil (optionnel)"
          value={form.profile_password}
          onChange={(e) => setForm({ ...form, profile_password: e.target.value })}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
        />
        <button
          type="submit"
          disabled={addMut.isPending}
          className="sm:col-span-6 inline-flex items-center justify-center gap-1 rounded-lg bg-primary/15 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/25 disabled:opacity-50"
        >
          {addMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Ajouter ce slot
        </button>
        {addMut.error && (
          <p className="text-xs text-destructive sm:col-span-6">
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

function CreateAppForm({
  password,
  onCreated,
}: {
  password: string;
  onCreated: () => void;
}) {
  const create = useServerFn(adminCreateApp);
  const [form, setForm] = useState({
    name: "",
    category: "Streaming",
    description: "",
    price_fcfa: 2000,
    image_url: "",
    subscription_duration_days: 30,
    product_type: "account" as "account" | "apk",
  });
  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          password,
          name: form.name.trim(),
          category: form.category.trim(),
          description: form.description.trim() || null,
          price_fcfa: Math.round(Number(form.price_fcfa) || 0),
          image_url: form.image_url.trim() || null,
          subscription_duration_days: Math.round(Number(form.subscription_duration_days) || 30),
          product_type: form.product_type,
        },
      }),
    onSuccess: onCreated,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate();
      }}
      className="mt-4 grid grid-cols-1 gap-2 rounded-xl border border-primary/30 bg-surface p-4 sm:grid-cols-6"
    >
      <input
        required
        placeholder="Nom de l'app"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-3"
      />
      <input
        required
        placeholder="Catégorie"
        value={form.category}
        onChange={(e) => setForm({ ...form, category: e.target.value })}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-3"
      />
      <label className="sm:col-span-6 flex flex-col gap-1 rounded-lg border border-border bg-background px-3 py-2 text-sm">
        <span className="text-xs font-medium text-muted-foreground">Type de produit</span>
        <select
          value={form.product_type}
          onChange={(e) =>
            setForm({ ...form, product_type: e.target.value as "account" | "apk" })
          }
          className="bg-transparent text-sm outline-none"
        >
          <option value="account">Compte / Slot (accès partagé)</option>
          <option value="apk">APK Premium (téléchargement)</option>
        </select>
        <span className="text-[11px] text-muted-foreground">
          Pour un APK, tu pourras uploader le fichier .apk après création via « Gérer l'APK ».
        </span>
      </label>
      <div className="sm:col-span-6 space-y-2 rounded-lg border border-border bg-background px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Icône de l'app</span>
        <IconUpload
          password={password}
          currentUrl={form.image_url || null}
          onUploaded={(url) => setForm({ ...form, image_url: url })}
        />
        <input
          placeholder="…ou coller une URL https://"
          value={form.image_url}
          onChange={(e) => setForm({ ...form, image_url: e.target.value })}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <input
        type="number"
        min={0}
        step={100}
        required
        placeholder="Prix FCFA"
        value={form.price_fcfa}
        onChange={(e) => setForm({ ...form, price_fcfa: Number(e.target.value) })}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-3"
      />
      <input
        type="number"
        min={1}
        max={3650}
        required
        placeholder="Durée (jours)"
        value={form.subscription_duration_days}
        onChange={(e) =>
          setForm({ ...form, subscription_duration_days: Number(e.target.value) })
        }
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-3"
      />
      <textarea
        placeholder="Description (optionnel)"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        rows={2}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-6"
      />
      <button
        type="submit"
        disabled={mut.isPending || !form.name.trim()}
        className="sm:col-span-6 inline-flex items-center justify-center gap-1 rounded-lg bg-gradient-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
      >
        {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Créer l'application
      </button>
      {mut.error && (
        <p className="sm:col-span-6 text-xs text-destructive">
          {(mut.error as Error).message}
        </p>
      )}
    </form>
  );
}

function IconUpload({
  password,
  applicationId,
  currentUrl,
  onUploaded,
}: {
  password: string;
  applicationId?: string | null;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
}) {
  const upload = useServerFn(adminUploadAppImage);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Veuillez choisir un fichier image.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("Image trop lourde (max 3 Mo).");
      return;
    }
    setPending(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const data_base64 = btoa(bin);
      const res = await upload({
        data: {
          password,
          application_id: applicationId ?? null,
          file_name: file.name,
          content_type: file.type,
          data_base64,
        },
      });
      onUploaded(res.image_url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {currentUrl ? (
        <img
          src={currentUrl}
          alt="Aperçu icône"
          className="h-10 w-10 rounded-md border border-border object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
          <ImageIcon className="h-4 w-4" />
        </div>
      )}
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:border-primary/40">
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        {pending ? "Envoi…" : "Téléverser une image"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={pending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </label>
      {error && <span className="w-full text-xs text-destructive">{error}</span>}
    </div>
  );
}

