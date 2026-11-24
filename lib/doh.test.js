import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildUrl, lookupType, normalizeResponse, queryResolver } from "./doh.js";

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), "utf8"));

const cfA = fixture("cf-a.json");
const googleA = fixture("google-a.json");
const cfNxdomain = fixture("cf-nxdomain.json");
const cfNodata = fixture("cf-nodata.json");

describe("buildUrl", () => {
  it("memakai endpoint dan parameter yang benar", () => {
    const url = buildUrl("cloudflare", "example.com", "MX");
    expect(url.startsWith("https://cloudflare-dns.com/dns-query?")).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get("name")).toBe("example.com");
    expect(params.get("type")).toBe("MX");
    expect(params.get("ct")).toBe("application/dns-json");
  });

  it("meng-encode nama aneh", () => {
    const url = buildUrl("google", "_dmarc.example.com", "TXT");
    expect(url).toContain("name=_dmarc.example.com");
    expect(new URL(url).searchParams.get("name")).toBe("_dmarc.example.com");
  });

  it("menolak resolver tak dikenal", () => {
    expect(() => buildUrl("quad9", "example.com", "A")).toThrow(/tidak dikenal/i);
  });
});

describe("normalizeResponse", () => {
  it("menormalkan nama dari Cloudflare", () => {
    const result = normalizeResponse(cfA, "cloudflare");
    expect(result.rcode).toBe(0);
    expect(result.ad).toBe(true);
    expect(result.answers).toHaveLength(2);
    expect(result.answers[0].name).toBe("cloudflare.com");
  });

  it("membuang titik akhir yang ditambahkan Google", () => {
    const result = normalizeResponse(googleA, "google");
    expect(result.answers).toHaveLength(2);
    expect(result.answers.every((answer) => !answer.name.endsWith("."))).toBe(true);
    expect(result.answers[0].name).toBe("cloudflare.com");
  });

  it("tidak meledak saat Answer tidak ada (NODATA)", () => {
    const result = normalizeResponse(cfNodata, "cloudflare");
    expect(result.rcode).toBe(0);
    expect(result.answers).toEqual([]);
  });

  it("meneruskan rcode NXDOMAIN", () => {
    expect(normalizeResponse(cfNxdomain, "cloudflare").rcode).toBe(3);
  });

  it("memberi nilai aman untuk jawaban rusak", () => {
    const result = normalizeResponse({}, "google");
    expect(result.rcode).toBe(-1);
    expect(result.ad).toBe(false);
    expect(result.answers).toEqual([]);
  });
});

describe("queryResolver", () => {
  it("mengirim header JSON dan mengembalikan hasil ternormalisasi", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => cfA,
    }));

    const result = await queryResolver("cloudflare", "https://cloudflare.com/x", "A", {
      fetchImpl,
    });

    expect(result.answers).toHaveLength(2);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(new URL(url).searchParams.get("name")).toBe("cloudflare.com");
    expect(init.headers.accept).toBe("application/dns-json");
  });

  it("melempar error saat HTTP gagal", async () => {
    const fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({}) });
    await expect(
      queryResolver("google", "example.com", "A", { fetchImpl }),
    ).rejects.toThrow(/HTTP 429/);
  });
});

describe("lookupType", () => {
  it("tetap memberi hasil saat satu resolver gagal", async () => {
    const fetchImpl = async (url) => {
      if (new URL(url).hostname === "cloudflare-dns.com") throw new Error("network down");
      return { ok: true, status: 200, json: async () => googleA };
    };

    const results = await lookupType("cloudflare.com", "A", { fetchImpl });
    expect(results).toHaveLength(2);

    const cloudflare = results.find((result) => result.resolver === "cloudflare");
    const google = results.find((result) => result.resolver === "google");
    expect(cloudflare.error).toMatch(/network down/);
    expect(cloudflare.answers).toEqual([]);
    expect(google.error).toBeUndefined();
    expect(google.answers).toHaveLength(2);
  });
});
