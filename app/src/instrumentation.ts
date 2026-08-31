/**
 * Se ejecuta una vez al arrancar el servidor. Es el enganche de Next para
 * trabajo de fondo que tiene que existir sin que nadie entre a una página.
 */

export async function register() {
  // Sólo en el runtime de Node: en el edge no hay ni base ni sharp.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { iniciarBarridoWatermark } = await import("~/lib/watermark-sweeper");
  iniciarBarridoWatermark();
}
