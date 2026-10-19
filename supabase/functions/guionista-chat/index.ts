// Guionista Level dentro del portal del cliente (?guiones=TOKEN).
// El cliente se identifica con su token; la clave de Anthropic vive en el secreto ANTHROPIC_API_KEY.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const MODELO = "claude-haiku-5-5";
const MAX_MENSAJES_MES = 400;      // tope de mensajes del cliente por mes
const HISTORIAL_CONTEXTO = 40;     // mensajes previos que se mandan al modelo
const MAX_LARGO_MENSAJE = 6000;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// El método Level (instrucciones y documentos) vive en la tabla guionista_config,
// que no tiene políticas públicas: solo esta función lo puede leer.
let METODO_CACHE: { texto: string; ts: number } | null = null;
async function cargarMetodo(): Promise<string> {
  if (METODO_CACHE && Date.now() - METODO_CACHE.ts < 10 * 60 * 1000) return METODO_CACHE.texto;
  const { data, error } = await supabase.from("guionista_config").select("clave, valor").order("clave");
  if (error || !data) throw new Error("No se pudo cargar el método.");
  const inst = data.find((r) => r.clave === "instrucciones")?.valor || "";
  const docs = data.filter((r) => r.clave.startsWith("doc_"))
    .map((r) => `<documento nombre="${r.clave.slice(4)}">\n${r.valor}\n</documento>`).join("\n\n");
  const texto = `${inst}\n\nDOCUMENTOS DEL MÉTODO LEVEL\n\n${docs}`;
  METODO_CACHE = { texto, ts: Date.now() };
  return texto;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function nuevoId(): string {
  const rnd = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
  return `id-${Date.now().toString(36)}-${rnd}`;
}

function ahoraMx() {
  const f = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City", year: "numeric", month: "numeric", day: "numeric",
  }).formatToParts(new Date());
  const get = (t: string) => Number(f.find((p) => p.type === t)?.value);
  return { anio: get("year"), mes: get("month"), dia: get("day") };
}

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function reparto(n: number) {
  if (n <= 1) return "1 video (el formato que mejor le funcione).";
  const camara = Math.ceil(n / 3);
  const cortos = Math.ceil((n - camara) / 2);
  const dinamicos = n - camara - cortos;
  return `${camara} a cámara, ${cortos} cortos o inspiracionales y ${dinamicos} dinámicos.`;
}

async function contextoCliente(cliente: { id: string; nombre: string; videos_mes: number | null }) {
  const { mes, anio, dia } = ahoraMx();
  const videosMes = Math.min(12, Math.max(1, Math.round(Number(cliente.videos_mes) || 12)));
  const [{ data: exp }, { data: gs }] = await Promise.all([
    supabase.from("expedientes").select("*").eq("cliente_id", cliente.id).maybeSingle(),
    supabase.from("guiones").select("folio,titulo").eq("cliente_id", cliente.id),
  ]);
  const folios = (gs || []).map((g) => String(g.folio || "").trim()).filter(Boolean);
  const delMes = folios.filter((f) => f.split(".")[0] === String(mes))
    .sort((a, b) => Number(a.split(".")[1]) - Number(b.split(".")[1]));
  let siguiente = "";
  for (let n = 1; n <= videosMes; n++) { if (!folios.includes(`${mes}.${n}`)) { siguiente = `${mes}.${n}`; break; } }
  const mesSig = mes === 12 ? 1 : mes + 1;

  let expTxt = "No tiene expediente en el sistema. Ármale un mini expediente antes de proponer ideas.";
  if (exp) {
    const campos: [string, string][] = [
      ["Subtítulo", exp.subtitulo], ["Arquetipo pilar", [exp.arq1, exp.arq1_desc].filter(Boolean).join(" — ")],
      ["Arquetipo secundario 1", [exp.arq2, exp.arq2_desc].filter(Boolean).join(" — ")],
      ["Arquetipo secundario 2", [exp.arq3, exp.arq3_desc].filter(Boolean).join(" — ")],
      ["Redes activas", exp.redes_activas], ["Historia", exp.historia], ["Objetivos de negocio", exp.obj_negocio],
      ["Objetivos personales", exp.obj_personal], ["Tono y estilo", exp.tono], ["Valores", exp.valores],
      ["Desafíos", exp.desafios], ["Esencia", exp.esencia],
    ];
    expTxt = campos.filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k}: ${String(v).trim()}`).join("\n");
  }

  return `CONTEXTO DEL CLIENTE
Nombre: ${cliente.nombre}
Fecha de hoy: ${dia} de ${MESES[mes - 1]} de ${anio}. Mes actual: ${mes}.
Videos al mes contratados: ${videosMes}. Reparto de formatos: ${reparto(videosMes)}
Folios de este mes que ya existen en su sistema: ${delMes.length ? delMes.join(", ") : "ninguno"}.
Siguiente folio libre de este mes: ${siguiente || `ya completó sus ${videosMes} videos de este mes; usa el mes ${mesSig} (${mesSig}.1 en adelante) si el cliente está de acuerdo`}.

EXPEDIENTE
${expTxt}`;
}

const HERRAMIENTAS = [{
  name: "guardar_guion",
  description: "Guarda en el sistema de Level del cliente un guion que el cliente aprobó y confirmó que quiere guardar. Queda en estatus Aprobado.",
  input_schema: {
    type: "object",
    properties: {
      folio: { type: "string", description: "Mes punto número, por ejemplo 10.3" },
      titulo: { type: "string" },
      guion: { type: "string", description: "Guion en texto corrido, sin etiquetas de bloques" },
      tomas: { type: "string", description: "Lista numerada de tomas" },
      copy: { type: "string", description: "Copy para la publicación" },
    },
    required: ["folio", "titulo", "guion"],
  },
}];

async function guardarGuion(clienteId: string, input: Record<string, unknown>) {
  const folio = String(input.folio ?? "").trim();
  const titulo = String(input.titulo ?? "").trim();
  const guion = String(input.guion ?? "").trim();
  const tomas = String(input.tomas ?? "").trim();
  const copy = String(input.copy ?? "").trim();
  if (!/^(1[0-2]|[1-9])\.(1[0-2]|[1-9])$/.test(folio)) return { ok: false, error: "Folio inválido: debe ser mes.número del 1 al 12." };
  if (!titulo || !guion) return { ok: false, error: "Faltan título o guion." };
  const { data: rep } = await supabase.from("guiones").select("id").eq("cliente_id", clienteId).eq("folio", folio).limit(1);
  if (rep && rep.length) return { ok: false, error: `Ya existe un guion con el folio ${folio}.` };
  const notas = [tomas && `TOMAS\n${tomas}`, copy && `COPY\n${copy}`].filter(Boolean).join("\n\n");
  const { error } = await supabase.from("guiones").insert({
    id: nuevoId(), cliente_id: clienteId, folio, titulo, guion, notas,
    musica: "", inspiracion: "", estatus: "Aprobado", pendiente_revision: false,
  });
  if (error) return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  return { ok: true, folio, titulo };
}

// Llama a Claude en modo streaming y va mandando el texto al navegador mientras se escribe.
async function llamarClaudeStream(system: unknown[], messages: unknown[], alTexto: (t: string) => void) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODELO, max_tokens: 2500, system, messages, tools: HERRAMIENTAS, stream: true }),
  });
  if (!r.ok || !r.body) {
    const data = await r.json().catch(() => ({}));
    throw new Error((data as any)?.error?.message || `Error ${r.status}`);
  }
  const bloques: any[] = [];
  let stopReason = "";
  const lector = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await lector.read();
    if (done) break;
    buffer += value;
    let corte;
    while ((corte = buffer.indexOf("\n\n")) >= 0) {
      const evento = buffer.slice(0, corte);
      buffer = buffer.slice(corte + 2);
      const linea = evento.split("\n").find((l) => l.startsWith("data:"));
      if (!linea) continue;
      let d: any;
      try { d = JSON.parse(linea.slice(5).trim()); } catch { continue; }
      if (d.type === "content_block_start") {
        const b = { ...d.content_block };
        if (b.type === "tool_use") { b._json = ""; b.input = {}; }
        if (b.type === "text") b.text = "";
        bloques[d.index] = b;
      } else if (d.type === "content_block_delta") {
        const b = bloques[d.index];
        if (!b) continue;
        if (d.delta.type === "text_delta") { b.text += d.delta.text; alTexto(d.delta.text); }
        else if (d.delta.type === "input_json_delta") b._json += d.delta.partial_json;
      } else if (d.type === "content_block_stop") {
        const b = bloques[d.index];
        if (b && b.type === "tool_use") {
          try { b.input = b._json ? JSON.parse(b._json) : {}; } catch { b.input = {}; }
          delete b._json;
        }
      } else if (d.type === "message_delta") {
        if (d.delta?.stop_reason) stopReason = d.delta.stop_reason;
      } else if (d.type === "error") {
        throw new Error(d.error?.message || "Error del modelo");
      }
    }
  }
  return { content: bloques.filter(Boolean), stop_reason: stopReason };
}

// Respuestas fijas de los botones de inicio: salen al instante, sin gastar en la IA.
const OPCIONES: Record<string, { pregunta: string; respuesta: string }> = {
  idea: {
    pregunta: "Ayúdame con una idea que tengo",
    respuesta: "Claro, pégala aquí o, de preferencia, da clic en el micrófono que tienes aquí abajo y cuéntame tu idea.",
  },
  guion: {
    pregunta: "Ayúdame a generar un guión",
    respuesta: "Claro. Cuéntame de qué quieres que trate tu guion: pégalo aquí o, de preferencia, da clic en el micrófono que tienes aquí abajo y platícamelo.",
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "Usa POST." });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "JSON inválido." }); }

  const token = String(body.token ?? "").trim();
  if (!/^[A-Za-z0-9]{10,40}$/.test(token)) return json(400, { ok: false, error: "Link inválido." });
  const { data: cliente } = await supabase.from("clientes").select("id, nombre, videos_mes").eq("token", token).maybeSingle();
  if (!cliente) return json(404, { ok: false, error: "Link inválido o expirado." });

  const accion = String(body.accion ?? "enviar");

  if (accion === "historial") {
    const { data } = await supabase.from("guionista_mensajes").select("role, content, created_at")
      .eq("cliente_id", cliente.id).eq("archivado", false).order("created_at", { ascending: false }).limit(80);
    return json(200, { ok: true, mensajes: (data || []).reverse(), videos_mes: cliente.videos_mes || 12 });
  }

  if (accion === "registrar") {
    const op = OPCIONES[String(body.opcion ?? "")];
    if (!op) return json(400, { ok: false, error: "Opción inválida." });
    await supabase.from("guionista_mensajes").insert([
      { cliente_id: cliente.id, role: "user", content: op.pregunta },
      { cliente_id: cliente.id, role: "assistant", content: op.respuesta },
    ]);
    return json(200, { ok: true });
  }

  if (accion === "reiniciar") {
    await supabase.from("guionista_mensajes").update({ archivado: true }).eq("cliente_id", cliente.id).eq("archivado", false);
    return json(200, { ok: true });
  }

  if (!Deno.env.get("ANTHROPIC_API_KEY")) {
    return json(503, { ok: false, error: "El Guionista todavía no está activado. Escríbele a Level Producer." });
  }

  const mensaje = String(body.mensaje ?? "").trim();
  if (!mensaje) return json(400, { ok: false, error: "Escribe un mensaje." });
  if (mensaje.length > MAX_LARGO_MENSAJE) return json(400, { ok: false, error: "Tu mensaje es muy largo. Divídelo en partes." });

  const { anio, mes } = ahoraMx();
  const inicioMes = new Date(Date.UTC(anio, mes - 1, 1, 6)).toISOString(); // 00:00 en CDMX aprox.
  // Todo lo que se necesita de la base se pide al mismo tiempo para no hacer esperar.
  const [conteo, previosR, metodoR, contexto] = await Promise.all([
    supabase.from("guionista_mensajes").select("id", { count: "exact", head: true })
      .eq("cliente_id", cliente.id).eq("role", "user").gte("created_at", inicioMes),
    supabase.from("guionista_mensajes").select("role, content")
      .eq("cliente_id", cliente.id).eq("archivado", false)
      .order("created_at", { ascending: false }).limit(HISTORIAL_CONTEXTO),
    cargarMetodo().then((t) => t, () => ""),
    contextoCliente(cliente),
  ]);
  if ((conteo.count || 0) >= MAX_MENSAJES_MES) {
    return json(429, { ok: false, error: "Llegaste al límite de mensajes de este mes. Escríbele a Level Producer si necesitas más." });
  }
  if (!metodoR) return json(500, { ok: false, error: "El Guionista no está disponible. Intenta más tarde." });

  const historia = (previosR.data || []).reverse().map((m) => ({ role: m.role, content: m.content }));
  while (historia.length && historia[0].role !== "user") historia.shift();
  const system = [
    { type: "text", text: metodoR, cache_control: { type: "ephemeral" } },
    { type: "text", text: contexto },
  ];
  const messages: any[] = [...historia, { role: "user", content: mensaje }];
  const cifrado = new TextEncoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      const enviar = (obj: Record<string, unknown>) => ctrl.enqueue(cifrado.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let texto = "";
      const guardados: string[] = [];
      try {
        for (let i = 0; i < 4; i++) {
          if (texto && !texto.endsWith("\n")) { texto += "\n\n"; enviar({ t: "\n\n" }); }
          const resp = await llamarClaudeStream(system, messages, (t) => { texto += t; enviar({ t }); });
          const usos = resp.content.filter((b: any) => b.type === "tool_use");
          if (resp.stop_reason !== "tool_use" || !usos.length) break;
          messages.push({ role: "assistant", content: resp.content.filter((b: any) => !(b.type === "text" && !b.text.trim())) });
          const resultados = [];
          for (const u of usos) {
            const r = u.name === "guardar_guion" ? await guardarGuion(cliente.id, u.input || {}) : { ok: false, error: "Herramienta desconocida." };
            if ((r as any).ok) { guardados.push((r as any).folio); enviar({ guardado: (r as any).folio }); }
            resultados.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(r) });
          }
          messages.push({ role: "user", content: resultados });
        }
        texto = texto.trim();
        if (!texto) {
          texto = guardados.length ? `Listo, ya está en tu sistema como ${guardados.join(", ")}.` : "No tengo respuesta, ¿me lo repites?";
          enviar({ t: texto });
        }
        await supabase.from("guionista_mensajes").insert([
          { cliente_id: cliente.id, role: "user", content: mensaje },
          { cliente_id: cliente.id, role: "assistant", content: texto },
        ]);
        enviar({ fin: true, texto, guardados });
      } catch (e) {
        console.error("Guionista:", e);
        enviar({ error: "El Guionista no pudo responder. Intenta de nuevo en un momento." });
      }
      ctrl.close();
    },
  });
  return new Response(stream, {
    headers: { ...CORS, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
  });
});
