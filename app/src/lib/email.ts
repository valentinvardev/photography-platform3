import { Resend } from "resend";
import { env } from "~/env";

const getResend = () => {
  if (!env.RESEND_API_KEY) return null;
  return new Resend(env.RESEND_API_KEY);
};

const FROM = env.RESEND_FROM_EMAIL ?? "SINCHI® <noreply@sinchi.com>";
const BASE_URL = env.NEXT_PUBLIC_BASE_URL ?? "https://sinchi.com";
const BCC_EMAIL = ["valentinvarela0508@gmail.com", "sinchi.foto@gmail.com"];

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
  const font = "Helvetica, Arial, sans-serif";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tus fotos están listas — SINCHI®</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:${font};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Dark header band with logo -->
          <tr>
            <td style="background:#111111;padding:36px 36px 28px;">
              <img src="${BASE_URL}/sinchi-cropped.png" alt="SINCHI®" width="140" style="display:block;border:0;" />
            </td>
          </tr>

          <!-- Yellow accent strip -->
          <tr>
            <td style="background:#FFE600;height:4px;line-height:4px;font-size:0;">&nbsp;</td>
          </tr>

          <!-- Dark content area -->
          <tr>
            <td style="background:#111111;padding:40px 36px 0;">

              <!-- Eyebrow -->
              <p style="margin:0 0 20px;font-family:${font};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#FFE600;">
                ${collectionTitle}${bib ? ` · Dorsal ${bib}` : ""}
              </p>

              <!-- Headline -->
              <p style="margin:0 0 36px;font-family:${font};font-size:44px;font-style:italic;font-weight:800;color:#ffffff;line-height:0.92;letter-spacing:-0.02em;">
                Tus fotos<br /><span style="color:#FFE600;">están listas.</span>
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #2a2a2a;margin-bottom:32px;"><tr><td style="padding-top:32px;"></td></tr></table>

              <!-- Body -->
              <p style="margin:0 0 8px;font-family:${font};color:#ffffff;font-size:15px;font-weight:700;line-height:1.6;">
                Hola, ${name}
              </p>
              <p style="margin:0 0 36px;font-family:${font};color:#888888;font-size:15px;line-height:1.7;">
                Compraste ${photoText} en alta resolución. Ya las tenés disponibles para descargar cuando quieras.
              </p>

              <!-- Stats row -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:36px;background:#FFE600;">
                <tr>
                  <td style="padding:20px 24px;border-right:1px solid #0a0a0a;" width="50%">
                    <p style="margin:0 0 4px;font-family:${font};font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#0a0a0a;">Fotos</p>
                    <p style="margin:0;font-family:${font};font-size:36px;font-style:italic;font-weight:800;color:#0a0a0a;line-height:1;">${String(count).padStart(3, "0")}</p>
                  </td>
                  <td style="padding:20px 24px;" width="50%">
                    <p style="margin:0 0 4px;font-family:${font};font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#0a0a0a;">Resolución</p>
                    <p style="margin:0;font-family:${font};font-size:36px;font-style:italic;font-weight:800;color:#0a0a0a;line-height:1;">HD</p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <a href="${downloadUrl}" style="display:block;padding:18px 32px;background:#FFE600;color:#0a0a0a;font-family:${font};font-size:12px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;text-decoration:none;text-align:center;margin-bottom:36px;">
                Ver y descargar mis fotos →
              </a>

              <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #2a2a2a;margin-bottom:28px;"><tr><td style="padding-top:28px;"></td></tr></table>

              <!-- Footer note -->
              <p style="margin:0 0 40px;font-family:${font};color:#555555;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;line-height:1.8;">
                El link no expira · ¿Alguna duda? Respondé este email
              </p>

            </td>
          </tr>

          <!-- Footer strip -->
          <tr>
            <td style="background:#0a0a0a;padding:20px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;font-family:${font};font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#333333;">© ${new Date().getFullYear()} SINCHI®</p>
                  </td>
                  <td align="right">
                    <a href="${BASE_URL}" style="font-family:${font};font-size:9px;letter-spacing:0.1em;color:#333333;text-decoration:none;">${BASE_URL.replace("https://", "")}</a>
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
