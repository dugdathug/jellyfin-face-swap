import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Ban,
  Layers,
  EyeOff,
  ArrowRight,
  Maximize2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import type { Job, JobDetail } from "@/lib/types";

const STATUS_CONFIG: Record<string, { color: string; icon: typeof Zap; label: string }> = {
  pending: { color: "var(--foreground-muted)", icon: Clock, label: "Pending" },
  running: { color: "var(--color-accent-purple)", icon: Loader2, label: "Running" },
  analyzing: { color: "var(--color-accent-purple)", icon: Loader2, label: "Analyzing" },
  swapping: { color: "var(--color-accent-cyan)", icon: Loader2, label: "Swapping" },
  batch_pending: { color: "var(--color-accent-cyan)", icon: Clock, label: "Batch Processing" },
  completed: { color: "var(--color-status-success)", icon: CheckCircle2, label: "Completed" },
  success: { color: "var(--color-status-success)", icon: CheckCircle2, label: "Success" },
  failed: { color: "var(--color-status-error)", icon: XCircle, label: "Failed" },
  skipped: { color: "var(--color-status-warning)", icon: EyeOff, label: "Skipped" },
  cancelled: { color: "var(--foreground-subtle)", icon: Ban, label: "Cancelled" },
};

function ProgressBar({
  completed,
  failed,
  skipped,
  total,
}: {
  completed: number;
  failed: number;
  skipped: number;
  total: number;
}) {
  if (total === 0) return null;

  const successPct = (completed / total) * 100;
  const failPct = (failed / total) * 100;
  const skipPct = (skipped / total) * 100;

  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--surface)]">
      {/* Success portion — dopamine gradient */}
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${successPct}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          background: "linear-gradient(90deg, var(--color-accent-purple), var(--color-accent-cyan))",
        }}
      />
      {/* Failed portion */}
      {failPct > 0 && (
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${failPct}%` }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="absolute inset-y-0 rounded-full bg-[var(--color-status-error)]"
          style={{ left: `${successPct}%` }}
        />
      )}
      {/* Skipped portion */}
      {skipPct > 0 && (
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${skipPct}%` }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="absolute inset-y-0 rounded-full bg-[var(--foreground-subtle)]/30"
          style={{ left: `${successPct + failPct}%` }}
        />
      )}
      {/* Shimmer for active jobs */}
      {successPct + failPct + skipPct < 100 && successPct > 0 && (
        <div
          className="absolute inset-y-0 w-16 animate-pulse rounded-full bg-white/20 blur-sm"
          style={{ left: `${Math.max(0, successPct - 8)}%` }}
        />
      )}
    </div>
  );
}

function JobCard({ job, onRefresh, onLightbox }: { job: Job; onRefresh: () => void; onLightbox: (src: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;
  const isActive = ["running", "pending", "batch_pending"].includes(job.status);
  const totalProcessed = job.completed_items + job.failed_items + job.skipped_items;

  const loadDetail = async () => {
    const data = await api.getJob(job.id);
    setDetail(data);
  };

  const toggle = () => {
    if (!expanded && !detail) loadDetail();
    setExpanded(!expanded);
  };

  const cancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setCancelling(true);
    try {
      await api.cancelJob(job.id);
      onRefresh();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass overflow-hidden rounded-[var(--radius-glass)]"
    >
      {/* Header row */}
      <button
        onClick={toggle}
        className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-[var(--color-glass-hover)]"
      >
        {/* Status icon */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-button)]"
          style={{ backgroundColor: `color-mix(in oklch, ${config.color}, transparent 85%)` }}
        >
          <StatusIcon
            className={cn(
              "h-4.5 w-4.5",
              job.status === "running" && "animate-spin"
            )}
            style={{ color: config.color }}
          />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-[Outfit] text-sm font-semibold text-[var(--foreground)]">
              {job.mode === "batch" ? "Batch" : "Instant"} — {job.image_type}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{
                color: config.color,
                backgroundColor: `color-mix(in oklch, ${config.color}, transparent 88%)`,
              }}
            >
              {config.label}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
            {totalProcessed} / {job.total_items} items
            {job.completed_items > 0 && ` · ${job.completed_items} success`}
            {job.failed_items > 0 && ` · ${job.failed_items} failed`}
            {job.skipped_items > 0 && ` · ${job.skipped_items} skipped`}
            {job.status === "batch_pending" && job.created_at && (() => {
              const elapsed = Math.floor((Date.now() - new Date(job.created_at).getTime()) / 1000);
              const mins = Math.floor(elapsed / 60);
              const hrs = Math.floor(mins / 60);
              const timeStr = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
              return ` · submitted ${timeStr} ago`;
            })()}
          </p>
          {job.status === "batch_pending" && (
            <p className="mt-1 text-[10px] text-[var(--color-accent-cyan)]">
              Batch processing — results may take minutes to hours. Images will be applied to Jellyfin automatically.
            </p>
          )}

          {/* Progress bar */}
          {job.total_items > 0 && (
            <div className="mt-2.5">
              <ProgressBar
                completed={job.completed_items}
                failed={job.failed_items}
                skipped={job.skipped_items}
                total={job.total_items}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {isActive && (
            <button
              onClick={cancel}
              disabled={cancelling}
              className="rounded-[var(--radius-button)] px-3 py-1.5 text-xs font-medium text-[var(--color-status-error)] transition-colors hover:bg-[var(--color-status-error)]/10"
            >
              Cancel
            </button>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-[var(--foreground-muted)]" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[var(--foreground-muted)]" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--border-subtle)] px-4 py-3">
              {!detail ? (
                <div className="flex items-center gap-2 py-4 text-sm text-[var(--foreground-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading details...
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {detail.items.map((item) => {
                    const itemStatus = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
                    const ItemIcon = itemStatus.icon;
                    const analysis = item.analysis;
                    const facesInfo = analysis
                      ? `${analysis.total_faces ?? 0} faces (${analysis.male_faces ?? 0}M/${analysis.female_faces ?? 0}F)`
                      : null;
                    const dominantGender = analysis?.dominant_gender ? String(analysis.dominant_gender) : null;

                    return (
                      <div
                        key={item.id}
                        className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-3"
                      >
                        {/* Header row */}
                        <div className="flex items-center gap-2 mb-2">
                          <ItemIcon
                            className={cn(
                              "h-4 w-4 shrink-0",
                              ["analyzing", "swapping"].includes(item.status) && "animate-spin"
                            )}
                            style={{ color: itemStatus.color }}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--foreground)]">
                            {item.item_name || item.item_id}
                          </span>
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                            style={{
                              color: itemStatus.color,
                              backgroundColor: `color-mix(in oklch, ${itemStatus.color}, transparent 88%)`,
                            }}
                          >
                            {itemStatus.label}
                          </span>
                          <span className="shrink-0 text-[10px] text-[var(--foreground-subtle)] uppercase">
                            {item.image_type}
                          </span>
                        </div>

                        {/* Analysis info */}
                        {facesInfo && (
                          <p className="mb-2 text-xs text-[var(--foreground-muted)]">
                            {facesInfo}
                            {dominantGender && ` · dominant: ${dominantGender}`}
                          </p>
                        )}

                        {/* Error message */}
                        {item.error && (
                          <p className="mb-2 text-xs text-[var(--color-status-error)] bg-[var(--color-status-error)]/5 rounded-md px-2 py-1">
                            {item.error}
                          </p>
                        )}

                        {/* Before / After thumbnails */}
                        {item.status === "success" && (() => {
                          const beforeSrc = api.backupUrl(item.item_id, item.image_type);
                          const afterSrc = item.image_type === "poster"
                            ? api.posterUrl(item.item_id, "swapped")
                            : item.image_type === "backdrop"
                            ? api.backdropUrl(item.item_id, "swapped")
                            : api.landscapeUrl(item.item_id, "swapped");
                          const isPoster = item.image_type === "poster";

                          return (
                            <div className="flex items-center gap-2 mt-2">
                              {/* Before */}
                              <div className="group/thumb relative">
                                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--foreground-subtle)] mb-1">Before</p>
                                <div className={cn(
                                  "overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]",
                                  isPoster ? "h-24 w-16" : "h-16 w-28"
                                )}>
                                  <img src={beforeSrc} alt="Original" className="h-full w-full object-cover" />
                                </div>
                                <button
                                  onClick={() => onLightbox(beforeSrc)}
                                  className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded bg-black/40 text-white/70 opacity-0 transition-all group-hover/thumb:opacity-100 hover:bg-black/60 hover:text-white"
                                >
                                  <Maximize2 className="h-3 w-3" />
                                </button>
                              </div>

                              <ArrowRight className="h-4 w-4 shrink-0 text-[var(--foreground-subtle)]" />

                              {/* After */}
                              <div className="group/thumb relative">
                                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-status-success)] mb-1">After</p>
                                <div className={cn(
                                  "overflow-hidden rounded-lg border border-[var(--color-status-success)]/30 bg-[var(--surface-raised)]",
                                  isPoster ? "h-24 w-16" : "h-16 w-28"
                                )}>
                                  <img src={afterSrc} alt="Swapped" className="h-full w-full object-cover" />
                                </div>
                                <button
                                  onClick={() => onLightbox(afterSrc)}
                                  className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded bg-black/40 text-white/70 opacity-0 transition-all group-hover/thumb:opacity-100 hover:bg-black/60 hover:text-white"
                                >
                                  <Maximize2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="mt-2 text-[10px] text-[var(--foreground-subtle)]">
                Created: {job.created_at ? new Date(job.created_at).toLocaleString() : "—"}
                {job.completed_at && ` · Completed: ${new Date(job.completed_at).toLocaleString()}`}
                {job.gemini_batch_id && ` · Batch: ${job.gemini_batch_id}`}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const data = await api.getJobs();
      setJobs(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    // Poll for active jobs
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const activeJobs = jobs.filter((j) =>
    ["pending", "running", "batch_pending"].includes(j.status)
  );
  const completedJobs = jobs.filter((j) =>
    ["completed", "failed", "cancelled"].includes(j.status)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-[Outfit] text-3xl font-semibold tracking-tight text-[var(--foreground)]">
          Jobs
        </h1>
        <p className="mt-0.5 text-sm text-[var(--foreground-muted)]">
          Monitor face swap processing
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--foreground-muted)]" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="glass flex flex-col items-center rounded-[var(--radius-glass)] py-16">
          <Layers className="mb-3 h-12 w-12 text-[var(--foreground-subtle)]" />
          <p className="font-[Outfit] text-lg font-medium text-[var(--foreground-muted)]">
            No jobs yet
          </p>
          <p className="mt-1 text-sm text-[var(--foreground-subtle)]">
            Select items in the Library and start swapping
          </p>
        </div>
      ) : (
        <>
          {/* Active jobs */}
          {activeJobs.length > 0 && (
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 font-[Outfit] text-sm font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
                <div className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent-purple)]" />
                Active
              </h2>
              {activeJobs.map((job) => (
                <JobCard key={job.id} job={job} onRefresh={fetchJobs} onLightbox={setLightboxSrc} />
              ))}
            </div>
          )}

          {/* Completed jobs */}
          {completedJobs.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-[Outfit] text-sm font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
                History
              </h2>
              {completedJobs.map((job) => (
                <JobCard key={job.id} job={job} onRefresh={fetchJobs} onLightbox={setLightboxSrc} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8"
            onClick={() => setLightboxSrc(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring" as const, stiffness: 300, damping: 28 }}
              className="relative max-h-[90vh] max-w-[90vw]"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={lightboxSrc}
                alt="Preview"
                className="max-h-[85vh] max-w-[85vw] rounded-[var(--radius-glass)] shadow-2xl object-contain"
              />
              <button
                onClick={() => setLightboxSrc(null)}
                className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] shadow-lg transition-transform hover:scale-110"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
