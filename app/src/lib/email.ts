import { Resend } from "resend";
import { env } from "~/env";

const getResend = () => {
  if (!env.RESEND_API_KEY) return null;
  return new Resend(env.RESEND_API_KEY);
};

const FROM = env.RESEND_FROM_EMAIL ?? "SINCHI® <noreply@sinchi.com>";
const BASE_URL = env.NEXT_PUBLIC_BASE_URL ?? "https://sinchi.com";
const BCC_EMAIL = "valentinvarela0508@gmail.com";

function purchaseApprovedHtml({
  buyerName,
  bibNumber,
  collectionTitle,
  downloadUrl,
  photoCount,
}: {
  buyerName: string | null;
  bibNumber: string | null;
  collectionTitle: string;
  downloadUrl: string;
  photoCount?: number;
}) {
  const name = buyerName ?? "corredor";
  const bib = bibNumber ? `#${bibNumber}` : "";
  const count = photoCount ?? 0;
  const photoText = count > 0
    ? `${count} foto${count !== 1 ? "s" : ""}`
    : "tus fotos";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tus fotos están listas — SINCHI®</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 24px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;font-size:20px;font-style:italic;font-weight:800;color:#FFE600;letter-spacing:-0.02em;line-height:1;">SINCHI®</p>
                  </td>
                  <td align="right">
                    <p style="margin:0;font-family:monospace;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#444;">Fotografía de carrera</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider top -->
          <tr><td style="border-top:1px solid #222;padding-bottom:40px;"></td></tr>

          <!-- Eyebrow -->
          <tr>
            <td style="padding-bottom:16px;">
              <p style="margin:0;font-family:monospace;font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#555;">
                (00) — ${collectionTitle}${bib ? ` · Dorsal ${bib}` : ""}
              </p>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding-bottom:40px;">
              <p style="margin:0;font-size:48px;font-style:italic;font-weight:800;color:#f5f2ec;line-height:0.9;letter-spacing:-0.03em;">
                Tus fotos<br /><span style="color:#555;">están listas.</span>
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="border-top:1px solid #222;padding-bottom:36px;"></td></tr>

          <!-- Body -->
          <tr>
            <td style="padding-bottom:16px;">
              <p style="margin:0;color:#f5f2ec;font-size:15px;line-height:1.7;">
                Hola, <strong>${name}</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:40px;">
              <p style="margin:0;color:#888;font-size:15px;line-height:1.7;">
                Compraste ${photoText} en alta resolución, sin marca de agua. Ya las tenés disponibles para descargar cuando quieras.
              </p>
            </td>
          </tr>

          <!-- Stats row -->
          <tr>
            <td style="padding-bottom:40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #222;">
                <tr>
                  <td style="padding:20px 24px;border-right:1px solid #222;" width="33%">
                    <p style="margin:0 0 4px;font-family:monospace;font-size:8px;letter-spacing:0.2em;text-transform:uppercase;color:#444;">Fotos</p>
                    <p style="margin:0;font-size:24px;font-style:italic;font-weight:800;color:#f5f2ec;">${String(count).padStart(3, "0")}</p>
                  </td>
                  <td style="padding:20px 24px;border-right:1px solid #222;" width="33%">
                    <p style="margin:0 0 4px;font-family:monospace;font-size:8px;letter-spacing:0.2em;text-transform:uppercase;color:#444;">Resolución</p>
                    <p style="margin:0;font-size:24px;font-style:italic;font-weight:800;color:#f5f2ec;">HD</p>
                  </td>
                  <td style="padding:20px 24px;" width="33%">
                    <p style="margin:0 0 4px;font-family:monospace;font-size:8px;letter-spacing:0.2em;text-transform:uppercase;color:#444;">Marca de agua</p>
                    <p style="margin:0;font-size:24px;font-style:italic;font-weight:800;color:#f5f2ec;">no</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding-bottom:40px;">
              <a href="${downloadUrl}" style="display:block;padding:18px 32px;background:#FFE600;color:#0a0a0a;font-family:monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;font-weight:700;text-align:center;">
                Ver y descargar mis fotos →
              </a>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="border-top:1px solid #222;padding-bottom:24px;"></td></tr>

          <!-- Footer note -->
          <tr>
            <td style="padding-bottom:40px;">
              <p style="margin:0;color:#444;font-family:monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;line-height:1.8;">
                El link no expira · ¿Alguna duda? Respondé este email
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;font-family:monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#333;">© ${new Date().getFullYear()} SINCHI®</p>
                  </td>
                  <td align="right">
                    <a href="${BASE_URL}" style="font-family:monospace;font-size:9px;letter-spacing:0.1em;color:#333;text-decoration:none;">${BASE_URL.replace("https://", "")}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendPurchaseApprovedEmail({
  to,
  buyerName,
  bibNumber,
  collectionTitle,
  downloadToken,
  photoCount,
}: {
  to: string;
  buyerName: string | null;
  bibNumber: string | null;
  collectionTitle: string;
  downloadToken: string;
  photoCount?: number;
}) {
  const resend = getResend();
  if (!resend) return;

  const downloadUrl = `${BASE_URL}/descarga/${downloadToken}`;
  const bib = bibNumber ? `dorsal #${bibNumber}` : collectionTitle;

  try {
    await resend.emails.send({
      from: FROM,
      to,
      bcc: BCC_EMAIL,
      subject: `Tus fotos de ${bib} están listas — SINCHI®`,
      html: purchaseApprovedHtml({ buyerName, bibNumber, collectionTitle, downloadUrl, photoCount }),
    });
  } catch (err) {
    console.error("[Resend] Error sending email:", err);
  }
}
