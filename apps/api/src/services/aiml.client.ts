/**
 * Typed client for the Python AIML service. Forwards the inbound
 * Authorization header from Hono so a single Auth0 token round-trips
 * end-to-end.
 *
 * Retries on 5xx with exponential backoff (3 attempts, 200/600/1800 ms).
 * Streaming endpoints (`/v1/rag/query`) return the raw Response so the
 * caller can pipe SSE chunks straight to the client.
 */

const DEFAULT_TIMEOUT_MS = 60_000;
const STREAM_TIMEOUT_MS = 120_000;
const RETRY_DELAYS_MS = [200, 600, 1800];

export interface AimlClientOptions {
  baseUrl?: string;
  authorization?: string | null;
  timeoutMs?: number;
}

export class AimlServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "AimlServiceError";
  }
}

function getBaseUrl(opts: AimlClientOptions | undefined): string {
  const url = opts?.baseUrl ?? process.env.AIML_SERVICE_URL ?? "http://localhost:8000";
  return url.replace(/\/+$/, "");
}

function buildHeaders(opts: AimlClientOptions | undefined, extra: Record<string, string> = {}): Headers {
  const headers = new Headers(extra);
  if (opts?.authorization) {
    headers.set("Authorization", opts.authorization);
  }
  return headers;
}

async function readErrorEnvelope(resp: Response): Promise<AimlServiceError> {
  let code = "upstream_error";
  let message = `aiml service returned ${resp.status}`;
  let requestId: string | undefined;
  try {
    const body = (await resp.json()) as { error?: { code?: string; message?: string; requestId?: string } };
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      requestId = body.error.requestId;
    }
  } catch {
    // body wasn't JSON — keep defaults
  }
  return new AimlServiceError(resp.status, code, message, requestId);
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      // Retry only on transient 5xx; pass through 4xx + 200.
      if (resp.status >= 500 && resp.status <= 599 && attempt < RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        continue;
      }
      return resp;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        continue;
      }
    }
  }
  throw new AimlServiceError(
    502,
    "upstream_error",
    `aiml service unreachable: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

export interface RagQueryBody {
  query: string;
  top_k?: number;
  filter?: Record<string, unknown> | null;
}

export interface RagIngestBody {
  documents: Array<{ id: string; text: string; metadata?: Record<string, unknown> }>;
}

/**
 * POST /v1/rag/query — returns the raw streaming Response so the caller
 * can pipe SSE chunks to the client without buffering.
 */
export async function ragQuery(body: RagQueryBody, opts?: AimlClientOptions): Promise<Response> {
  const url = `${getBaseUrl(opts)}/v1/rag/query`;
  const headers = buildHeaders(opts, { "Content-Type": "application/json", Accept: "text/event-stream" });
  const resp = await fetchWithRetry(
    url,
    { method: "POST", headers, body: JSON.stringify(body) },
    opts?.timeoutMs ?? STREAM_TIMEOUT_MS,
  );
  if (!resp.ok) {
    throw await readErrorEnvelope(resp);
  }
  return resp;
}

export interface RagIngestResponse {
  ingested: number;
  nodes: number;
}

export async function ragIngest(
  body: RagIngestBody,
  opts?: AimlClientOptions,
): Promise<RagIngestResponse> {
  const url = `${getBaseUrl(opts)}/v1/rag/ingest`;
  const headers = buildHeaders(opts, { "Content-Type": "application/json" });
  const resp = await fetchWithRetry(
    url,
    { method: "POST", headers, body: JSON.stringify(body) },
    opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  if (!resp.ok) {
    throw await readErrorEnvelope(resp);
  }
  return (await resp.json()) as RagIngestResponse;
}

/**
 * POST /v1/document/analyze — multipart upload pass-through. Accepts the
 * inbound Request so headers + body are forwarded verbatim.
 *
 * `inboundBody` is typed as ArrayBuffer (the canonical shape Hono returns
 * from c.req.arrayBuffer()) so this works without DOM lib types — fetch's
 * RequestInit.body accepts ArrayBuffer at runtime.
 */
export async function documentAnalyze(
  inboundBody: ArrayBuffer | Uint8Array | string,
  contentType: string,
  opts?: AimlClientOptions,
): Promise<Response> {
  const url = `${getBaseUrl(opts)}/v1/document/analyze`;
  const headers = buildHeaders(opts, { "Content-Type": contentType });
  const resp = await fetchWithRetry(
    url,
    { method: "POST", headers, body: inboundBody },
    opts?.timeoutMs ?? 300_000,
  );
  if (!resp.ok) {
    throw await readErrorEnvelope(resp);
  }
  return resp;
}

/**
 * Generic streaming proxy. Returns the raw upstream Response so the caller
 * can pipe SSE chunks straight to the browser. Use for POST endpoints that
 * the AIML service streams (`/v1/rag/query`, `/v1/agents/run`).
 */
export async function streamProxy(
  path: string,
  jsonBody: unknown,
  opts?: AimlClientOptions,
): Promise<Response> {
  const url = `${getBaseUrl(opts)}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = buildHeaders(opts, {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  });
  const resp = await fetchWithRetry(
    url,
    { method: "POST", headers, body: JSON.stringify(jsonBody) },
    opts?.timeoutMs ?? STREAM_TIMEOUT_MS,
  );
  if (!resp.ok) {
    throw await readErrorEnvelope(resp);
  }
  return resp;
}

// ---------- Agentic endpoints ---------------------------------------------

export interface AgentRunBody {
  message: string;
  conversationId?: string | null;
  topK?: number;
  maxIterations?: number;
}

export async function agentRun(
  body: AgentRunBody,
  opts?: AimlClientOptions,
): Promise<Response> {
  return streamProxy("/v1/agents/run", body, opts);
}

export interface AimlMessage {
  id: string;
  role: string;
  content: string;
  toolCalls: unknown[] | null;
  toolResults: unknown[] | null;
  tokensIn: number;
  tokensOut: number;
  createdAt: string;
}

export interface AimlConversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AimlMessage[];
}

export async function createConversation(
  body: { title?: string; metadata?: Record<string, unknown> },
  opts?: AimlClientOptions,
): Promise<{ id: string; title: string | null; createdAt: string }> {
  const url = `${getBaseUrl(opts)}/v1/conversations`;
  const headers = buildHeaders(opts, { "Content-Type": "application/json" });
  const resp = await fetchWithRetry(
    url,
    { method: "POST", headers, body: JSON.stringify(body) },
    opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  if (!resp.ok) {
    throw await readErrorEnvelope(resp);
  }
  return (await resp.json()) as { id: string; title: string | null; createdAt: string };
}

export async function getConversation(
  conversationId: string,
  opts?: AimlClientOptions,
): Promise<AimlConversation> {
  const url = `${getBaseUrl(opts)}/v1/conversations/${encodeURIComponent(conversationId)}`;
  const headers = buildHeaders(opts);
  const resp = await fetchWithRetry(
    url,
    { method: "GET", headers },
    opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  if (!resp.ok) {
    throw await readErrorEnvelope(resp);
  }
  return (await resp.json()) as AimlConversation;
}
