import "server-only";
import { NextResponse } from "next/server";
import { ConfigError } from "./env";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export const fail = (error: string, status = 400) => json({ error }, status);

/** Wraps a route: setup problems become a clear 503, anything else a logged 500. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ConfigError) return fail(`Server setup: ${e.message}`, 503);
      console.error(e);
      return fail("Something went wrong. Try again.", 500);
    }
  };
}
