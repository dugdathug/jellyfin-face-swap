import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Server,
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  Shield,
  Upload,
  Terminal,
  HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import type { Settings as SettingsType } from "@/lib/types";

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
} satisfies import("framer-motion").Variants;

const slideUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
} satisfies import("framer-motion").Variants;

function GlassCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={slideUp}
      className={cn(
        "glass rounded-[var(--radius-glass)] p-6",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-[var(--radius-button)] border border-[var(--input-border)] bg-[var(--input)] px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none transition-all duration-200",
          "placeholder:text-[var(--foreground-subtle)]",
          "focus:border-[var(--input-focus)] focus:ring-2 focus:ring-[var(--input-focus)]/20",
          mono && "font-mono text-xs"
        )}
      />
    </div>
  );
}

function TestButton({
  label,
  onClick,
  result,
  loading,
}: {
  label: string;
  onClick: () => void;
  result: { success: boolean; message: string } | null;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onClick}
        disabled={loading}
        className={cn(
          "inline-flex items-center gap-2 rounded-[var(--radius-button)] px-4 py-2 text-sm font-medium transition-all duration-200",
          "bg-[var(--primary)] text-[var(--primary-foreground)]",
          "hover:brightness-110 active:scale-[0.97]",
          "disabled:opacity-50"
        )}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Shield className="h-3.5 w-3.5" />
        )}
        {label}
      </button>
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "flex items-center gap-1.5 text-sm",
              result.success ? "text-[var(--color-status-success)]" : "text-[var(--color-status-error)]"
            )}
          >
            {result.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <span className="max-w-[300px] truncate">{result.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [form, setForm] = useState({
    jellyfin_url: "",
    jellyfin_api_key: "",
    gemini_api_key: "",
    anthropic_api_key: "",
    fal_key: "",
    backdrop_upload: "api",
    media_ssh: "",
    analysis_backend: "gemini",
    swap_backend: "gemini",
  });
  const [jfTest, setJfTest] = useState<{ success: boolean; message: string } | null>(null);
  const [gemTest, setGemTest] = useState<{ success: boolean; message: string } | null>(null);
  const [jfLoading, setJfLoading] = useState(false);
  const [gemLoading, setGemLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      setForm({
        jellyfin_url: s.jellyfin_url,
        jellyfin_api_key: s.jellyfin_api_key,
        gemini_api_key: s.gemini_api_key,
        anthropic_api_key: s.anthropic_api_key,
        fal_key: s.fal_key,
        backdrop_upload: s.backdrop_upload,
        media_ssh: s.media_ssh,
        analysis_backend: s.analysis_backend,
        swap_backend: s.swap_backend,
      });
    });
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const result = await api.updateSettings(form);
      setSettings(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const testJellyfin = async () => {
    setJfLoading(true);
    setJfTest(null);
    try {
      const result = await api.testJellyfin();
      setJfTest(result);
    } catch (e) {
      setJfTest({ success: false, message: String(e) });
    } finally {
      setJfLoading(false);
    }
  };

  const testGemini = async () => {
    setGemLoading(true);
    setGemTest(null);
    try {
      const result = await api.testGemini();
      setGemTest(result);
    } catch (e) {
      setGemTest({ success: false, message: String(e) });
    } finally {
      setGemLoading(false);
    }
  };

  const backdropModes = [
    { value: "api", label: "API Upload", desc: "Upload via Jellyfin API (recommended)", icon: Upload },
    { value: "ssh", label: "SSH Upload", desc: "Write files directly via SSH", icon: Terminal },
    { value: "local", label: "Local Write", desc: "Write files on local filesystem", icon: HardDrive },
  ];

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-2xl space-y-6"
    >
      {/* Header */}
      <motion.div variants={slideUp}>
        <h1 className="font-[Outfit] text-3xl font-semibold tracking-tight text-[var(--foreground)]">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          Configure your connections and AI backends
        </p>
      </motion.div>

      {/* Jellyfin Connection */}
      <GlassCard>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-button)] bg-[var(--color-accent-purple)]/10">
            <Server className="h-4.5 w-4.5 text-[var(--color-accent-purple)]" />
          </div>
          <div>
            <h2 className="font-[Outfit] text-lg font-semibold text-[var(--foreground)]">
              Jellyfin Server
            </h2>
            <p className="text-xs text-[var(--foreground-muted)]">
              Connect to your media library
            </p>
          </div>
          {settings?.jellyfin_configured && (
            <CheckCircle2 className="ml-auto h-5 w-5 text-[var(--color-status-success)]" />
          )}
        </div>
        <div className="space-y-4">
          <InputField
            label="Server URL"
            value={form.jellyfin_url}
            onChange={(v) => setForm({ ...form, jellyfin_url: v })}
            placeholder="http://your-jellyfin:8096"
          />
          <InputField
            label="API Key"
            value={form.jellyfin_api_key}
            onChange={(v) => setForm({ ...form, jellyfin_api_key: v })}
            type="password"
            placeholder="Your Jellyfin API key"
            mono
          />
          <TestButton
            label="Test Connection"
            onClick={testJellyfin}
            result={jfTest}
            loading={jfLoading}
          />
        </div>
      </GlassCard>

      {/* Gemini AI */}
      <GlassCard>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-button)] bg-[var(--color-accent-cyan)]/10">
            <Sparkles className="h-4.5 w-4.5 text-[var(--color-accent-cyan)]" />
          </div>
          <div>
            <h2 className="font-[Outfit] text-lg font-semibold text-[var(--foreground)]">
              Google Gemini
            </h2>
            <p className="text-xs text-[var(--foreground-muted)]">
              Powers face analysis and image generation
            </p>
          </div>
          {settings?.gemini_configured && (
            <CheckCircle2 className="ml-auto h-5 w-5 text-[var(--color-status-success)]" />
          )}
        </div>
        <div className="space-y-4">
          <InputField
            label="Gemini API Key"
            value={form.gemini_api_key}
            onChange={(v) => setForm({ ...form, gemini_api_key: v })}
            type="password"
            placeholder="Your Google AI API key"
            mono
          />
          <TestButton
            label="Test Gemini"
            onClick={testGemini}
            result={gemTest}
            loading={gemLoading}
          />
        </div>
      </GlassCard>

      {/* Backdrop Upload Mode */}
      <GlassCard>
        <h2 className="mb-4 font-[Outfit] text-lg font-semibold text-[var(--foreground)]">
          Backdrop Upload
        </h2>
        <div className="grid gap-2">
          {backdropModes.map(({ value, label, desc, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setForm({ ...form, backdrop_upload: value })}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius-card)] border p-3.5 text-left transition-all duration-200",
                form.backdrop_upload === value
                  ? "border-[var(--primary)] bg-[var(--primary)]/5"
                  : "border-[var(--border-subtle)] hover:border-[var(--border)] hover:bg-[var(--color-glass-hover)]"
              )}
            >
              <Icon className={cn(
                "h-4.5 w-4.5",
                form.backdrop_upload === value ? "text-[var(--primary)]" : "text-[var(--foreground-muted)]"
              )} />
              <div>
                <div className="text-sm font-medium text-[var(--foreground)]">{label}</div>
                <div className="text-xs text-[var(--foreground-muted)]">{desc}</div>
              </div>
            </button>
          ))}
        </div>

        <AnimatePresence>
          {form.backdrop_upload === "ssh" && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-4">
                <InputField
                  label="SSH Host"
                  value={form.media_ssh}
                  onChange={(v) => setForm({ ...form, media_ssh: v })}
                  placeholder="user@jellyfin-host"
                  mono
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* Optional Backends */}
      <GlassCard>
        <h2 className="mb-1 font-[Outfit] text-lg font-semibold text-[var(--foreground)]">
          Alternative Backends
        </h2>
        <p className="mb-4 text-xs text-[var(--foreground-muted)]">
          Optional — Gemini handles both analysis and image generation by default
        </p>
        <div className="space-y-4">
          <InputField
            label="Anthropic API Key (for Claude Vision analysis)"
            value={form.anthropic_api_key}
            onChange={(v) => setForm({ ...form, anthropic_api_key: v })}
            type="password"
            placeholder="sk-ant-..."
            mono
          />
          <InputField
            label="fal.ai Key (for fal.ai face swap)"
            value={form.fal_key}
            onChange={(v) => setForm({ ...form, fal_key: v })}
            type="password"
            placeholder="Your fal.ai API key"
            mono
          />
        </div>
      </GlassCard>

      {/* Save */}
      <motion.div variants={slideUp} className="flex items-center gap-3 pb-8">
        <button
          onClick={save}
          disabled={saving}
          className={cn(
            "inline-flex items-center gap-2 rounded-[var(--radius-button)] px-6 py-2.5 text-sm font-semibold transition-all duration-200",
            "bg-[var(--primary)] text-[var(--primary-foreground)]",
            "hover:brightness-110 active:scale-[0.97]",
            saved && "glow-purple",
            "disabled:opacity-50"
          )}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saved ? "Saved!" : "Save Settings"}
        </button>
        {settings?.missing && settings.missing.length > 0 && (
          <span className="text-xs text-[var(--color-status-warning)]">
            Missing: {settings.missing.join(", ")}
          </span>
        )}
      </motion.div>
    </motion.div>
  );
}
