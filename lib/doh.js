import { normalizeDomain } from "./domain.js";

/** @typedef {import("./types.js").ResolverId} ResolverId */
/** @typedef {import("./types.js").DohResult} DohResult */

export const RESOLVERS = {
  cloudflare: {
    label: "Cloudflare",
    endpoint: "https://cloudflare-dns.com/dns-query",
  },
  google: {
    label: "Google",
    endpoint: "https://dns.google/resolve",
  },
};

/** @type {ResolverId[]} */
export const RESOLVER_IDS = ["cloudflare", "google"];

/** Tipe record yang diperiksa di v1. */
export const RECORD_TYPES = ["A", "AAAA", "MX", "TXT", "NS", "CAA"];

/**
 * DoH JSON memakai field `Status` (rcode DNS), bukan HTTP status.
 * Kita simpan sebagai `rcode` supaya tidak tertukar.
 *
 * @param {ResolverId} resolver
 * @param {string} domain
 * @param {string} type
 * @returns {string}
 */
export function buildUrl(resolver, domain, type) {
  const config = RESOLVERS[resolver];
  if (!config) throw new Error(`Resolver tidak dikenal: ${resolver}`);
  const params = new URLSearchParams({ name: domain, type });
  // Cloudflare butuh penanda format JSON; Google mengabaikannya dengan aman.
  params.set("ct", "application/dns-json");
  return `${config.endpoint}?${params.toString()}`;
}

/**
 * Normalisasi jawaban DoH. Perbedaan penting yang ditangani:
 * - Google menjawab nama dengan titik akhir ("example.com."), Cloudflare tanpa.
 * - `Answer` tidak ada untuk NODATA, jadi tidak boleh diasumsikan array.
 *
 * @param {any} json
 * @param {ResolverId} resolver
 * @returns {DohResult}
 */
export function normalizeResponse(json, resolver) {
  const answers = Array.isArray(json?.Answer)
    ? json.Answer.map((answer) => ({
        name: normalizeDomain(answer?.name ?? ""),
        type: Number(answer?.type ?? 0),
        TTL: Number(answer?.TTL ?? 0),
        data: String(answer?.data ?? ""),
      }))
    : [];

  return {
    resolver,
    rcode: Number.isInteger(json?.Status) ? json.Status : -1,
    ad: json?.AD === true,
    answers,
  };
}

/**
 * Query satu resolver. Error jaringan/HTTP dilempar ke pemanggil.
 *
 * @param {ResolverId} resolver
 * @param {string} domain
 * @param {string} type
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<DohResult>}
 */
export async function queryResolver(resolver, domain, type, options = {}) {
  const { fetchImpl = fetch, timeoutMs = 5000 } = options;
  const clean = normalizeDomain(domain);
  if (!clean) throw new Error("Domain kosong");

  const response = await fetchImpl(buildUrl(resolver, clean, type), {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`DoH ${resolver} menjawab HTTP ${response.status}`);
  }

  const json = await response.json();
  return normalizeResponse(json, resolver);
}

/**
 * Query semua resolver untuk satu tipe record. Satu resolver gagal
 * tidak boleh menggagalkan seluruh laporan.
 *
 * @param {string} domain
 * @param {string} type
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<DohResult[]>}
 */
export async function lookupType(domain, type, options = {}) {
  const settled = await Promise.allSettled(
    RESOLVER_IDS.map((resolver) =>
      queryResolver(resolver, domain, type, options),
    ),
  );

  return settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const reason = result.reason;
    return {
      resolver: RESOLVER_IDS[index],
      rcode: -1,
      ad: false,
      answers: [],
      error: reason instanceof Error ? reason.message : String(reason),
    };
  });
}
