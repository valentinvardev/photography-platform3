import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { sendPurchaseApprovedEmail } from "~/lib/email";
import { getPurchasePhotoThumbs } from "~/lib/purchase-photos";

const LOG_KEY = "upload_error_logs";
const MAX_LOGS = 200;

type UploadErrorLog = {
  ts: string;
  filename: string;
  error: string;
  collectionId: string;
};

export const settingsRouter = createTRPCRouter({
  getMpStatus: protectedProcedure.query(async ({ ctx }) => {
    const setting = await ctx.db.setting.findUnique({
      where: { key: "mp_access_token" },
    });
    const userId = await ctx.db.setting.findUnique({
      where: { key: "mp_user_id" },
    });
    return {
      connected: !!setting?.value,
      userId: userId?.value ?? null,
    };
  }),

  disconnectMp: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.setting.deleteMany({
      where: { key: { in: ["mp_access_token", "mp_refresh_token", "mp_user_id"] } },
    });
    return { ok: true };
  }),

  resendPurchaseEmail: protectedProcedure
    .input(z.object({ purchaseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const purchase = await ctx.db.purchase.findUnique({
        where: { id: input.purchaseId },
        include: { collection: { select: { title: true } } },
      });
      if (!purchase || purchase.status !== "APPROVED" || !purchase.downloadToken) {
        throw new Error("Compra no aprobada o sin token");
      }
      const photoCount = await ctx.db.photo.count({
        where: { collectionId: purchase.collectionId, bibNumber: purchase.bibNumber ?? undefined },
      });
      const photoThumbs = await getPurchasePhotoThumbs(purchase.id, 6);
      await sendPurchaseApprovedEmail({
        to: purchase.buyerEmail,
        buyerName: purchase.buyerName,
        bibNumber: purchase.bibNumber,
        collectionTitle: purchase.collection.title,
        downloadToken: purchase.downloadToken,
        photoCount,
        photoThumbs,
      });
      return { ok: true };
    }),

  logUploadError: protectedProcedure
    .input(z.object({ filename: z.string(), error: z.string(), collectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.setting.findUnique({ where: { key: LOG_KEY } });
      const logs: UploadErrorLog[] = existing?.value ? (JSON.parse(existing.value) as UploadErrorLog[]) : [];
      const entry: UploadErrorLog = { ts: new Date().toISOString(), ...input };
      const updated = [entry, ...logs].slice(0, MAX_LOGS);
      await ctx.db.setting.upsert({
        where: { key: LOG_KEY },
        update: { value: JSON.stringify(updated) },
        create: { key: LOG_KEY, value: JSON.stringify(updated) },
      });
      return { ok: true };
    }),

  getUploadLogs: protectedProcedure.query(async ({ ctx }) => {
    const setting = await ctx.db.setting.findUnique({ where: { key: LOG_KEY } });
    if (!setting?.value) return [];
    return JSON.parse(setting.value) as UploadErrorLog[];
  }),

  clearUploadLogs: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.setting.deleteMany({ where: { key: LOG_KEY } });
    return { ok: true };
  }),
});
