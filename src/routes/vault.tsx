import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  Upload,
  FolderPlus,
  Folder,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  File as FileIcon,
  Search,
  Trash2,
  Pencil,
  Download,
  LogOut,
  ChevronRight,
  HardDrive,
  Home,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatBytes, STORAGE_LIMIT_BYTES } from "@/lib/format";

export const Route = createFileRoute("/vault")({
  head: () => ({
    meta: [
      { title: "My Vault — VaultX" },
      { name: "description", content: "Your encrypted personal cloud storage." },
    ],
  }),
  component: VaultPage,
});

type FolderRow = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
};
type FileRow = {
  id: string;
  user_id: string;
  folder_id: string | null;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
};

function VaultPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [previewFile, setPreviewFile] = useState<FileRow | null>(null);
  const [renameTarget, setRenameTarget] = useState<
    | { kind: "file"; row: FileRow }
    | { kind: "folder"; row: FolderRow }
    | null
  >(null);
  const [renameValue, setRenameValue] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploads, setUploads] = useState<
    Record<string, { name: string; progress: number }>
  >({});
  const dragRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const foldersQ = useQuery({
    enabled: !!user,
    queryKey: ["folders", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("folders")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as FolderRow[];
    },
  });

  const filesQ = useQuery({
    enabled: !!user,
    queryKey: ["files", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("files")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as FileRow[];
    },
  });

  const allFolders = foldersQ.data ?? [];
  const allFiles = filesQ.data ?? [];

  const used = useMemo(
    () => allFiles.reduce((a, f) => a + Number(f.size_bytes || 0), 0),
    [allFiles],
  );
  const usedPct = Math.min(100, (used / STORAGE_LIMIT_BYTES) * 100);

  const breadcrumbs = useMemo(() => {
    const trail: FolderRow[] = [];
    let cur = allFolders.find((f) => f.id === folderId) || null;
    while (cur) {
      trail.unshift(cur);
      cur = allFolders.find((f) => f.id === cur!.parent_id) || null;
    }
    return trail;
  }, [folderId, allFolders]);

  const visibleFolders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return allFolders.filter((f) => f.name.toLowerCase().includes(q));
    return allFolders.filter((f) => f.parent_id === folderId);
  }, [allFolders, folderId, search]);

  const visibleFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return allFiles.filter((f) => f.name.toLowerCase().includes(q));
    return allFiles.filter((f) => f.folder_id === folderId);
  }, [allFiles, folderId, search]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["files", user?.id] });
    qc.invalidateQueries({ queryKey: ["folders", user?.id] });
  };

  const uploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      if (!user) return;
      const files = Array.from(fileList);
      const totalNew = files.reduce((a, f) => a + f.size, 0);
      if (used + totalNew > STORAGE_LIMIT_BYTES) {
        toast.error("Upload would exceed your 1 TB quota");
        return;
      }
      for (const file of files) {
        const uid = `${Date.now()}-${file.name}`;
        setUploads((u) => ({ ...u, [uid]: { name: file.name, progress: 0 } }));
        const safe = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${user.id}/${crypto.randomUUID()}-${safe}`;
        // Fake progress (supabase-js v2 doesn't expose upload progress for File)
        const tick = setInterval(() => {
          setUploads((u) =>
            u[uid]
              ? {
                  ...u,
                  [uid]: { ...u[uid], progress: Math.min(90, u[uid].progress + 8) },
                }
              : u,
          );
        }, 250);
        const { error: upErr } = await supabase.storage
          .from("vault")
          .upload(path, file, { contentType: file.type || undefined });
        clearInterval(tick);
        if (upErr) {
          toast.error(`${file.name}: ${upErr.message}`);
          setUploads((u) => {
            const c = { ...u };
            delete c[uid];
            return c;
          });
          continue;
        }
        const { error: dbErr } = await supabase.from("files").insert({
          user_id: user.id,
          folder_id: folderId,
          name: file.name,
          storage_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
        if (dbErr) {
          toast.error(`${file.name}: ${dbErr.message}`);
          await supabase.storage.from("vault").remove([path]);
        } else {
          setUploads((u) => ({
            ...u,
            [uid]: { ...u[uid], progress: 100 },
          }));
          setTimeout(() => {
            setUploads((u) => {
              const c = { ...u };
              delete c[uid];
              return c;
            });
          }, 800);
        }
      }
      refresh();
    },
    [user, folderId, used],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  };

  const createFolder = async () => {
    if (!user || !newFolderName.trim()) return;
    const { error } = await supabase.from("folders").insert({
      user_id: user.id,
      parent_id: folderId,
      name: newFolderName.trim().slice(0, 80),
    });
    if (error) return toast.error(error.message);
    setNewFolderName("");
    setNewFolderOpen(false);
    refresh();
  };

  const downloadFile = async (row: FileRow) => {
    const { data, error } = await supabase.storage
      .from("vault")
      .createSignedUrl(row.storage_path, 60, { download: row.name });
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  const openPreview = async (row: FileRow) => {
    setPreviewFile(row);
  };

  const deleteFile = async (row: FileRow) => {
    if (!confirm(`Delete "${row.name}"?`)) return;
    await supabase.storage.from("vault").remove([row.storage_path]);
    await supabase.from("files").delete().eq("id", row.id);
    refresh();
  };

  const deleteFolder = async (row: FolderRow) => {
    if (
      !confirm(
        `Delete folder "${row.name}"? Files inside will be moved to root.`,
      )
    )
      return;
    await supabase.from("folders").delete().eq("id", row.id);
    refresh();
  };

  const applyRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    const name = renameValue.trim().slice(0, 200);
    if (renameTarget.kind === "file") {
      await supabase.from("files").update({ name }).eq("id", renameTarget.row.id);
    } else {
      await supabase
        .from("folders")
        .update({ name })
        .eq("id", renameTarget.row.id);
    }
    setRenameTarget(null);
    refresh();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  const initials =
    user.email?.slice(0, 2).toUpperCase() || "U";

  return (
    <div className="flex min-h-screen bg-secondary/30">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Shield className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">VaultX</span>
        </div>
        <div className="p-4">
          <Button
            className="w-full justify-start gap-2"
            onClick={() => setNewFolderOpen(true)}
          >
            <FolderPlus className="h-4 w-4" />
            New folder
          </Button>
        </div>
        <nav className="px-2">
          <SideItem
            active={folderId === null}
            onClick={() => setFolderId(null)}
            icon={<Home className="h-4 w-4" />}
            label="My Vault"
          />
          <SideItem
            icon={<HardDrive className="h-4 w-4" />}
            label="Storage"
          />
        </nav>
        <div className="mt-auto border-t p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Storage</span>
            <span>{usedPct.toFixed(1)}%</span>
          </div>
          <Progress value={usedPct} className="h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            {formatBytes(used)} of 1 TB used
          </p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center gap-3 border-b bg-card px-4 py-3 md:px-6">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search in your vault"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {user.email}
              </div>
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Breadcrumb + actions */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-4 md:px-6">
          <nav className="flex items-center gap-1 text-sm">
            <button
              className="font-medium hover:underline"
              onClick={() => setFolderId(null)}
            >
              My Vault
            </button>
            {breadcrumbs.map((b) => (
              <span key={b.id} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                <button
                  className="hover:underline"
                  onClick={() => setFolderId(b.id)}
                >
                  {b.name}
                </button>
              </span>
            ))}
          </nav>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNewFolderOpen(true)}
            >
              <FolderPlus className="mr-2 h-4 w-4" /> New folder
            </Button>
            <label>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button size="sm" asChild>
                <span className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" /> Upload
                </span>
              </Button>
            </label>
          </div>
        </div>

        {/* Uploads in-progress */}
        {Object.keys(uploads).length > 0 && (
          <div className="mx-4 mb-4 space-y-2 rounded-lg border bg-card p-3 md:mx-6">
            {Object.entries(uploads).map(([k, u]) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="truncate">{u.name}</span>
                  <span className="text-muted-foreground">{u.progress}%</span>
                </div>
                <Progress value={u.progress} className="h-1.5" />
              </div>
            ))}
          </div>
        )}

        {/* Drag/drop zone + grid */}
        <div
          ref={dragRef}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`relative mx-4 mb-6 flex-1 rounded-xl border-2 border-dashed p-4 transition md:mx-6 ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-transparent"
          }`}
        >
          {visibleFolders.length === 0 && visibleFiles.length === 0 ? (
            <div className="flex h-full min-h-[40vh] flex-col items-center justify-center text-center">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="mt-3 font-medium">Drop files here to upload</p>
              <p className="text-sm text-muted-foreground">
                or use the Upload button
              </p>
            </div>
          ) : (
            <>
              {visibleFolders.length > 0 && (
                <>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                    Folders
                  </h3>
                  <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {visibleFolders.map((f) => (
                      <FolderCard
                        key={f.id}
                        folder={f}
                        onOpen={() => {
                          setSearch("");
                          setFolderId(f.id);
                        }}
                        onRename={() => {
                          setRenameTarget({ kind: "folder", row: f });
                          setRenameValue(f.name);
                        }}
                        onDelete={() => deleteFolder(f)}
                      />
                    ))}
                  </div>
                </>
              )}
              {visibleFiles.length > 0 && (
                <>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                    Files
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {visibleFiles.map((f) => (
                      <FileCard
                        key={f.id}
                        file={f}
                        onOpen={() => openPreview(f)}
                        onDownload={() => downloadFile(f)}
                        onRename={() => {
                          setRenameTarget({ kind: "file", row: f });
                          setRenameValue(f.name);
                        }}
                        onDelete={() => deleteFile(f)}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>

      {/* New folder dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createFolder()}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createFolder}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog
        open={!!renameTarget}
        onOpenChange={(o) => !o && setRenameTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyRename()}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={applyRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <FilePreviewDialog
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onDownload={(f) => downloadFile(f)}
      />
    </div>
  );
}

function SideItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
        active
          ? "bg-secondary font-medium text-foreground"
          : "text-muted-foreground hover:bg-secondary/60"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function FolderCard({
  folder,
  onOpen,
  onRename,
  onDelete,
}: {
  folder: FolderRow;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative rounded-xl border bg-card p-4 transition hover:shadow-sm">
      <button onClick={onOpen} className="flex w-full items-start gap-3 text-left">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-primary">
          <Folder className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{folder.name}</p>
          <p className="text-xs text-muted-foreground">Folder</p>
        </div>
      </button>
      <CardMenu onRename={onRename} onDelete={onDelete} />
    </div>
  );
}

function FileCard({
  file,
  onOpen,
  onDownload,
  onRename,
  onDelete,
}: {
  file: FileRow;
  onOpen: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const Icon = iconFor(file.mime_type);
  return (
    <div className="group relative rounded-xl border bg-card p-4 transition hover:shadow-sm">
      <button onClick={onOpen} className="flex w-full items-start gap-3 text-left">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(file.size_bytes)}
          </p>
        </div>
      </button>
      <CardMenu
        onRename={onRename}
        onDelete={onDelete}
        extra={
          <DropdownMenuItem onClick={onDownload}>
            <Download className="mr-2 h-4 w-4" /> Download
          </DropdownMenuItem>
        }
      />
    </div>
  );
}

function CardMenu({
  onRename,
  onDelete,
  extra,
}: {
  onRename: () => void;
  onDelete: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {extra}
          <DropdownMenuItem onClick={onRename}>
            <Pencil className="mr-2 h-4 w-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function iconFor(mime: string | null) {
  if (!mime) return FileIcon;
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.startsWith("video/")) return Film;
  if (mime.startsWith("audio/")) return Music;
  if (mime === "application/pdf" || mime.startsWith("text/")) return FileText;
  return FileIcon;
}

function FilePreviewDialog({
  file,
  onClose,
  onDownload,
}: {
  file: FileRow | null;
  onClose: () => void;
  onDownload: (f: FileRow) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!file) return;
    supabase.storage
      .from("vault")
      .createSignedUrl(file.storage_path, 300)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  if (!file) return null;
  const mime = file.mime_type || "";

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{file.name}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-[300px] items-center justify-center rounded-lg bg-secondary/50 p-2">
          {!url ? (
            <p className="text-sm text-muted-foreground">Loading preview…</p>
          ) : mime.startsWith("image/") ? (
            <img
              src={url}
              alt={file.name}
              className="max-h-[60vh] rounded object-contain"
            />
          ) : mime.startsWith("video/") ? (
            <video src={url} controls className="max-h-[60vh] w-full rounded" />
          ) : mime.startsWith("audio/") ? (
            <audio src={url} controls className="w-full" />
          ) : mime === "application/pdf" ? (
            <iframe src={url} className="h-[60vh] w-full rounded" />
          ) : (
            <div className="text-center text-sm text-muted-foreground">
              No inline preview for this file type.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => onDownload(file)}>
            <Download className="mr-2 h-4 w-4" /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
