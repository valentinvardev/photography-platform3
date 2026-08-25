import { MercadoPagoConfig, Preference } from "mercadopago";
import { z } from "zod";
import { env } from "~/env";
import { sendPurchaseApprovedEmail } from "~/lib/email";
import { createSignedUrl } from "~/lib/supabase/admin";
import { createS3DownloadUrl, isS3Key } from "~/lib/s3";
import { getPurchasePhotoThumbs } from "~/lib/purchase-photos";
import {
  parseTiers,
  parseDiscountCodes,
  applyDiscountCode,
  calcularTotal,
  calcularPack,
  claveDePersona,
  agruparPorPersona,
} from "~/lib/pricing";
import { normalizeBib } from "~/lib/bib";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { db as dbInstance } from "~/server/db";

const getMp = async (db: typeof dbInstance) => {
  const setting = await db.setting.findUnique({ where: { key: "mp_access_token" } });
  const token = setting?.value ?? env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MercadoPago no está conectado. Configuralo en /admin/configuracion.");
  return new MercadoPagoConfig({ accessToken: token });
};

export const purchaseRouter = createTRPCRouter({
  // ─── Public ────────────────────────────────────────────────────────────────

  checkStatus: publicProcedure
    .input(z.object({ purchaseId: z.string() }))
    .query(async ({ ctx, input }) => {
      const purchase = await ctx.db.purchase.findUnique({
        where: { id: input.purchaseId },
        select: { status: true, downloadToken: true },
      });
      if (!purchase) return null;
      return {
        status: purchase.status,
        downloadToken: purchase.status === "APPROVED" ? purchase.downloadToken : null,
      };
    }),

  createPreference: publicProcedure
    .input(
      z.object({
        collectionId: z.string(),
        photoIds: z.array(z.string()).min(1),
        buyerEmail: z.string().email(),
        buyerName: z.string().optional(),
        buyerLastName: z.string().optional(),
        buyerPhone: z.string().optional(),
        packMode: z.boolean().optional(),
        discountCode: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.db.collection.findFirstOrThrow({
        where: { id: input.collectionId, isPublished: true },
        select: { title: true, slug: true, pricePerBib: true, packPrice: true, discountTiers: true, discountCodes: true },
      });

      const photos = await ctx.db.photo.findMany({
        where: { collectionId: input.collectionId, id: { in: input.photoIds } },
        select: { id: true, price: true, bibNumber: true },
      });
      if (photos.length === 0) throw new Error("No se encontraron fotos válidas para comprar.");

      // El alcance de la compra lo decide el servidor, no el cliente: las fotos
      // elegidas más todas las del mismo dorsal. De ahí sale qué incluye el pack
      // y cuántas fotos cuentan para el descuento por cantidad. Si viniera del
      // cliente se podría pagar el pack por la colección entera o forzar el
      // tramo más barato.
      const bibs = [...new Set(photos.map((p) => p.bibNumber).filter((b): b is string => !!b))];
      const normalizedBibs = new Set(bibs.map(normalizeBib).filter((b) => b !== ""));

      // El mismo dorsal puede estar escrito de varias formas ("42", "0042"),
      // así que juntamos todas las variantes antes de armar el alcance.
      const bibVariants = normalizedBibs.size > 0
        ? (await ctx.db.photo.groupBy({
            by: ["bibNumber"],
            where: { collectionId: input.collectionId, bibNumber: { not: null } },
          }))
            .map((r) => r.bibNumber)
            .filter((b): b is string => !!b && normalizedBibs.has(normalizeBib(b)))
        : [];

      const sameBibPhotos = bibVariants.length > 0
        ? await ctx.db.photo.findMany({
            where: { collectionId: input.collectionId, bibNumber: { in: bibVariants } },
            select: { id: true, price: true, bibNumber: true },
          })
        : [];

      type ScopePhoto = { id: string; price: number | null; bibNumber: string | null };
      const scope = new Map<string, ScopePhoto>();
      for (const p of [...photos, ...sameBibPhotos]) {
        scope.set(p.id, {
          id: p.id,
          price: p.price !== null ? Number(p.price) : null,
          bibNumber: p.bibNumber,
        });
      }

      // Cuántas fotos hay de cada persona. Es lo que decide el tramo de
      // descuento, y va por persona y no sobre el total del carrito: la
      // promoción es "llevá más fotos tuyas", no juntar fotos de gente
      // distinta hasta llegar a la cantidad.
      const fotosPorPersona = new Map<string, number>();
      for (const p of scope.values()) {
        const clave = claveDePersona(p.bibNumber);
        fotosPorPersona.set(clave, (fotosPorPersona.get(clave) ?? 0) + 1);
      }

      /** Las personas que la compra realmente involucra. */
      const personas = agruparPorPersona([...photos]).size;

      const packActive =
        input.packMode === true &&
        collection.packPrice !== null &&
        collection.packPrice !== undefined;
      const purchasedPhotos = packActive
        ? [...scope.values()]
        : photos.map((p) => ({
            id: p.id,
            price: p.price !== null ? Number(p.price) : null,
            bibNumber: p.bibNumber,
          }));

      let totalAmount: number;

      if (packActive) {
        // El pack es "todas las fotos de tu dorsal": dos dorsales son dos packs.
        totalAmount = calcularPack(Number(collection.packPrice), personas);
      } else {
        totalAmount = calcularTotal(
          purchasedPhotos,
          fotosPorPersona,
          Number(collection.pricePerBib),
          parseTiers(collection.discountTiers),
        );
      }

      // Apply discount code if provided
      if (input.discountCode) {
        const codes = parseDiscountCodes(collection.discountCodes);
        const result = applyDiscountCode(totalAmount, input.discountCode, codes);
        totalAmount = result.amount;
      }

      const purchase = await ctx.db.purchase.create({
        data: {
          collectionId: input.collectionId,
          // Guardamos el dorsal cuando la compra es de uno solo: es lo que usa
          // "ya compré, acceder con email" para encontrar la descarga.
          bibNumber: normalizedBibs.size === 1 ? bibs[0]! : null,
          buyerEmail: input.buyerEmail,
          buyerName: input.buyerName,
          buyerLastName: input.buyerLastName,
          buyerPhone: input.buyerPhone,
          amountPaid: totalAmount,
          photoIds: JSON.stringify(purchasedPhotos.map((p) => p.id)),
        },
      });

      const preference = await new Preference(await getMp(ctx.db)).create({
        body: {
          items: [{
            id: input.collectionId,
            title: `${purchasedPhotos.length} foto${purchasedPhotos.length !== 1 ? "s" : ""} — ${collection.title}`,
            quantity: 1,
            unit_price: totalAmount,
            currency_id: "ARS",
          }],
          payer: {
            email: input.buyerEmail,
            name: input.buyerName,
            surname: input.buyerLastName,
            phone: input.buyerPhone ? { number: input.buyerPhone } : undefined,
          },
          ...(env.NEXT_PUBLIC_BASE_URL && !env.NEXT_PUBLIC_BASE_URL.includes("localhost")
            ? {
                back_urls: {
                  success: `${env.NEXT_PUBLIC_BASE_URL}/descarga/pendiente?purchase=${purchase.id}`,
                  failure: `${env.NEXT_PUBLIC_BASE_URL}/colecciones/${collection.slug}`,
                  pending: `${env.NEXT_PUBLIC_BASE_URL}/descarga/pendiente?purchase=${purchase.id}`,
                },
                auto_return: "approved" as const,
                notification_url: `${env.NEXT_PUBLIC_BASE_URL}/api/webhooks/mercadopago`,
              }
            : {}),
          external_reference: purchase.id,
        },
      });

      await ctx.db.purchase.update({
        where: { id: purchase.id },
        data: { mercadopagoPreferenceId: preference.id },
      });

      return {
        preferenceId: preference.id,
        initPoint: preference.init_point,
      };
    }),

  accessByEmail: publicProcedure
    .input(z.object({ email: z.string().email(), collectionId: z.string(), bibNumber: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const purchase = await ctx.db.purchase.findFirst({
        where: {
          buyerEmail: { equals: input.email, mode: "insensitive" },
          collectionId: input.collectionId,
          bibNumber: input.bibNumber,
          status: "APPROVED",
          downloadToken: { not: null },
        },
        select: { downloadToken: true },
      });
      return purchase?.downloadToken ?? null;
    }),

  getDownloadInfo: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const purchase = await ctx.db.purchase.findUnique({
        where: { downloadToken: input.token },
        include: {
          collection: { select: { title: true } },
        },
      });

      if (!purchase) return null;
      if (purchase.status !== "APPROVED") return null;

      const purchasedIds = JSON.parse(purchase.photoIds as string) as string[];
      const photos = await ctx.db.photo.findMany({
        where: {
          collectionId: purchase.collectionId,
          id: { in: purchasedIds },
        },
        orderBy: { order: "asc" },
      });

      const photoUrls = await Promise.all(
        photos.map(async (photo) => {
          const safeName = photo.filename.replace(/"/g, "").replace(/[\r\n]/g, "");
          const disposition = `attachment; filename="${safeName}"`;
          const url = isS3Key(photo.storageKey)
            ? await createS3DownloadUrl(photo.storageKey, 3600 * 24, undefined, disposition)
            : await createSignedUrl(photo.storageKey, 3600 * 24);
          return { id: photo.id, filename: photo.filename, url };
        }),
      );

      const suggestions = purchase.bibNumber
        ? await ctx.db.collection.findMany({
            where: {
              isPublished: true,
              id: { not: purchase.collectionId },
              photos: { some: { bibNumber: purchase.bibNumber } },
              purchases: {
                none: {
                  buyerEmail: purchase.buyerEmail,
                  bibNumber: purchase.bibNumber,
                  status: "APPROVED",
                },
              },
            },
            select: {
              id: true,
              slug: true,
              title: true,
              coverUrl: true,
              pricePerBib: true,
              eventDate: true,
              _count: { select: { photos: { where: { bibNumber: purchase.bibNumber } } } },
            },
          })
        : [];

      return {
        bibNumber: purchase.bibNumber,
        collectionTitle: purchase.collection.title,
        buyerName: purchase.buyerName,
        isPublic: purchase.isPublic,
        photos: photoUrls.filter((p): p is { id: string; filename: string; url: string } => p.url !== null),
        suggestions: suggestions.map((s) => ({
          id: s.id,
          slug: s.slug,
          title: s.title,
          coverUrl: s.coverUrl,
          pricePerBib: Number(s.pricePerBib),
          eventDate: s.eventDate,
          photoCount: s._count.photos,
        })),
      };
    }),

  makePublic: publicProcedure
    .input(z.object({ token: z.string(), isPublic: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const purchase = await ctx.db.purchase.findFirst({
        where: { downloadToken: input.token, status: "APPROVED" },
      });
      if (!purchase) throw new Error("Invalid token");
      await ctx.db.purchase.update({
        where: { id: purchase.id },
        data: { isPublic: input.isPublic },
      });
      return { isPublic: input.isPublic };
    }),

  // ─── Admin ─────────────────────────────────────────────────────────────────

  adminStats: protectedProcedure
    .input(z.object({ since: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const baseWhere = {
        buyerEmail: { not: "public@system" },
        ...(input.since ? { createdAt: { gte: new Date(input.since) } } : {}),
      };
      const [total, approved, pending, revenue] = await Promise.all([
        ctx.db.purchase.count({ where: baseWhere }),
        ctx.db.purchase.count({ where: { ...baseWhere, status: "APPROVED" } }),
        ctx.db.purchase.count({ where: { ...baseWhere, status: "PENDING" } }),
        ctx.db.purchase.aggregate({
          where: { ...baseWhere, status: "APPROVED" },
          _sum: { amountPaid: true },
        }),
      ]);
      return {
        total,
        approved,
        pending,
        revenue: Number(revenue._sum.amountPaid ?? 0),
      };
    }),

  adminList: protectedProcedure
    .input(
      z.object({
        page: z.number().default(1),
        limit: z.number().default(20),
        status: z.enum(["PENDING", "APPROVED", "REJECTED", "REFUNDED"]).optional(),
        since: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        buyerEmail: { not: "public@system" },
        ...(input.status ? { status: input.status } : {}),
        ...(input.since ? { createdAt: { gte: new Date(input.since) } } : {}),
      };
      const [items, total] = await Promise.all([
        ctx.db.purchase.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (input.page - 1) * input.limit,
          take: input.limit,
          select: {
            id: true,
            buyerEmail: true,
            buyerName: true,
            buyerLastName: true,
            buyerPhone: true,
            bibNumber: true,
            status: true,
            amountPaid: true,
            createdAt: true,
            downloadToken: true,
            photoIds: true,
            collection: { select: { title: true } },
          },
        }),
        ctx.db.purchase.count({ where }),
      ]);
      return { items, total, pages: Math.ceil(total / input.limit) };
    }),

  manualApprove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const token = crypto.randomUUID();
      const updated = await ctx.db.purchase.update({
        where: { id: input.id },
        data: { status: "APPROVED", downloadToken: token, downloadTokenExpires: null },
        include: { collection: { select: { title: true } } },
      });
      const photoCount = (JSON.parse(updated.photoIds as string) as string[]).length;
      const photoThumbs = await getPurchasePhotoThumbs(updated.id, 6);
      void sendPurchaseApprovedEmail({
        to: updated.buyerEmail,
        buyerName: updated.buyerName,
        bibNumber: updated.bibNumber,
        collectionTitle: updated.collection.title,
        downloadToken: token,
        photoCount,
        photoThumbs,
      });
      return updated;
    }),

  adminGetPhotos: protectedProcedure
    .input(z.object({ purchaseId: z.string() }))
    .query(async ({ input }) => {
      return getPurchasePhotoThumbs(input.purchaseId, 500);
    }),

  adminCustomers: protectedProcedure
    .input(
      z.object({
        q: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        buyerEmail: { not: "public@system" },
        ...(input.q
          ? {
              OR: [
                { buyerEmail: { contains: input.q, mode: "insensitive" as const } },
                { buyerName: { contains: input.q, mode: "insensitive" as const } },
                { buyerLastName: { contains: input.q, mode: "insensitive" as const } },
                { buyerPhone: { contains: input.q } },
              ],
            }
          : {}),
      };

      const grouped = await ctx.db.purchase.groupBy({
        by: ["buyerEmail"],
        where,
        _count: { _all: true },
        _sum: { amountPaid: true },
        _max: { createdAt: true },
        orderBy: { _max: { createdAt: "desc" } },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      });

      const totalEmails = await ctx.db.purchase.groupBy({
        by: ["buyerEmail"],
        where,
        _count: { _all: true },
      });

      const emails = grouped.map((g) => g.buyerEmail);
      const latestByEmail = await ctx.db.purchase.findMany({
        where: { buyerEmail: { in: emails } },
        orderBy: { createdAt: "desc" },
        select: {
          buyerEmail: true,
          buyerName: true,
          buyerLastName: true,
          buyerPhone: true,
          status: true,
        },
      });

      const meta = new Map<string, { name: string | null; lastName: string | null; phone: string | null; approved: number }>();
      for (const p of latestByEmail) {
        const existing = meta.get(p.buyerEmail);
        if (!existing) {
          meta.set(p.buyerEmail, {
            name: p.buyerName,
            lastName: p.buyerLastName,
            phone: p.buyerPhone,
            approved: p.status === "APPROVED" ? 1 : 0,
          });
        } else {
          if (!existing.name && p.buyerName) existing.name = p.buyerName;
          if (!existing.lastName && p.buyerLastName) existing.lastName = p.buyerLastName;
          if (!existing.phone && p.buyerPhone) existing.phone = p.buyerPhone;
          if (p.status === "APPROVED") existing.approved += 1;
        }
      }

      const items = grouped.map((g) => {
        const m = meta.get(g.buyerEmail);
        return {
          email: g.buyerEmail,
          name: m?.name ?? null,
          lastName: m?.lastName ?? null,
          phone: m?.phone ?? null,
          totalPurchases: g._count._all,
          approvedPurchases: m?.approved ?? 0,
          totalSpent: Number(g._sum.amountPaid ?? 0),
          lastPurchaseAt: g._max.createdAt,
        };
      });

      return {
        items,
        total: totalEmails.length,
        pages: Math.max(1, Math.ceil(totalEmails.length / input.limit)),
      };
    }),
});
