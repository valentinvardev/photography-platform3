"use client";

import { useRef, useState } from "react";

const UPLOAD_CONCURRENCY = 10;

type Entry = {
  id: string;
  filename: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

export function TestUploader({ slug }: { slug: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const update = (id: string, patch: Partial<Entry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const handleFiles = async (files: FileList) => {
    if (!files.length) return;
    setIsUploading(true);

    const fileList = Array.from(files);
    const newEntries: (Entry & { file: File })[] = fileList.map((file, i) => ({
      id: `${Date.now()}-${i}`,
      filename: file.name,
      status: "pending",
      file,
    }));
    setEntries((prev) => [...newEntries.map(({ file: _f, ...e }) => e), ...prev]);

    console.log(`[TEST UPLOAD] iniciando subida de ${newEntries.length} archivos`);

    type UploadResult = { storageKey: string; filename: string; mimeType: string; fileSize: number; collectionId: string };

    const uploadOne = async (entry: typeof newEntries[number]): Promise<UploadResult | null> => {
      update(entry.id, { status: "uploading" });
      console.log(`[TEST UPLOAD] subiendo: ${entry.filename}`);
      try {
        const contentType = entry.file.type || "image/jpeg";
        const signRes = await fetch("/api/test-upload/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, filename: entry.filename, contentType }),
        });
        if (!signRes.ok) {
          const { error } = await signRes.json() as { error?: string };
          const msg = error ?? `HTTP ${signRes.status}`;
          update(entry.id, { status: "error", error: msg });
          console.error(`[TEST UPLOAD] sign falló: ${entry.filename} — ${msg}`);
          return null;
        }
        const { uploadUrl, key, collectionId } = await signRes.json() as { uploadUrl: string; key: string; collectionId: string };

        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: entry.file,
        });
        if (!putRes.ok) {
          const msg = putRes.statusText || `HTTP ${putRes.status}`;
          update(entry.id, { status: "error", error: msg });
          console.error(`[TEST UPLOAD] PUT falló: ${entry.filename} — ${msg}`);
          return null;
        }
        update(entry.id, { status: "done" });
        console.log(`[TEST UPLOAD] OK: ${entry.filename}`);
        return { storageKey: key, filename: entry.filename, mimeType: contentType, fileSize: entry.file.size, collectionId };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error de red";
        update(entry.id, { status: "error", error: msg });
        console.error(`[TEST UPLOAD] excepción: ${entry.filename} — ${msg}`);
        return null;
      }
    };

    let collectionId: string | null = null;
    for (let i = 0; i < newEntries.length; i += UPLOAD_CONCURRENCY) {
      const chunk = newEntries.slice(i, i + UPLOAD_CONCURRENCY);
      const results = await Promise.all(chunk.map(uploadOne));
      const ok = results.filter((r): r is UploadResult => r !== null);
      if (ok.length === 0) continue;
      collectionId = collectionId ?? ok[0]!.collectionId;

      try {
        await fetch("/api/test-upload/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collectionId,
            photos: ok.map(({ storageKey, filename, mimeType, fileSize }) => ({ storageKey, filename, mimeType, fileSize })),
          }),
        });
        console.log(`[TEST UPLOAD] registradas en DB: ${ok.length} fotos`);
      } catch (err) {
        console.error(`[TEST UPLOAD] register falló:`, err);
      }
    }

    setIsUploading(false);
    console.log(`[TEST UPLOAD] terminado`);
  };

  const done = entries.filter((e) => e.status === "done").length;
  const errors = entries.filter((e) => e.status === "error").length;

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-[#FFE600] p-12 text-center cursor-pointer hover:bg-[#FFE600]/5 transition-colors"
      >
        <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-[#FFE600]">
          {isUploading ? "Subiendo…" : "Hacé click o arrastrá fotos"}
        </p>
        <p className="font-mono text-[10px] text-white/40 mt-2">
          Abrí la consola del navegador (F12) para ver el log
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); }}
      />

      {entries.length > 0 && (
        <div className="mt-6">
          <p className="font-mono text-[11px] text-white/60 mb-3">
            {done} ok · {errors} errores · {entries.length} total
          </p>
          <div className="border border-white/10 max-h-96 overflow-y-auto">
            {entries.map((e) => (
              <div key={e.id} className="px-4 py-2 border-b border-white/5 flex justify-between items-center text-[12px]">
                <span className="font-mono text-white/80 truncate flex-1">{e.filename}</span>
                <span className={`font-mono text-[10px] uppercase tracking-[0.1em] ml-3 ${
                  e.status === "done" ? "text-[#16a34a]" :
                  e.status === "error" ? "text-red-400" :
                  e.status === "uploading" ? "text-[#FFE600]" : "text-white/40"
                }`}>
                  {e.status === "error" ? `✗ ${e.error}` : e.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
