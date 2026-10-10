import { createHash } from "node:crypto";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function ipHashFrom(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers.get("x-real-ip") ?? "local";
  return sha256((process.env.IP_HASH_SALT ?? "dev-salt") + fwd).slice(0, 32);
}

/** Remove emails and phone-like numbers before anything user-written is stored. */
export function scrubPii(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]")
    .replace(/(?<!\d)(?:\+?\d[\s-]?){9,14}\d(?!\d)/g, "[phone]");
}

export function clip(text: string, n: number): string {
  return text.length > n ? text.slice(0, n - 1) + "…" : text;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
