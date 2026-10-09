import { HttpRequest, buildQueryString } from "@smithy/core/protocols";
import { FetchHttpHandler } from "@smithy/fetch-http-handler";
import type { CronBudget } from "./cron-budget";

type HandlerOptions = NonNullable<Parameters<FetchHttpHandler["handle"]>[1]>;
// 保留Fetch的20次重定向上限；一个Cron操作最多21个HTTP请求，不能把SDK调用数当作请求数。
const MAX_REDIRECTS = 20;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class CronS3HttpHandler extends FetchHttpHandler {
  constructor(private readonly budget: CronBudget, private readonly timeoutMs: number) {
    super({ cache: "no-store", requestInit: () => ({ redirect: "manual" }) });
  }

  override async handle(request: HttpRequest, options: HandlerOptions = {}) {
    const startedAt = Date.now();
    const timeout = options.requestTimeout ?? this.timeoutMs;
    let current = request;
    for (let redirects = 0; ; redirects++) {
      const remaining = timeout - (Date.now() - startedAt);
      if (timeout > 0 && remaining <= 0) throw Object.assign(new Error("S3 request timed out"), { name: "TimeoutError" });
      if (options.abortSignal?.aborted) throw Object.assign(new Error("S3 request aborted"), { name: "AbortError" });
      this.budget.consumeExternalRequest();
      // 每跳继续使用SDK官方的Request/Response转换及no-store；超时覆盖整条链，不在重定向后重置。
      const result = await super.handle(current, { ...options, requestTimeout: timeout > 0 ? remaining : 0 });
      const { statusCode, headers } = result.response;
      const location = headers["location"];
      if (!REDIRECT_STATUSES.has(statusCode) || location === undefined) return result;
      const body: unknown = result.response.body;
      if (body instanceof ReadableStream) await body.cancel();
      if (redirects === MAX_REDIRECTS) throw new TypeError("Too many S3 redirects");
      const query = buildQueryString(current.query ?? {});
      const url = new URL(`${current.protocol}//${current.hostname}${current.port ? `:${current.port}` : ""}${current.path}${query ? `?${query}` : ""}`);
      let next: URL;
      try { next = new URL(location, url); } catch { throw new TypeError("Invalid S3 redirect URL"); }
      if ((next.protocol !== "https:" && next.protocol !== "http:") || next.username || next.password) throw new TypeError("Invalid S3 redirect URL");
      current = HttpRequest.clone(current);
      // 当前部署的workerd在跨源重定向时剥离Authorization；不能因手动逐跳计数扩大凭据转发范围。
      if (next.origin !== url.origin) {
        for (const name of Object.keys(current.headers)) if (name.toLowerCase() === "authorization") delete current.headers[name];
      }
      current.protocol = next.protocol;
      current.hostname = next.hostname;
      if (next.port) current.port = Number(next.port);
      else delete current.port;
      // 已由URL解析的Location保持原始query编码，不把签名URL再拆解/排序。
      current.path = next.pathname + next.search;
      current.query = {};
      current.fragment = next.hash.slice(1);
      if (statusCode !== 303 && current.body instanceof ReadableStream) throw new TypeError("Cannot redirect a streaming S3 body");
      if (((statusCode === 301 || statusCode === 302) && current.method === "POST") || (statusCode === 303 && current.method !== "GET" && current.method !== "HEAD")) {
        current.method = "GET";
        current.body = undefined;
        // workerd切为GET时保留Content-*；保持现有provider语义，正文长度由fetch按实际body处理。
      }
    }
  }
}
