/**
 * Estado de reintentos del barrido de marcas de agua.
 *
 * Puro a propósito: sin base, sin red, sin reloj propio. Los dos defectos que
 * dejaron fotos sin marca vivían en esta lógica —el muro de la ventana y los
 * tres intentos de por vida quemados en segundos— así que ahora está separada
 * donde se puede testear con casos, no con fe.
 *
 * El diseño reemplaza al anterior en dos decisiones:
 *
 * 1. Backoff en el tiempo, no contador de por vida. Antes una foto tenía 3
 *    intentos totales; un bache de red de segundos los quemaba (el barrido
 *    reintenta de inmediato) y la foto quedaba en lista negra en memoria hasta
 *    reiniciar pm2. Ahora cada fallo la aparta un rato creciente y SIEMPRE
 *    vuelve: un fallo permanente (original borrado) cuesta un reintento por
 *    hora, que es nada; abandonar una foto por un bache costaba una foto sin
 *    marca para siempre.
 *
 * 2. Las apartadas se excluyen EN LA CONSULTA (id notIn), no filtrando en
 *    memoria después. Antes se traían las 144 más nuevas y se filtraban: si
 *    esas 144 estaban todas en lista negra, la cola daba vacía y el barrido
 *    cortaba — con miles de fotos más viejas jamás consultadas detrás del muro.
 */

export type Reintento = {
  intentos: number;
  /** Hasta cuándo no se la vuelve a intentar (epoch ms). */
  hastaMs: number;
};

/**
 * Espaciado entre reintentos. El último escalón se repite para siempre.
 */
const ESPERAS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

/** Tope de la lista notIn, para no armar una consulta desmedida. */
const MAX_EN_ESPERA = 800;

export function registrarFallo(
  mapa: Map<string, Reintento>,
  id: string,
  ahora: number,
): void {
  const previo = mapa.get(id);
  const intentos = (previo?.intentos ?? 0) + 1;
  const espera = ESPERAS_MS[Math.min(intentos - 1, ESPERAS_MS.length - 1)]!;
  mapa.set(id, { intentos, hastaMs: ahora + espera });
}

export function registrarExito(mapa: Map<string, Reintento>, id: string): void {
  mapa.delete(id);
}

/**
 * Ids que ahora mismo están en espera: son los que la consulta debe excluir.
 * De paso poda las entradas vencidas, así el Map no crece sin techo.
 *
 * Si hay más apartadas que el tope, se excluyen las de espera más larga y el
 * resto vuelve a la cola antes de tiempo: reintentar de más es el lado barato
 * del error.
 */
export function idsEnEspera(
  mapa: Map<string, Reintento>,
  ahora: number,
  max: number = MAX_EN_ESPERA,
): string[] {
  const activos: { id: string; hastaMs: number }[] = [];
  for (const [id, r] of mapa) {
    if (r.hastaMs <= ahora) mapa.delete(id);
    else activos.push({ id, hastaMs: r.hastaMs });
  }
  if (activos.length <= max) return activos.map((a) => a.id);
  return activos
    .sort((a, b) => b.hastaMs - a.hastaMs)
    .slice(0, max)
    .map((a) => a.id);
}

/** Cuántas están apartadas en este momento (para el log de cierre). */
export function cantidadEnEspera(mapa: Map<string, Reintento>, ahora: number): number {
  let n = 0;
  for (const r of mapa.values()) if (r.hastaMs > ahora) n++;
  return n;
}
