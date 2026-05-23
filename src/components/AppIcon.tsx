import {
  Music,
  Film,
  Sparkles,
  Video,
  Bot,
  FileText,
  Box,
} from "lucide-react";

const map: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; gradient: string }
> = {
  netflix: { icon: Film, gradient: "from-red-500 to-rose-700" },
  spotify: { icon: Music, gradient: "from-emerald-400 to-green-600" },
  canva: { icon: Sparkles, gradient: "from-cyan-400 to-violet-500" },
  capcut: { icon: Video, gradient: "from-fuchsia-400 to-indigo-600" },
  chatgpt: { icon: Bot, gradient: "from-teal-400 to-emerald-600" },
  microsoft: { icon: FileText, gradient: "from-sky-400 to-blue-700" },
};

interface AppIconProps {
  slug: string | null;
  size?: "sm" | "md" | "lg";
}

export function AppIcon({ slug, size = "md" }: AppIconProps) {
  const dims =
    size === "lg"
      ? "h-14 w-14 rounded-2xl"
      : size === "sm"
        ? "h-9 w-9 rounded-lg"
        : "h-12 w-12 rounded-xl";
  const iconDims = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-6 w-6";

  // If slug is an actual image URL (uploaded icon), render it
  if (slug && /^https?:\/\//i.test(slug)) {
    return (
      <div
        className={`${dims} overflow-hidden bg-surface flex items-center justify-center shadow-card`}
      >
        <img
          src={slug}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  const entry = (slug && map[slug]) || { icon: Box, gradient: "from-slate-500 to-slate-700" };
  const Icon = entry.icon;

  return (
    <div
      className={`${dims} bg-gradient-to-br ${entry.gradient} flex items-center justify-center shadow-card`}
    >
      <Icon className={`${iconDims} text-white`} />
    </div>
  );
}
