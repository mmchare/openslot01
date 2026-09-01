import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Mail, Lock, User, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — OpenSlot" },
      { name: "description", content: "Connecte-toi ou crée un compte OpenSlot." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("+237");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const validate = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Adresse email invalide.");
      return false;
    }
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return false;
    }
    if (mode === "signup") {
      if (fullName.trim().length < 2) {
        setError("Merci d'entrer ton nom complet.");
        return false;
      }
      if (!/^\+?[0-9]{8,20}$/.test(phone.replace(/\s/g, ""))) {
        setError("Numéro de téléphone invalide.");
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!validate()) return;

    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              phone: phone.replace(/\s/g, ""),
            },
          },
        });
        if (signUpError) throw signUpError;
        if (signUpError) throw signUpError;
        if (signUpError) throw signUpError;

        // Crée le profil si l'utilisateur est immédiatement connecté (auto-confirm ou session existante)
        if (data.user) {
          await supabase.from("profiles").insert({
            id: data.user.id,
            full_name: fullName.trim(),
            phone: phone.replace(/\s/g, ""),
            referral_code: generateReferralCode(),
          });
        }

        setMessage(
          "Compte créé. Vérifie ta boîte mail (et tes spams) pour confirmer ton email, puis connecte-toi.",
        );
        setMode("signin");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        navigate({ to: "/compte" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>

        <div className="mt-6 rounded-2xl border border-border bg-gradient-card p-6 shadow-card sm:p-8">
          <h1 className="font-display text-2xl font-semibold">
            {mode === "signin" ? "Connexion" : "Créer un compte"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Accède à ton historique de commandes."
              : "Crée un compte pour suivre tes achats."}
          </p>

          <div className="mt-6 flex rounded-lg border border-border p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
                mode === "signin"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
                mode === "signup"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Inscription
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <>
                <Field
                  label="Nom complet"
                  icon={<User className="h-4 w-4" />}
                  value={fullName}
                  onChange={setFullName}
                  placeholder="Ex: Aïcha N."
                  required
                  minLength={2}
                />
                <Field
                  label="Téléphone"
                  icon={<span className="text-xs">📞</span>}
                  value={phone}
                  onChange={setPhone}
                  placeholder="+237 6xx xxx xxx"
                  required
                />
              </>
            )}
            <Field
              label="Email"
              type="email"
              icon={<Mail className="h-4 w-4" />}
              value={email}
              onChange={setEmail}
              placeholder="toi@email.com"
              required
            />
            <Field
              label="Mot de passe"
              type="password"
              icon={<Lock className="h-4 w-4" />}
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              required
              minLength={6}
            />

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

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-90 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
                </>
              ) : mode === "signin" ? (
                "Se connecter"
              ) : (
                "Créer mon compte"
              )}
            </button>
          </form>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function Field({
  label,
  type = "text",
  icon,
  value,
  onChange,
  placeholder,
  required,
  minLength,
}: {
  label: string;
  type?: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <div className="relative mt-1.5">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          className="input-auth"
        />
      </div>
      <style>{`
        .input-auth {
          width: 100%;
          background: var(--input);
          border: 1px solid var(--border);
          color: var(--foreground);
          border-radius: 0.625rem;
          padding: 0.65rem 0.85rem 0.65rem 2.5rem;
          font-size: 0.9rem;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .input-auth:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 25%, transparent);
        }
        .input-auth::placeholder { color: var(--muted-foreground); }
      `}</style>
    </div>
  );
}

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
