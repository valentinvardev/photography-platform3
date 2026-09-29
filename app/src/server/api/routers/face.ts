import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { bibsDe } from "~/lib/bib";

export const faceRouter = createTRPCRouter({
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [totalFaces, byCollection] = await Promise.all([
      ctx.db.faceRecord.count(),
      ctx.db.faceRecord.groupBy({ by: ["collectionId"], _count: { id: true } }),
    ]);
    return { totalFaces, totalCollections: byCollection.length };
  }),

  list: protectedProcedure
    .input(z.object({
      collectionId: z.string().optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(60),
    }))
    .query(async ({ ctx, input }) => {
      const { collectionId, page, limit } = input;
      const where = collectionId ? { collectionId } : {};

      const [records, total] = await Promise.all([
        ctx.db.faceRecord.findMany({
          where,
          include: {
            photo: { select: { id: true, bibNumber: true, previewKey: true } },
            collection: { select: { id: true, title: true, slug: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        ctx.db.faceRecord.count({ where }),
      ]);

      // Una compra guarda el dorsal de UNA persona y la foto puede tener
      // varios: se busca por cada uno de los dorsales de la foto.
      const orConditions = records.flatMap((r) =>
        bibsDe(r.photo.bibNumber).map((bibNumber) => ({ collectionId: r.collectionId, bibNumber })),
      );

      const purchases = orConditions.length > 0
        ? await ctx.db.purchase.findMany({
            where: { OR: orConditions, status: "APPROVED" },
            select: {
              collectionId: true,
              bibNumber: true,
              buyerEmail: true,
              buyerName: true,
              amountPaid: true,
              createdAt: true,
            },
          })
        : [];

      const purchaseMap = new Map(
        purchases.map((p) => [`${p.collectionId}|${p.bibNumber}`, p]),
      );

      return {
        items: records.map((r) => ({
          id: r.id,
          rekFaceId: r.rekFaceId,
          confidence: r.confidence,
          createdAt: r.createdAt,
          photo: r.photo,
          collection: r.collection,
          purchase:
            bibsDe(r.photo.bibNumber)
              .map((b) => purchaseMap.get(`${r.collectionId}|${b}`))
              .find((p) => p !== undefined) ?? null,
        })),
        total,
      };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.faceRecord.delete({ where: { id: input.id } });
    }),
});
