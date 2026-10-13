import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError } from "zod";
import { service, HttpError } from "../server/service.ts";
export const config = { api: { bodyParser: false } };
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  const url = new URL(req.url || "", "http://local");
  const path =
    url.searchParams.get("path") || url.pathname.replace(/^\/api\/?/, "");
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers))
    if (value) headers.set(key, Array.isArray(value) ? value.join(",") : value);
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const b = Buffer.from(chunk);
      size += b.length;
      if (size > 128000) throw new HttpError(413, "Request too large.");
      chunks.push(b);
    }
    const value = await service({
      path,
      method: req.method || "GET",
      headers,
      raw: Buffer.concat(chunks).toString("utf8"),
    });
    res.statusCode = 200;
    res.end(JSON.stringify(value));
  } catch (error) {
    res.statusCode =
      error instanceof HttpError
        ? error.status
        : error instanceof ZodError || error instanceof SyntaxError
          ? 400
          : 500;
    res.end(
      JSON.stringify({
        error:
          error instanceof HttpError
            ? error.message
            : res.statusCode === 400
              ? "Please check the submitted details."
              : "Service temporarily unavailable.",
      }),
    );
  }
}
