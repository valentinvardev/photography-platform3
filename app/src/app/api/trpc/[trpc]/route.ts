import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";

import { env } from "~/env";
import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

/**
 * Arranque del barrido de marcas de agua.
 *
 * Va acá y no en instrumentation.ts porque ese archivo Next lo compila también
 * para el runtime edge —lo fuerza el middleware— y ahí no existen fs, os ni
 * child_process, que es lo que sharp y ffmpeg necesitan. La guarda por
 * NEXT_RUNTIME no alcanza: webpack resuelve el grafo de imports igual, aunque
 * el código nunca llegue a ejecutarse.
 *
 * Esta ruta, en cambio, es sólo de Node y se carga apenas alguien abre el admin
 * o una galería. Con eso alcanza: el barrido es una red de seguridad, y lo que
 * lo dispara al instante después de subir fotos es despertarBarrido().
 */
void import("~/lib/watermark-sweeper")
  .then(({ iniciarBarridoWatermark }) => iniciarBarridoWatermark())
  .catch((err) => console.error("[barrido] no se pudo iniciar:", err));

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
  });
};

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError:
      env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(
              `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`
            );
          }
        : undefined,
  });

export { handler as GET, handler as POST };
