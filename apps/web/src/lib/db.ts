import { neon } from "@neondatabase/serverless";

/**
 * Neon access for the hosted control plane.
 *
 * The connection string comes from the Vercel integration. When it is missing the
 * app falls back to demo data, so the public view never breaks and nobody needs
 * a database to look at the product.
 */
export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

export function sql(): ReturnType<typeof neon> {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("No database configured");
  }
  return neon(url);
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const rows = await sql().query(text, params);
  return rows as T[];
}
