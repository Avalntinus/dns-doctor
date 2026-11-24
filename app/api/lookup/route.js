import { lookupType } from "@/lib/doh";
import { dmarcName } from "@/lib/dmarc";
import { isValidDomain, normalizeDomain } from "@/lib/domain";
import { buildReport } from "@/lib/verdict";

/** Cache in-memory per instance; di serverless ini best-effort saja. */
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;

/** Pembatas kasar supaya satu pengunjung tidak membanjiri resolver publik. */
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 1000;

/** @type {Map<string, { at: number, report: import("@/lib/types.js").Report }>} */
const cache = new Map();

/** @type {Map<string, { count: number, resetAt: number }>} */
const hits = new Map();

/**
 * @param {Request} request
 * @returns {string}
 */
function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "local";
}

/**
 * @param {string} ip
 * @returns {boolean}
 */
function takeToken(ip) {
  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

/**
 * @param {string} key
 */
function pruneCache(key) {
  if (cache.size <= CACHE_MAX) return;
  const oldest = cache.keys().next().value;
  if (oldest !== undefined && oldest !== key) cache.delete(oldest);
}

/**
 * GET /api/lookup?domain=example.com
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function GET(request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("domain") ?? "";
  const domain = normalizeDomain(raw);

  if (!isValidDomain(domain)) {
    return Response.json(
      {
        error:
          "Domain tidak valid. Masukkan nama domain seperti example.com (tanpa http:// dan tanpa path).",
      },
      { status: 400 },
    );
  }

  if (!takeToken(clientIp(request))) {
    return Response.json(
      { error: "Terlalu banyak permintaan. Tunggu satu menit lalu coba lagi." },
      { status: 429, headers: { "retry-after": "60" } },
    );
  }

  const cached = cache.get(domain);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return Response.json({ ...cached.report, cached: true });
  }

  const [A, AAAA, MX, TXT, NS, CAA, DMARC] = await Promise.all([
    lookupType(domain, "A"),
    lookupType(domain, "AAAA"),
    lookupType(domain, "MX"),
    lookupType(domain, "TXT"),
    lookupType(domain, "NS"),
    lookupType(domain, "CAA"),
    lookupType(dmarcName(domain), "TXT"),
  ]);

  const report = buildReport({
    domain,
    records: { A, AAAA, MX, TXT, NS, CAA, DMARC },
  });

  cache.set(domain, { at: Date.now(), report });
  pruneCache(domain);

  return Response.json(report, { headers: { "cache-control": "no-store" } });
}
