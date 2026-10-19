// Guarda un guion aprobado desde el GPT "Guionista Level" en el sistema del cliente.
// Autenticación: header "x-api-key" debe coincidir con el secreto GUIONISTA_API_KEY.
// El cliente se identifica con el token de su link (?guiones=TOKEN).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extraerToken(valor: string): string {
  const v = (valor || "").trim();
  const m = v.match(/[?&]guiones=([A-Za-z0-9]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9]{10,40}$/.test(v) ? v : "";
}

function nuevoId(): string {
  const rnd = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
  return `id-${Date.now().toString(36)}-${rnd}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Usa POST." });

  const llave = Deno.env.get("GUIONISTA_API_KEY") || "";
  if (!llave || req.headers.get("x-api-key") !== llave) {
    return json(401, { ok: false, error: "No autorizado." });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "El cuerpo debe ser JSON." });
  }

  const token = extraerToken(String(body.link_cliente ?? ""));
  const folio = String(body.folio ?? "").trim();
  const titulo = String(body.titulo ?? "").trim();
  const guion = String(body.guion ?? "").trim();
  const tomas = String(body.tomas ?? "").trim();
  const copy = String(body.copy ?? "").trim();

  if (!token) return json(400, { ok: false, error: "El link de cliente no es válido. Pide al cliente que lo copie completo desde su navegador." });
  if (!/^(1[0-2]|[1-9])\.(1[0-2]|[1-9])$/.test(folio)) return json(400, { ok: false, error: "El folio debe ser mes.número (por ejemplo 10.3), con números del 1 al 12." });
  if (!titulo || !guion) return json(400, { ok: false, error: "Faltan el título o el guion." });
  if (titulo.length > 300 || guion.length > 20000 || tomas.length > 10000 || copy.length > 5000) {
    return json(400, { ok: false, error: "El texto es demasiado largo." });
  }

  const { data: cliente, error: errCli } = await supabase
    .from("clientes").select("id, nombre").eq("token", token).maybeSingle();
  if (errCli) return json(500, { ok: false, error: "No se pudo consultar el sistema. Intenta de nuevo." });
  if (!cliente) return json(404, { ok: false, error: "No encontré un sistema con ese link. Revisa que sea tu link de cliente de Level." });

  const { data: repetido } = await supabase
    .from("guiones").select("id").eq("cliente_id", cliente.id).eq("folio", folio).limit(1);
  if (repetido && repetido.length > 0) {
    return json(409, { ok: false, error: `Ya existe un guion con el folio ${folio} en tu sistema. Usa el siguiente folio disponible.` });
  }

  const notas = [tomas && `TOMAS\n${tomas}`, copy && `COPY\n${copy}`].filter(Boolean).join("\n\n");
  const { error: errIns } = await supabase.from("guiones").insert({
    id: nuevoId(),
    cliente_id: cliente.id,
    folio,
    titulo,
    guion,
    notas,
    musica: "",
    inspiracion: "",
    estatus: "Aprobado",
    pendiente_revision: false,
  });
  if (errIns) return json(500, { ok: false, error: "No se pudo guardar el guion. Intenta de nuevo." });

  return json(200, { ok: true, mensaje: `Guardado en tu sistema como ${folio} — ${titulo}.` });
});
