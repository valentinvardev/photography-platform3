"use client";

import { api } from "~/trpc/react";

export function UploadErrorLogs() {
  const { data: logs, refetch } = api.settings.getUploadLogs.useQuery();
  const clear = api.settings.clearUploadLogs.useMutation({ onSuccess: () => void refetch() });

  if (!logs || logs.length === 0) {
    return (
      <p className="font-sans font-semibold text-[13px] text-[color:var(--color-ink)]/40">
        Sin errores registrados.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="font-sans font-bold text-[12px] uppercase tracking-[0.12em] text-[color:var(--color-ink)]">
          {logs.length} entrada{logs.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={() => clear.mutate()}
          disabled={clear.isPending}
          className="font-sans font-bold text-[12px] uppercase tracking-[0.1em] text-[color:var(--color-safelight)] hover:underline underline-offset-4 disabled:opacity-40"
        >
          Limpiar todo
        </button>
      </div>

      <div className="border border-[color:var(--color-grey-300)] divide-y divide-[color:var(--color-grey-300)] max-h-96 overflow-y-auto">
        {logs.map((log, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <p className="font-sans font-bold text-[13px] text-[color:var(--color-ink)] truncate flex-1">
                {log.filename}
              </p>
              <p className="font-sans text-[11px] text-[color:var(--color-ink)]/40 shrink-0 tabular-nums">
                {new Date(log.ts).toLocaleString("es-AR", {
                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>
            <p className="mt-0.5 font-sans text-[12px] text-[color:var(--color-safelight)]">
              {log.error}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-[color:var(--color-ink)]/30">
              colección: {log.collectionId}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
