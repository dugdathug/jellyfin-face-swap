import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  User,
  Users,
  ImagePlus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import type { Face } from "@/lib/types";

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const pop = {
  hidden: { opacity: 0, scale: 0.85 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
  exit: { opacity: 0, scale: 0.85, transition: { duration: 0.2 } },
};

function FaceCard({
  face,
  onDelete,
}: {
  face: Face;
  onDelete: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [hover, setHover] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(true);
    try {
      await api.deleteFace(face.id);
      onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      variants={pop}
      layout
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      className="group relative"
    >
      <div className="glass relative aspect-square overflow-hidden rounded-[var(--radius-glass)] transition-shadow duration-300 hover:shadow-xl">
        <img
          src={api.faceImageUrl(face.id)}
          alt={face.filename}
          className="h-full w-full object-cover"
        />

        {/* Hover overlay */}
        <AnimatePresence>
          {hover && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent p-3"
            >
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/80 text-white backdrop-blur-sm transition-all hover:bg-red-500 active:scale-90"
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gender badge */}
        <div
          className={cn(
            "absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-md",
            face.gender === "male"
              ? "bg-[var(--color-accent-cyan)]/20 text-[var(--color-accent-cyan)]"
              : "bg-[var(--color-accent-pink)]/20 text-[var(--color-accent-pink)]"
          )}
        >
          <User className="h-2.5 w-2.5" />
          {face.gender}
        </div>
      </div>

      {/* Info below card */}
      <div className="mt-2 px-0.5">
        <p className="truncate text-xs font-medium text-[var(--foreground)]">
          {face.filename}
        </p>
        <p className="text-[10px] text-[var(--foreground-subtle)]">
          Used {face.usage_count} times
        </p>
      </div>
    </motion.div>
  );
}

function DropZone({ onUpload }: { onUpload: (file: File, gender: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const [gender, setGender] = useState<"male" | "female">("male");

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith("image/")) {
        onUpload(file, gender);
      }
    },
    [gender, onUpload]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file, gender);
    e.target.value = "";
  };

  return (
    <div className="space-y-3">
      {/* Gender toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--foreground-muted)]">Upload as:</span>
        <div className="flex rounded-full border border-[var(--border)] p-0.5">
          {(["male", "female"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGender(g)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium capitalize transition-all duration-200",
                gender === g
                  ? g === "male"
                    ? "bg-[var(--color-accent-cyan)] text-white"
                    : "bg-[var(--color-accent-pink)] text-white"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-glass)] border-2 border-dashed p-10 transition-all duration-300",
          dragging
            ? "border-[var(--primary)] bg-[var(--primary)]/5 scale-[1.01]"
            : "border-[var(--border)] hover:border-[var(--foreground-subtle)] hover:bg-[var(--color-glass-hover)]"
        )}
      >
        <input
          type="file"
          accept="image/*"
          onChange={handleFileInput}
          className="hidden"
        />
        <motion.div
          animate={dragging ? { scale: 1.1, y: -4 } : { scale: 1, y: 0 }}
          className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)]/10"
        >
          <ImagePlus className="h-6 w-6 text-[var(--primary)]" />
        </motion.div>
        <p className="text-sm font-medium text-[var(--foreground)]">
          Drop a face image here
        </p>
        <p className="mt-1 text-xs text-[var(--foreground-muted)]">
          or click to browse — JPG, PNG, WebP
        </p>
      </label>
    </div>
  );
}

export default function Faces() {
  const [faces, setFaces] = useState<Face[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fetchFaces = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getFaces();
      setFaces(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFaces();
  }, [fetchFaces]);

  const handleUpload = async (file: File, gender: string) => {
    setUploading(true);
    try {
      await api.uploadFace(file, gender);
      await fetchFaces();
    } finally {
      setUploading(false);
    }
  };

  const maleCount = faces.filter((f) => f.gender === "male").length;
  const femaleCount = faces.filter((f) => f.gender === "female").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-[Outfit] text-3xl font-semibold tracking-tight text-[var(--foreground)]">
          Faces
        </h1>
        <p className="mt-0.5 text-sm text-[var(--foreground-muted)]">
          Replacement faces for your movie posters
        </p>
      </div>

      {/* Stats + Upload — Bento grid */}
      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        {/* Stats tiles */}
        <div className="grid gap-3">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass flex items-center gap-3 rounded-[var(--radius-glass)] p-4"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-card)] bg-[var(--color-accent-cyan)]/10">
              <User className="h-5 w-5 text-[var(--color-accent-cyan)]" />
            </div>
            <div>
              <p className="text-2xl font-semibold font-[Outfit] text-[var(--foreground)]">
                {maleCount}
              </p>
              <p className="text-xs text-[var(--foreground-muted)]">Male faces</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass flex items-center gap-3 rounded-[var(--radius-glass)] p-4"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-card)] bg-[var(--color-accent-pink)]/10">
              <User className="h-5 w-5 text-[var(--color-accent-pink)]" />
            </div>
            <div>
              <p className="text-2xl font-semibold font-[Outfit] text-[var(--foreground)]">
                {femaleCount}
              </p>
              <p className="text-xs text-[var(--foreground-muted)]">Female faces</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass flex items-center gap-3 rounded-[var(--radius-glass)] p-4"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-card)] bg-[var(--color-accent-purple)]/10">
              <Users className="h-5 w-5 text-[var(--color-accent-purple)]" />
            </div>
            <div>
              <p className="text-2xl font-semibold font-[Outfit] text-[var(--foreground)]">
                {faces.reduce((sum, f) => sum + f.usage_count, 0)}
              </p>
              <p className="text-xs text-[var(--foreground-muted)]">Total swaps</p>
            </div>
          </motion.div>
        </div>

        {/* Upload zone */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass rounded-[var(--radius-glass)] p-5"
        >
          <h2 className="mb-3 font-[Outfit] text-base font-semibold text-[var(--foreground)]">
            Add New Face
          </h2>
          <DropZone onUpload={handleUpload} />
          {uploading && (
            <div className="mt-3 flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading...
            </div>
          )}
        </motion.div>
      </div>

      {/* Face gallery */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--foreground-muted)]" />
        </div>
      ) : faces.length === 0 ? (
        <div className="glass flex flex-col items-center rounded-[var(--radius-glass)] py-12">
          <Users className="mb-2 h-10 w-10 text-[var(--foreground-subtle)]" />
          <p className="text-sm text-[var(--foreground-muted)]">
            No faces yet — upload some above
          </p>
        </div>
      ) : (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-4"
        >
          <AnimatePresence mode="popLayout">
            {faces.map((face) => (
              <FaceCard key={face.id} face={face} onDelete={fetchFaces} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
