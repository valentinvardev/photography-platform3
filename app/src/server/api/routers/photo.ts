import path from "path";
import { z } from "zod";
import { getAdminClient, createSignedUrl } from "~/lib/supabase/admin";
import {
  createS3UploadUrl,
  deleteS3Objects,
  isS3Key,
  s3Key,
} from "~/lib/s3";
import { resolveMediaUrl } from "~/lib/media";
import { isVideoMimeType } from "~/lib/video-utils";
import {
  bibSimilarity,
  normalizeBib,
  MAX_SUGGESTED_BIBS,
  MAX_SUGGESTED_PHOTOS,
  type BibMatchLevel,
} from "~/lib/bib";
import { deleteFaces, rekognitionCollectionId } from "~/lib/rekognition";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";

const STORAGE_LIMIT_BYTES = 100 * 1024 * 1024 * 1024; // 100 GB

type SearchPhoto = {
  id: string;
  bibNumber: string | null;
  price: number | null;
  mimeType: string | null;
  filename: string;
  storageKey: string;
  previewKey: string | null;
};

/**
 * Saca de Rekognition las caras de estas fotos antes de borrarlas de la DB.
 * Sin esto, la cara queda guardada y facturándose por mes para siempre aunque
 * la foto ya no exista en ningún lado.
 */
async function removeIndexedFaces(photoIds: string[]): Promise<void> {
  if (photoIds.length === 0) return;
  const records = await db.faceRecord.findMany({
    where: { photoId: { in: photoIds } },
    select: { rekFaceId: true, collectionId: true },
  });
  if (records.length === 0) return;

  const byCollection = new Map<string, string[]>();
  for (const r of records) {
    const list = byCollection.get(r.collectionId) ?? [];
    list.push(r.rekFaceId);
    byCollection.set(r.collectionId, list);
  }
  for (const [collectionId, faceIds] of byCollection) {
    await deleteFaces(rekognitionCollectionId(collectionId), faceIds);
  }
}

type BibSearchResult = {
  /** Fotos del dorsal buscado. */
  exact: { bib: string; photos: SearchPhoto[] }[];
  /** Dorsales parecidos, por si el OCR leyó mal el número en la foto. */
  fuzzy: { bib: string; photos: SearchPhoto[]; level: BibMatchLevel }[];
};

const ACCEPTED_CONTENT_TYPES = z.string().refine(
  (t) => t.startsWith("image/") || t.startsWith("video/"),
  { message: "Solo se aceptan imágenes y videos" },
);

export const photoRouter = createTRPCRouter({
  // ─── Public ────────────────────────────────────────────────────────────────

  listAll: publicProcedure
    .input(z.object({ collectionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const photos = await ctx.db.photo.findMany({
        where: { collectionId: input.collectionId },
        orderBy: { order: "asc" },
        select: { id: true, bibNumber: true, price: true, mimeType: true, filename: true },
      });
      const norm = (p: (typeof photos)[number]) => ({
        ...p,
        price: p.price !== null ? p.price.toNumber() : null,
      });
      return [
        ...photos.filter((p) => !p.bibNumber).map(norm),
        ...photos.filter((p) => !!p.bibNumber).map(norm),
      ];
    }),

  searchByBib: publicProcedure
    .input(
      z.object({
        collectionId: z.string(),
        bib: z.string().min(1).max(12),
      }),
    )
    .query(async ({ ctx, input }): Promise<BibSearchResult> => {
      const q = normalizeBib(input.bib);

      const select = {
        id: true,
        bibNumber: true,
        price: true,
        mimeType: true,
        filename: true,
        storageKey: true,
        previewKey: true,
      } as const;

      const empty: BibSearchResult = { exact: [], fuzzy: [] };
      if (!q) return empty;

      // Los dorsales de la colección, una sola vez. Comparar acá (y no con un
      // `contains` en SQL) es lo que permite que #42 y #0042 sean el mismo
      // dorsal y que #104 no arrastre a #1042.
      const distinct = await ctx.db.photo.groupBy({
        by: ["bibNumber"],
        where: { collectionId: input.collectionId, bibNumber: { not: null } },
      });

      const exactBibs: string[] = [];
      const similar: { bib: string; level: BibMatchLevel }[] = [];
      for (const row of distinct) {
        const raw = row.bibNumber;
        if (!raw) continue;
        const n = normalizeBib(raw);
        if (!n) continue;
        if (n === q) {
          exactBibs.push(raw);
          continue;
        }
        const level = bibSimilarity(q, n);
        if (level !== null) similar.push({ bib: raw, level });
      }

      // Si ya encontramos el dorsal, sólo mostramos parecidos de confianza alta
      // o media. Sin coincidencia exacta abrimos la mano: ahí el parecido es la
      // única pista que le queda a la persona.
      const maxLevel = exactBibs.length > 0 ? 2 : 3;
      const similarBibs = similar
        .filter((s) => s.level <= maxLevel)
        .sort(
          (a, b) =>
            a.level - b.level ||
            a.bib.localeCompare(b.bib, "es", { numeric: true }),
        )
        .slice(0, MAX_SUGGESTED_BIBS);

      if (exactBibs.length === 0 && similarBibs.length === 0) return empty;

      const levelByBib = new Map(similarBibs.map((s) => [s.bib, s.level]));
      const rankByBib = new Map(similarBibs.map((s, i) => [s.bib, i]));

      const rows = await ctx.db.photo.findMany({
        where: {
          collectionId: input.collectionId,
          bibNumber: { in: [...exactBibs, ...similarBibs.map((s) => s.bib)] },
        },
        orderBy: { order: "asc" },
        select,
      });

      const exactSet = new Set(exactBibs);
      const exact = rows.filter((r) => r.bibNumber && exactSet.has(r.bibNumber));
      const fuzzy = rows
        .filter((r) => r.bibNumber && rankByBib.has(r.bibNumber))
        // sort estable: dentro de cada dorsal se mantiene el orden original
        .sort((a, b) => rankByBib.get(a.bibNumber!)! - rankByBib.get(b.bibNumber!)!)
        .slice(0, MAX_SUGGESTED_PHOTOS);

      const normPrice = (p: (typeof rows)[number]) => ({
        ...p,
        price: p.price !== null ? p.price.toNumber() : null,
      });

      const groupByBib = (photos: typeof rows) => {
        const map = new Map<string, typeof rows>();
        for (const p of photos) {
          const key = p.bibNumber ?? "?";
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(p);
        }
        return Array.from(map.entries()).map(([bib, photos]) => ({
          bib,
          photos: photos.map(normPrice),
        }));
      };

      return {
        exact: groupByBib(exact),
        fuzzy: groupByBib(fuzzy).map((g) => ({
          ...g,
          level: levelByBib.get(g.bib) ?? 3,
        })),
      };
    }),

  /** Returns signed preview URLs + mimeType for a list of photo IDs. */
  getPreviewUrls: publicProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      const photos = await ctx.db.photo.findMany({
        where: { id: { in: input.ids } },
        select: { id: true, storageKey: true, previewKey: true, mimeType: true, filename: true },
      });
      const results = await Promise.all(
        photos.map(async (p) => {
          const key = p.previewKey ?? p.storageKey;
          const ct = p.mimeType ?? (/\.(mp4|mov|webm|mkv|m4v)$/i.test(p.filename) ? "video/mp4" : undefined);
          const url = isS3Key(key)
            ? await resolveMediaUrl(key, { contentType: ct ?? undefined })
            : await createSignedUrl(key, 3600);
          return { id: p.id, url, mimeType: ct ?? p.mimeType, filename: p.filename };
        }),
      );
      return results.filter(
        (r): r is { id: string; url: string; mimeType: string | null; filename: string } =>
          r.url !== null,
      );
    }),

  // ─── Admin ─────────────────────────────────────────────────────────────────

  /** S3 presigned PUT URL — accepts both images and videos. */
  getS3UploadUrl: protectedProcedure
    .input(
      z.object({
        collectionId: z.string(),
        filename: z.string(),
        contentType: ACCEPTED_CONTENT_TYPES,
      }),
    )
    .mutation(async ({ input }) => {
      const ext = path.extname(input.filename).toLowerCase() || ".jpg";
      const key = s3Key(`uploads/${input.collectionId}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
      const url = await createS3UploadUrl(key, input.contentType);
      return { uploadUrl: url, key };
    }),

  /** Register uploaded files in DB and kick off background processing. */
  bulkAdd: protectedProcedure
    .input(
      z.object({
        collectionId: z.string(),
        photos: z.array(
          z.object({
            storageKey: z.string(),
            filename: z.string(),
            mimeType: z.string().optional(),
            bibNumber: z.string().optional(),
            fileSize: z.number().optional(),
            width: z.number().optional(),
            height: z.number().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const count = await ctx.db.photo.count({ where: { collectionId: input.collectionId } });
      const created = await Promise.all(
        input.photos.map((p, i) =>
          ctx.db.photo.create({
            data: {
              collectionId: input.collectionId,
              storageKey: p.storageKey,
              filename: p.filename,
              mimeType: p.mimeType ?? null,
              bibNumber: p.bibNumber ?? null,
              fileSize: p.fileSize,
              width: p.width,
              height: p.height,
              order: count + i,
            },
            select: { id: true, mimeType: true },
          }),
        ),
      );

      const ids = created.map((c) => ({ id: c.id, isVideo: isVideoMimeType(c.mimeType) }));

      void (async () => {
        const { processPhotoBatch } = await import("~/lib/photo-processing");
        await processPhotoBatch(ids, input.collectionId);
      })();

      return { ids: ids.map((x) => x.id) };
    }),

  getStorageUsage: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.db.photo.aggregate({ _sum: { fileSize: true } });
    return {
      usedBytes: Number(result._sum.fileSize ?? 0),
      limitBytes: STORAGE_LIMIT_BYTES,
    };
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const photo = await ctx.db.photo.findUniqueOrThrow({ where: { id: input.id } });

      const s3Keys: string[] = [];
      const supabaseKeys: string[] = [];
      for (const k of [photo.storageKey, photo.previewKey].filter(Boolean) as string[]) {
        if (isS3Key(k)) s3Keys.push(k);
        else if (!k.startsWith("http")) supabaseKeys.push(k);
      }

      if (s3Keys.length) await deleteS3Objects(s3Keys);
      if (supabaseKeys.length) {
        const client = getAdminClient();
        if (client) await client.storage.from("photos").remove(supabaseKeys);
      }

      await removeIndexedFaces([input.id]);

      return ctx.db.photo.delete({ where: { id: input.id } });
    }),

  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const photos = await ctx.db.photo.findMany({ where: { id: { in: input.ids } } });

      const s3Keys: string[] = [];
      const supabaseKeys: string[] = [];
      for (const p of photos) {
        for (const k of [p.storageKey, p.previewKey].filter(Boolean) as string[]) {
          if (isS3Key(k)) s3Keys.push(k);
          else if (!k.startsWith("http")) supabaseKeys.push(k);
        }
      }

      if (s3Keys.length) await deleteS3Objects(s3Keys);
      if (supabaseKeys.length) {
        const client = getAdminClient();
        if (client) await client.storage.from("photos").remove(supabaseKeys);
      }

      await removeIndexedFaces(input.ids);

      await ctx.db.photo.deleteMany({ where: { id: { in: input.ids } } });
    }),

  reprocessVideo: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const photo = await ctx.db.photo.findUnique({
        where: { id: input.id },
        select: { id: true, mimeType: true, filename: true },
      });
      if (!photo) throw new Error("Photo not found");
      const isVideo = photo.mimeType?.startsWith("video/") ?? /\.(mp4|mov|webm|mkv|m4v)$/i.test(photo.filename);
      if (!isVideo) throw new Error("Not a video");
      const { runVideoWatermark } = await import("~/lib/video-processing");
      const result = await runVideoWatermark(input.id);
      return { previewKey: result.previewKey };
    }),

  /**
   * Cuánto trabajo pendiente tiene una colección, por tipo.
   * Alimenta los botones de reprocesado: la idea es que se vea el número (y lo
   * que va a costar) ANTES de tocar el botón, no después.
   */
  pendingWork: protectedProcedure
    .input(z.object({ collectionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { collectionId } = input;
      const [total, ocr, faces, watermark] = await Promise.all([
        ctx.db.photo.count({ where: { collectionId } }),
        ctx.db.photo.count({ where: { collectionId, ocrAttemptedAt: null } }),
        ctx.db.photo.count({ where: { collectionId, faceRecords: { none: {} } } }),
        ctx.db.photo.count({ where: { collectionId, previewKey: null } }),
      ]);
      return { total, ocr, faces, watermark };
    }),

  listUnwatermarked: protectedProcedure
    .input(z.object({ collectionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const photos = await ctx.db.photo.findMany({
        where: { collectionId: input.collectionId, previewKey: null },
        select: { id: true },
        orderBy: { order: "asc" },
      });
      return photos.map((p) => p.id);
    }),

  setBibNumber: protectedProcedure
    .input(z.object({ id: z.string(), bibNumber: z.string().nullable() }))
    .mutation(({ ctx, input }) =>
      ctx.db.photo.update({ where: { id: input.id }, data: { bibNumber: input.bibNumber } }),
    ),

  setPrice: protectedProcedure
    .input(z.object({ id: z.string(), price: z.number().positive().nullable() }))
    .mutation(({ ctx, input }) =>
      ctx.db.photo.update({ where: { id: input.id }, data: { price: input.price } }),
    ),
});
