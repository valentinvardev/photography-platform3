import { createHmac } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "~/server/db";
import { sendPurchaseApprovedEmail } from "~/lib/email";

function verifyWebhookSignature(request: NextRequest, rawBody: string): boolean {
  const { env } = require("~/env") as { env: { MERCADOPAGO_WEBHOOK_SECRET?: string } };
  const secret = env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true;

  const signature = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  if (!signature || !requestId) return false;

  const tsMatch = /ts=([^,]+)/.exec(signature);
  const v1Match = /v1=([^,]+)/.exec(signature);
  if (!tsMatch?.[1] || !v1Match?.[1]) return false;

  const ts = tsMatch[1];
  const expectedHash = v1Match[1];
  const manifest = `id:${requestId};request-id:${requestId};ts:${ts};${rawBody}`;
  const calculated = createHmac("sha256", secret).update(manifest).digest("hex");

  return calculated === expectedHash;
}

async function processPayment(paymentId: string, mpAccessToken: string) {
  const mpResponse = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    { headers: { Authorization: `Bearer ${mpAccessToken}` } },
  );

  if (!mpResponse.ok) {
    const errText = await mpResponse.text().catch(() => "");
    console.error(`[MP webhook] Failed to fetch payment ${paymentId}: ${mpResponse.status} ${errText}`);
    return;
  }

  const payment = await mpResponse.json() as {
    id: number;
    status: string;
    external_reference?: string;
    order?: { id?: string };
  };

  const purchaseId = payment.external_reference;
  if (!purchaseId) {
    console.error(`[MP webhook] Payment ${paymentId} has no external_reference`);
    return;
  }

  const statusMap: Record<string, string> = {
    approved: "APPROVED",
    rejected: "REJECTED",
    refunded: "REFUNDED",
  };

  const newStatus = statusMap[payment.status] ?? "PENDING";

  const updateData: Record<string, unknown> = {
    mercadopagoPaymentId: String(payment.id),
    mercadopagoOrderId: payment.order?.id ? String(payment.order.id) : undefined,
    status: newStatus,
  };

  const downloadToken = crypto.randomUUID();
  if (newStatus === "APPROVED") {
    updateData.downloadToken = downloadToken;
    updateData.downloadTokenExpires = null;
  }

  // Atomic conditional update — only runs if not already APPROVED.
  // Prevents double emails when MP sends the webhook more than once.
  const count = await db.purchase.updateMany({
    where: { id: purchaseId, status: { not: "APPROVED" } },
    data: updateData,
  });

  if (count.count === 0) return; // Already processed

  if (newStatus === "APPROVED") {
    const purchase = await db.purchase.findUnique({
      where: { id: purchaseId },
      include: { collection: { select: { title: true } } },
    });
    if (!purchase?.downloadToken) return;

    const photoCount = (JSON.parse(purchase.photoIds as string) as string[]).length;
    void sendPurchaseApprovedEmail({
      to: purchase.buyerEmail,
      buyerName: purchase.buyerName,
      bibNumber: purchase.bibNumber,
      collectionTitle: purchase.collection.title,
      downloadToken: purchase.downloadToken,
      photoCount,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    if (!verifyWebhookSignature(request, rawBody)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const { env } = await import("~/env");
    const tokenSetting = await db.setting.findUnique({ where: { key: "mp_access_token" } });
    const mpAccessToken = tokenSetting?.value ?? env.MERCADOPAGO_ACCESS_TOKEN;
    if (!mpAccessToken) {
      console.error("[MP webhook] No access token configured");
      return NextResponse.json({ received: true });
    }

    const body = JSON.parse(rawBody) as {
      type?: string;
      topic?: string;
      data?: { id?: string };
      id?: string | number;
    };

    // New Webhooks format: { type: "payment", data: { id: "..." } }
    if (body.type === "payment" && body.data?.id) {
      await processPayment(String(body.data.id), mpAccessToken);
      return NextResponse.json({ received: true });
    }

    // IPN format: { topic: "payment", id: "..." }
    if (body.topic === "payment" && body.id) {
      await processPayment(String(body.id), mpAccessToken);
      return NextResponse.json({ received: true });
    }

    // IPN via query params: ?topic=payment&id=...
    const url = new URL(request.url);
    const topicParam = url.searchParams.get("topic");
    const idParam = url.searchParams.get("id");
    if (topicParam === "payment" && idParam) {
      await processPayment(idParam, mpAccessToken);
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[MP webhook] Unhandled error:", err);
    return NextResponse.json({ received: true });
  }
}
