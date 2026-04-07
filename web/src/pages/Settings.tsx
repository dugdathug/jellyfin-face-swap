import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Server,
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  Shield,
  FileText,
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
      className={cn("glass rounded-[var(--radius-glass)] p-6", className)}
    >
      {children}
    </motion.div>
  );
}

function StatusRow({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-[var(--foreground)]">{label}</span>
      {configured ? (
        <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-status-success)]">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Configured
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-status-error)]">
          <XCircle className="h-3.5 w-3.5" />
          Not set
        </span>
      )}
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
      {result && (
        <span
          className={cn(
            "flex items-center gap-1.5 text-sm",
            result.success ? "text-[var(--color-status-success)]" : "text-[var(--color-status-error)]"
          )}
        >
          {result.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <span className="max-w-[300px] truncate">{result.message}</span>
        </span>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [jfTest, setJfTest] = useState<{ success: boolean; message: string } | null>(null);
  const [gemTest, setGemTest] = useState<{ success: boolean; message: string } | null>(null);
  const [jfLoading, setJfLoading] = useState(false);
  const [gemLoading, setGemLoading] = useState(false);

  useEffect(() => {
    api.getSettings().then(setSettings);
  }, []);

  const testJellyfin = async () => {
    setJfLoading(true);
    setJfTest(null);
    try {
      setJfTest(await api.testJellyfin());
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
      setGemTest(await api.testGemini());
    } catch (e) {
      setGemTest({ success: false, message: String(e) });
    } finally {
      setGemLoading(false);
    }
  };

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
          Connection status and configuration
        </p>
      </motion.div>

      {/* How to configure */}
      <GlassCard>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[var(--foreground)]/5">
            <FileText className="h-4.5 w-4.5 text-[var(--foreground-muted)]" />
          </div>
          <div>
            <h2 className="font-[Outfit] text-base font-semibold text-[var(--foreground)]">
              Configuration
            </h2>
            <p className="mt-1 text-sm text-[var(--foreground-muted)] leading-relaxed">
              API keys are configured via the <code className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-xs font-mono text-[var(--foreground)]">.env</code> file
              in the project root. Copy <code className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-xs font-mono text-[var(--foreground)]">.env.example</code> to
              get started, then restart the server after making changes.
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Jellyfin Connection */}
      <GlassCard>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-button)] bg-[var(--color-accent-purple)]/10">
            <Server className="h-4.5 w-4.5 text-[var(--color-accent-purple)]" />
          </div>
          <div>
            <h2 className="font-[Outfit] text-lg font-semibold text-[var(--foreground)]">
              Jellyfin Server
            </h2>
            <p className="text-xs text-[var(--foreground-muted)]">
              Media library connection
            </p>
          </div>
        </div>
        <div className="space-y-1 mb-4 divide-y divide-[var(--border-subtle)]">
          <StatusRow label="Server URL" configured={!!settings?.jellyfin_url} />
          <StatusRow label="API Key" configured={settings?.jellyfin_configured ?? false} />
        </div>
        {settings?.jellyfin_url && (
          <p className="mb-4 text-xs text-[var(--foreground-subtle)] font-mono truncate">
            {settings.jellyfin_url}
          </p>
        )}
        <TestButton label="Test Connection" onClick={testJellyfin} result={jfTest} loading={jfLoading} />
      </GlassCard>

      {/* Gemini AI */}
      <GlassCard>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-button)] bg-[var(--color-accent-cyan)]/10">
            <Sparkles className="h-4.5 w-4.5 text-[var(--color-accent-cyan)]" />
          </div>
          <div>
            <h2 className="font-[Outfit] text-lg font-semibold text-[var(--foreground)]">
              Google Gemini
            </h2>
            <p className="text-xs text-[var(--foreground-muted)]">
              Face analysis and image generation
            </p>
          </div>
        </div>
        <div className="space-y-1 mb-4 divide-y divide-[var(--border-subtle)]">
          <StatusRow label="Gemini API Key" configured={settings?.gemini_configured ?? false} />
        </div>
        <TestButton label="Test Gemini" onClick={testGemini} result={gemTest} loading={gemLoading} />
      </GlassCard>

      {/* Optional backends status */}
      <GlassCard>
        <h2 className="mb-3 font-[Outfit] text-lg font-semibold text-[var(--foreground)]">
          Optional Backends
        </h2>
        <p className="mb-3 text-xs text-[var(--foreground-muted)]">
          Gemini handles both analysis and generation by default. These are optional alternatives.
        </p>
        <div className="space-y-1 divide-y divide-[var(--border-subtle)]">
          <StatusRow label="Anthropic API Key (Claude Vision)" configured={settings?.anthropic_configured ?? false} />
          <StatusRow label="fal.ai Key (fal.ai face swap)" configured={settings?.fal_configured ?? false} />
        </div>
      </GlassCard>

      {/* Missing config warning */}
      {settings?.missing && settings.missing.length > 0 && (
        <motion.div variants={slideUp} className="rounded-[var(--radius-glass)] border border-[var(--color-status-warning)]/30 bg-[var(--color-status-warning)]/5 px-4 py-3">
          <p className="text-sm font-medium text-[var(--color-status-warning)]">
            Missing required configuration:
          </p>
          <ul className="mt-1 space-y-0.5">
            {settings.missing.map((m) => (
              <li key={m} className="text-xs text-[var(--foreground-muted)]">· {m}</li>
            ))}
          </ul>
        </motion.div>
      )}

      <div className="pb-8" />
    </motion.div>
  );
}
