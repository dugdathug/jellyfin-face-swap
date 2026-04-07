import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  RefreshCw,
  CheckSquare,
  Square,
  Zap,
  Clock,
  Film,
  Tv,
  Filter,
  Image,
  RectangleHorizontal,
  Loader2,
  Check,
  X,
  ImageOff,
  Maximize2,
  CheckCheck,
  XCircle,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import type { LibraryItem } from "@/lib/types";

const TYPE_FILTERS = [
  { value: "", label: "All Types", icon: Filter },
  { value: "Movie", label: "Movies", icon: Film },
  { value: "Series", label: "Shows", icon: Tv },
] as const;

const STATUS_FILTERS = [
  { value: "", label: "Any Status" },
  { value: "original", label: "Original" },
  { value: "pending", label: "Batch Pending" },
  { value: "swapped", label: "Swapped" },
  { value: "failed", label: "Failed" },
] as const;

const IMAGE_TYPES = [
  { key: "poster", label: "Poster", icon: Image },
  { key: "backdrop", label: "Backdrop", icon: RectangleHorizontal },
  { key: "landscape", label: "Landscape", icon: RectangleHorizontal },
] as const;

type ImageType = "poster" | "backdrop" | "landscape";

function getImageUrl(itemId: string, type: ImageType, status: string) {
  if (type === "poster") return api.posterUrl(itemId, status);
  if (type === "backdrop") return api.backdropUrl(itemId, status);
  return api.landscapeUrl(itemId, status);
}

function getStatus(item: LibraryItem, type: ImageType) {
  if (type === "poster") return item.poster_status;
  if (type === "backdrop") return item.backdrop_status;
  return item.landscape_status;
}

/* ------------------------------------------------------------------ */
/* Mini status dot for individual image thumbnails                    */
/* ------------------------------------------------------------------ */
function StatusDot({ status }: { status: string }) {
  if (status === "swapped") {
    return (
      <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-status-success)] shadow">
        <Check className="h-2.5 w-2.5 text-white" />
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-status-error)] shadow">
        <X className="h-2.5 w-2.5 text-white" />
      </div>
    );
  }
  if (status === "pending") {
    return (
      <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent-cyan)] shadow">
        <Clock className="h-2.5 w-2.5 text-white animate-pulse" />
      </div>
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Image thumbnail with expand button                                 */
/* ------------------------------------------------------------------ */
function ImageThumb({
  item,
  type,
  aspect,
  onExpand,
}: {
  item: LibraryItem;
  type: ImageType;
  aspect: string;
  onExpand: () => void;
}) {
  const [err, setErr] = useState(false);
  const status = getStatus(item, type);

  return (
    <div className={cn("group/thumb relative overflow-hidden rounded-lg bg-[var(--surface-raised)]", aspect)}>
      {err ? (
        <div className="flex h-full w-full items-center justify-center">
          <ImageOff className="h-5 w-5 text-[var(--foreground-subtle)]" />
        </div>
      ) : (
        <img
          src={getImageUrl(item.id, type, status)}
          alt={`${item.name} ${type}`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setErr(true)}
        />
      )}
      <StatusDot status={status} />
      {/* Expand button */}
      <button
        onClick={(e) => { e.stopPropagation(); onExpand(); }}
        className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded bg-black/40 text-white/70 opacity-0 backdrop-blur-sm transition-all group-hover/thumb:opacity-100 hover:bg-black/60 hover:text-white"
      >
        <Maximize2 className="h-3 w-3" />
      </button>
      {/* Label */}
      <div className="absolute bottom-1 left-1 rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/70 opacity-0 backdrop-blur-sm transition-opacity group-hover/thumb:opacity-100">
        {type}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Title Card — shows all selected image types for one title          */
/* ------------------------------------------------------------------ */
function TitleCard({
  item,
  visibleTypes,
  selected,
  onToggle,
  onExpand,
}: {
  item: LibraryItem;
  visibleTypes: Set<ImageType>;
  selected: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onExpand: (type: ImageType) => void;
}) {
  const hasPoster = visibleTypes.has("poster");
  const landscapeTypes = (["backdrop", "landscape"] as const).filter((t) => visibleTypes.has(t));
  const posterOnly = hasPoster && landscapeTypes.length === 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group relative cursor-pointer rounded-[var(--radius-glass)] border transition-all duration-200",
        selected
          ? "border-[var(--primary)] bg-[var(--primary)]/5 shadow-lg"
          : "border-[var(--border-subtle)] bg-[var(--surface)] hover:border-[var(--border)] hover:shadow-md"
      )}
      onClick={onToggle}
    >
      {/* Selection indicator */}
      <div
        className={cn(
          "absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md transition-all duration-200 pointer-events-none",
          selected
            ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-md opacity-100"
            : "bg-black/30 text-white/70 opacity-0 group-hover:opacity-100"
        )}
      >
        {selected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
      </div>

      {/* Image layout */}
      <div className="p-2">
        {posterOnly ? (
          /* Poster only — tall card */
          <ImageThumb item={item} type="poster" aspect="aspect-[2/3]" onExpand={() => onExpand("poster")} />
        ) : hasPoster ? (
          /* Poster + landscape(s) — side by side */
          <div className="flex gap-2">
            <div className="w-[40%] shrink-0">
              <ImageThumb item={item} type="poster" aspect="aspect-[2/3]" onExpand={() => onExpand("poster")} />
            </div>
            <div className={cn("flex flex-1 flex-col gap-2", landscapeTypes.length === 1 && "justify-center")}>
              {landscapeTypes.map((t) => (
                <ImageThumb key={t} item={item} type={t} aspect="aspect-video" onExpand={() => onExpand(t)} />
              ))}
            </div>
          </div>
        ) : (
          /* Landscape only */
          <div className="flex flex-col gap-2">
            {landscapeTypes.map((t) => (
              <ImageThumb key={t} item={item} type={t} aspect="aspect-video" onExpand={() => onExpand(t)} />
            ))}
          </div>
        )}
      </div>

      {/* Title bar */}
      <div className="px-3 pb-2.5 pt-1">
        <p className="font-[Outfit] text-sm font-medium leading-tight text-[var(--foreground)] truncate">
          {item.name}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--foreground-muted)]">
            {item.type}
          </span>
          {item.year && (
            <span className="text-[10px] text-[var(--foreground-subtle)]">{item.year}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Lightbox                                                            */
/* ------------------------------------------------------------------ */
function Lightbox({
  item,
  imageType,
  onClose,
}: {
  item: LibraryItem;
  imageType: ImageType;
  onClose: () => void;
}) {
  const status = getStatus(item, imageType);
  const imgSrc = getImageUrl(item.id, imageType, status);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8"
      onClick={onClose}
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
          src={imgSrc}
          alt={item.name}
          className={cn(
            "rounded-[var(--radius-glass)] shadow-2xl object-contain",
            imageType === "poster" ? "max-h-[85vh]" : "max-w-[85vw]"
          )}
        />
        <div className="absolute inset-x-0 bottom-0 rounded-b-[var(--radius-glass)] bg-gradient-to-t from-black/80 to-transparent p-4 pt-12">
          <p className="font-[Outfit] text-xl font-semibold text-white drop-shadow-lg">{item.name}</p>
          <div className="mt-1 flex items-center gap-2 text-sm text-white/60">
            <span>{item.type}</span>
            {item.year && <span>· {item.year}</span>}
            <span>· {imageType} · {status}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] shadow-lg transition-transform hover:scale-110"
        >
          <X className="h-4 w-4" />
        </button>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Sticky state hook                                                   */
/* ------------------------------------------------------------------ */
function useStickyState<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(`jfswap-${key}`);
    if (stored !== null) {
      try { return JSON.parse(stored); } catch { /* ignore */ }
    }
    return defaultValue;
  });
  const set = useCallback((v: T) => {
    setValue(v);
    localStorage.setItem(`jfswap-${key}`, JSON.stringify(v));
  }, [key]);
  return [value, set];
}

/* ------------------------------------------------------------------ */
/* Main Library page                                                   */
/* ------------------------------------------------------------------ */
export default function Library() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useStickyState("lib-search", "");
  const [typeFilter, setTypeFilter] = useStickyState("lib-type", "");
  const [statusFilter, setStatusFilter] = useStickyState("lib-status", "");
  const [sortBy, setSortBy] = useStickyState("lib-sort", "date_added");
  const [sortOrder, setSortOrder] = useStickyState("lib-order", "desc");
  const [visibleTypesArr, setVisibleTypesArr] = useStickyState<ImageType[]>("lib-visibleTypes", ["poster", "backdrop"]);
  const visibleTypes = new Set(visibleTypesArr);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [lightbox, setLightbox] = useState<{ item: LibraryItem; type: ImageType } | null>(null);
  const lastToggleIndex = useRef<number>(-1);

  const toggleVisibleType = (type: ImageType) => {
    const next = new Set(visibleTypes);
    if (next.has(type)) {
      if (next.size > 1) next.delete(type); // keep at least one
    } else {
      next.add(type);
    }
    setVisibleTypesArr(Array.from(next));
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getLibraryItems({
        search: search || undefined,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        sort: sortBy,
        order: sortOrder,
        limit: 200,
      });
      setItems(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    const timer = setTimeout(fetchItems, 300);
    return () => clearTimeout(timer);
  }, [fetchItems]);

  const syncLibrary = async () => {
    setSyncing(true);
    try {
      await api.syncLibrary();
      await fetchItems();
    } finally {
      setSyncing(false);
    }
  };

  const toggleItem = (index: number, e: React.MouseEvent) => {
    const id = items[index].id;
    if (e.shiftKey && lastToggleIndex.current >= 0) {
      const start = Math.min(lastToggleIndex.current, index);
      const end = Math.max(lastToggleIndex.current, index);
      setSelected((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) next.add(items[i].id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    }
    lastToggleIndex.current = index;
  };

  const selectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const startJob = async (mode: "instant" | "batch") => {
    if (selected.size === 0) return;
    setCreating(true);
    try {
      await api.createJob({
        item_ids: Array.from(selected),
        mode,
        image_type: visibleTypesArr.join(","),
      });
      setSelected(new Set());

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        await fetchItems();
        const jobs = await api.getJobs("running");
        if (jobs.length === 0) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          await fetchItems();
        }
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const posterOnly = visibleTypes.has("poster") && visibleTypes.size === 1;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="font-[Outfit] text-3xl font-semibold tracking-tight text-[var(--foreground)]">
            Library
          </h1>
          <p className="mt-0.5 text-sm text-[var(--foreground-muted)]">
            {total} items in your Jellyfin library
          </p>
        </div>
        <button
          onClick={selectAll}
          className={cn(
            "inline-flex items-center gap-2 rounded-[var(--radius-button)] px-4 py-2 text-sm font-medium transition-all duration-200",
            "glass hover:bg-[var(--color-glass-hover)] active:scale-[0.97]",
            selected.size === items.length && items.length > 0 ? "text-[var(--primary)]" : "text-[var(--foreground)]"
          )}
        >
          <CheckCheck className="h-4 w-4" />
          {selected.size === items.length && items.length > 0 ? "Deselect All" : "Select All"}
        </button>
        <button
          onClick={syncLibrary}
          disabled={syncing}
          className="inline-flex items-center gap-2 rounded-[var(--radius-button)] px-4 py-2 text-sm font-medium glass hover:bg-[var(--color-glass-hover)] active:scale-[0.97] disabled:opacity-50 transition-all duration-200"
        >
          <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
          Sync
        </button>
      </div>

      {/* Search + Filters */}
      <div className="glass flex flex-wrap items-center gap-3 rounded-[var(--radius-glass)] p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground-subtle)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search movies and shows..."
            className="w-full rounded-[var(--radius-button)] border border-[var(--input-border)] bg-[var(--input)] py-2 pl-9 pr-8 text-sm text-[var(--foreground)] outline-none transition-all placeholder:text-[var(--foreground-subtle)] focus:border-[var(--input-focus)] focus:ring-2 focus:ring-[var(--input-focus)]/20"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--foreground-subtle)] hover:text-[var(--foreground)] transition-colors"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-full border border-[var(--border)] bg-[var(--input)] px-2.5 py-1.5 text-xs font-medium text-[var(--foreground)] outline-none transition-all focus:border-[var(--input-focus)]"
          >
            <option value="name">Name</option>
            <option value="year">Year</option>
            <option value="date_added">Date Added</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--color-glass-hover)] transition-all"
            title={sortOrder === "asc" ? "Ascending" : "Descending"}
          >
            {sortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Type filter */}
        <div className="flex gap-1">
          {TYPE_FILTERS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTypeFilter(value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200",
                typeFilter === value
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "text-[var(--foreground-muted)] hover:bg-[var(--color-glass-hover)] hover:text-[var(--foreground)]"
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-[var(--border)]" />

        {/* Status filter */}
        <div className="flex gap-1">
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={cn(
                "rounded-full px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
                statusFilter === value
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-[var(--border)]" />

        {/* Image type multi-select */}
        <div className="flex gap-1 rounded-full border border-[var(--border)] p-0.5">
          {IMAGE_TYPES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => toggleVisibleType(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200",
                visibleTypes.has(key)
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Action bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className="glass-strong flex items-center gap-3 rounded-[var(--radius-glass)] px-4 py-3"
          >
            <span className="text-sm font-medium text-[var(--foreground)]">
              {selected.size} title{selected.size !== 1 ? "s" : ""} selected
            </span>
            <span className="text-xs text-[var(--foreground-muted)]">
              ({visibleTypesArr.join(" + ")} per title)
            </span>

            <div className="ml-auto flex gap-2">
              <button
                onClick={() => startJob("instant")}
                disabled={creating}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-accent-purple)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.97] glow-purple"
              >
                <Zap className="h-3.5 w-3.5" />
                Swap Now
              </button>
              <button
                onClick={() => startJob("batch")}
                disabled={creating}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-accent-cyan)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.97] glow-cyan"
              >
                <Clock className="h-3.5 w-3.5" />
                Batch (50% off)
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="rounded-[var(--radius-button)] px-3 py-2 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--foreground-muted)]" />
        </div>
      ) : items.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center rounded-[var(--radius-glass)] py-20">
          <Film className="mb-3 h-12 w-12 text-[var(--foreground-subtle)]" />
          <p className="text-[var(--foreground-muted)]">No items found</p>
          <p className="mt-1 text-sm text-[var(--foreground-subtle)]">
            Sync your library or adjust filters
          </p>
        </div>
      ) : (
        <motion.div
          layout
          className={cn(
            "grid gap-4",
            posterOnly
              ? "grid-cols-[repeat(auto-fill,minmax(150px,1fr))]"
              : "grid-cols-[repeat(auto-fill,minmax(300px,1fr))]"
          )}
        >
          <AnimatePresence mode="popLayout">
            {items.map((item, idx) => (
              <TitleCard
                key={item.id}
                item={item}
                visibleTypes={visibleTypes}
                selected={selected.has(item.id)}
                onToggle={(e) => toggleItem(idx, e)}
                onExpand={(type) => setLightbox({ item, type })}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <Lightbox
            item={lightbox.item}
            imageType={lightbox.type}
            onClose={() => setLightbox(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
