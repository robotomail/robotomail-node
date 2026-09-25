import { createHmac, timingSafeEqual } from "node:crypto";

export interface ClientOptions {
  apiKey?: string;
  /** Include /v1. HTTP is supported only for loopback development servers. */
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}
export interface RequestOptions { signal?: AbortSignal; timeoutMs?: number }
export interface Upload { data: Blob | Uint8Array; filename: string; contentType?: string }
export interface EventFrame { id?: string; event: string; data: string }

export class ApiError extends Error {
  readonly code?: string;
  constructor(readonly status: number, readonly body: unknown, readonly headers: Headers) {
    const object = body && typeof body === "object" ? body as Record<string, unknown> : {};
    super(typeof object.error === "string" ? object.error : `Robotomail HTTP ${status}`);
    this.name = "ApiError";
    this.code = typeof object.code === "string" ? object.code : undefined;
  }
}

/** Pass the original request bytes before parsing JSON. Empty/malformed signatures fail closed. */
export function verifyWebhook(payload: string | Uint8Array, signature: string, secret: string): boolean {
  if (!secret || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(payload).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export class Transport {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof globalThis.fetch;
  constructor(options: ClientOptions = {}) {
    const url = new URL(options.baseUrl ?? "https://api.robotomail.com/v1");
    if (url.username || url.password || url.search || url.hash ||
        !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
      throw new TypeError("baseUrl must be HTTPS, or HTTP on localhost, without credentials, query or fragment");
    }
    this.baseUrl = url.toString().replace(/\/$/, "");
    this.apiKey = options.apiKey ?? process.env.ROBOTOMAIL_API_KEY;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    if (!(this.timeoutMs > 0)) throw new TypeError("timeoutMs must be positive");
    this.fetcher = options.fetch ?? globalThis.fetch;
  }
  protected segment(value: string): string {
    if (!value || value === "." || value === "..") throw new TypeError("Resource IDs must be nonempty path segments");
    return encodeURIComponent(value);
  }
  private prepare(path: string, params?: object, streaming = false): [URL, Headers] {
    const url = new URL(this.baseUrl + path);
    const headers = new Headers({ Accept: streaming ? "text/event-stream" : "application/json", "User-Agent": "robotomail-node/0.2.0" });
    if (this.apiKey) headers.set("Authorization", `Bearer ${this.apiKey}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === null) continue;
      if (key === "Last-Event-ID") headers.set(key, String(value));
      else url.searchParams.set(key, String(value));
    }
    return [url, headers];
  }
  private signal(options: RequestOptions, streaming = false): AbortSignal {
    // Streaming uses a longer overall deadline. The caller may abort or reopen with the last event ID.
    const timeout = options.timeoutMs ?? (streaming ? Math.max(this.timeoutMs, 360_000) : this.timeoutMs);
    if (!(timeout > 0)) throw new TypeError("timeoutMs must be positive");
    const deadline = AbortSignal.timeout(timeout);
    return options.signal ? AbortSignal.any([deadline, options.signal]) : deadline;
  }
  private async decode(response: Response): Promise<unknown> {
    const text = await response.text();
    let body: unknown;
    try { body = text ? JSON.parse(text) : null; }
    catch {
      if (response.ok) throw new Error("Robotomail returned invalid JSON");
      body = text;
    }
    if (!response.ok) throw new ApiError(response.status, body, response.headers);
    return body;
  }
  protected async request<T>(method: string, path: string, body: unknown, params: object | undefined, options: RequestOptions, file?: Upload): Promise<T> {
    const [url, headers] = this.prepare(path, params);
    let encoded: BodyInit | undefined;
    if (file) {
      if (/[\r\n]/.test(file.filename + (file.contentType ?? ""))) throw new TypeError("Invalid filename or content type");
      const data = file.data instanceof Blob ? file.data.slice(0, file.data.size, file.contentType ?? file.data.type) : new Blob([new Uint8Array(file.data)], { type: file.contentType ?? "application/octet-stream" });
      if (data.size > 25 * 1024 * 1024) throw new RangeError("Attachments must be at most 25 MB");
      const form = new FormData();
      form.set("file", data, file.filename);
      encoded = form;
    } else if (body !== undefined) {
      headers.set("Content-Type", "application/json");
      encoded = JSON.stringify(body);
    }
    // Deliberately one request: an ambiguous send failure must not trigger another email.
    const response = await this.fetcher(url, { method, headers, body: encoded, signal: this.signal(options), redirect: "manual" });
    return await this.decode(response) as T;
  }
  protected async *stream(params: object | undefined, options: RequestOptions): AsyncGenerator<EventFrame> {
    const [url, headers] = this.prepare("/events", params, true);
    const response = await this.fetcher(url, { headers, signal: this.signal(options, true), redirect: "manual" });
    if (!response.ok) { await this.decode(response); return; }
    if (!response.headers.get("content-type")?.startsWith("text/event-stream") || !response.body) {
      await response.body?.cancel();
      throw new Error("Robotomail returned a non-SSE response");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", data: string[] = [], event = "message", id: string | undefined;
    const line = (value: string): EventFrame | undefined => {
      if (value === "") {
        const frame = data.length ? { id, event, data: data.join("\n") } : undefined;
        data = []; event = "message";
        return frame;
      }
      const index = value.indexOf(":");
      const key = index < 0 ? value : value.slice(0, index);
      const val = index < 0 ? "" : value.slice(index + 1).replace(/^ /, "");
      if (key === "data") data.push(val);
      if (key === "event") event = val;
      if (key === "id" && !val.includes("\0")) id = val;
      return undefined;
    };
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        if (buffer.length + data.reduce((n, s) => n + s.length, 0) > 1024 * 1024) throw new Error("SSE event exceeds 1 MB");
        while (true) {
          const match = /\r\n|\r|\n/.exec(buffer);
          if (!match || (match[0] === "\r" && match.index === buffer.length - 1)) break;
          const value = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);
          const frame = line(value);
          if (frame) yield frame;
        }
      }
      // Incomplete events at EOF are discarded, as required by the SSE wire format.
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}
