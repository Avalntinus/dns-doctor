import { describe, expect, it } from "vitest";
import { buildReport, summarize } from "./verdict.js";

const ans = (data, type = 1, TTL = 300) => ({
  name: "example.com",
  type,
  TTL,
  data,
});

const res = (resolver, answers, { rcode = 0, ad = true } = {}) => ({
  resolver,
  rcode,
  ad,
  answers,
});

/**
 * Membangun records lengkap dengan nilai default yang sehat, lalu
 * ditimpa sesuai kebutuhan tiap tes.
 *
 * @param {Record<string, any>} [overrides]
 */
function makeRecords(overrides = {}) {
  const both = (answers, options) => [
    res("cloudflare", answers, options),
    res("google", answers, options),
  ];

  const values = {
    A: ["192.0.2.10"],
    AAAA: ["2001:db8::10"],
    MX: ["10 mail.example.com."],
    TXT: ["v=spf1 mx -all"],
    NS: ["ns1.example.com.", "ns2.example.com."],
    CAA: ['0 issue "letsencrypt.org"'],
    DMARC: ["v=DMARC1; p=reject; rua=mailto:dmarc@example.com"],
    ...overrides,
  };

  /** @type {Record<string, any[]>} */
  const records = {};
  for (const [type, data] of Object.entries(values)) {
    if (data === null) {
      records[type] = both([]);
      continue;
    }
    const typed = type === "TXT" || type === "DMARC" ? 16 : type === "MX" ? 15 : type === "NS" ? 2 : type === "CAA" ? 257 : type === "AAAA" ? 28 : 1;
    records[type] = both(data.map((value) => ans(value, typed)));
  }
  return records;
}

const makeReport = (overrides, domain = "example.com") =>
  buildReport({ domain, records: makeRecords(overrides) });

describe("buildReport — domain sehat", () => {
  it("tidak menghasilkan FAIL maupun WARN", () => {
    const report = makeReport();
    expect(report.findings.filter((f) => f.verdict === "FAIL")).toEqual([]);
    expect(report.findings.filter((f) => f.verdict === "WARN")).toEqual([]);
    expect(report.summary.fail).toBe(0);
    expect(report.summary.warn).toBe(0);
    expect(report.summary.ok).toBe(report.findings.length);
  });

  it("memuat semua grup yang dijanjikan", () => {
    const groups = new Set(makeReport().findings.map((finding) => finding.group));
    expect(groups).toEqual(
      new Set(["alamat", "email", "otoritas", "keamanan", "propagasi"]),
    );
  });

  it("tidak punya id ganda", () => {
    const ids = makeReport().findings.map((finding) => finding.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("menyertakan data mentah untuk tombol copy JSON", () => {
    const report = makeReport();
    expect(report.raw.A).toHaveLength(2);
    expect(report.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("buildReport — domain tanpa email", () => {
  const report = makeReport({ MX: [], TXT: [], DMARC: [] });

  it("memberi WARN untuk MX, SPF, dan DMARC", () => {
    for (const id of ["mx", "spf", "dmarc"]) {
      const finding = report.findings.find((item) => item.id === id);
      expect(finding?.verdict).toBe("WARN");
      expect(finding?.reason.length).toBeGreaterThan(10);
    }
  });

  it("tetap tidak FAIL karena domain bisa saja tidak menerima email", () => {
    expect(report.summary.fail).toBe(0);
  });
});

describe("buildReport — NXDOMAIN", () => {
  it("berhenti dengan satu FAIL yang jelas", () => {
    const records = makeRecords();
    records.A = [res("cloudflare", [], { rcode: 3 }), res("google", [], { rcode: 3 })];
    const report = buildReport({ domain: "tidak-ada.example", records });

    expect(report.summary.fail).toBe(1);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].reason).toMatch(/NXDOMAIN/);
    expect(report.summary.ok).toBe(0);
  });
});

describe("buildReport — SPF", () => {
  it("menandai +all sebagai FAIL", () => {
    const report = makeReport({ TXT: ["v=spf1 +all"] });
    expect(report.findings.find((f) => f.id === "spf")?.verdict).toBe("FAIL");
  });

  it("menandai ?all sebagai WARN", () => {
    const report = makeReport({ TXT: ["v=spf1 mx ?all"] });
    expect(report.findings.find((f) => f.id === "spf")?.verdict).toBe("WARN");
  });

  it("menandai lookup berlebih sebagai FAIL", () => {
    const includes = Array.from({ length: 11 }, (_, i) => `include:_spf${i}.example.com`);
    const report = makeReport({ TXT: [`v=spf1 ${includes.join(" ")} -all`] });
    expect(report.findings.find((f) => f.id === "spf")?.verdict).toBe("FAIL");
  });

  it("menandai dua record SPF sebagai FAIL", () => {
    const report = makeReport({ TXT: ["v=spf1 mx -all", "v=spf1 ip4:192.0.2.1 -all"] });
    expect(report.findings.find((f) => f.id === "spf")?.verdict).toBe("FAIL");
  });
});

describe("buildReport — DMARC", () => {
  it("menandai p=none sebagai WARN", () => {
    const report = makeReport({ DMARC: ["v=DMARC1; p=none"] });
    expect(report.findings.find((f) => f.id === "dmarc")?.verdict).toBe("WARN");
  });

  it("menandai pct di bawah 100 sebagai WARN", () => {
    const report = makeReport({ DMARC: ["v=DMARC1; p=quarantine; pct=25"] });
    const finding = report.findings.find((f) => f.id === "dmarc");
    expect(finding?.verdict).toBe("WARN");
    expect(finding?.value).toContain("pct=25");
  });
});

describe("buildReport — MX null", () => {
  it("menerima MX 0 . sebagai keputusan sah", () => {
    const report = makeReport({ MX: ["0 ."] });
    expect(report.findings.find((f) => f.id === "mx")?.verdict).toBe("OK");
  });
});

describe("buildReport — propagasi", () => {
  it("menandai resolver yang tidak sepakat", () => {
    const records = makeRecords();
    records.A = [
      res("cloudflare", [ans("192.0.2.10")]),
      res("google", [ans("198.51.100.7")]),
    ];
    const report = buildReport({ domain: "example.com", records });
    const finding = report.findings.find((f) => f.id === "propagasi-A");
    expect(finding?.verdict).toBe("WARN");
  });
});

describe("buildReport — DNSSEC & kegagalan resolver", () => {
  it("tidak menandai TXT yang hanya beda kutip", () => {
    const records = makeRecords();
    records.TXT = [
      res("cloudflare", [ans('"v=spf1 mx -all"', 16)]),
      res("google", [ans("v=spf1 mx -all", 16)]),
    ];
    const report = buildReport({ domain: "example.com", records });
    expect(report.findings.find((f) => f.id === "propagasi-TXT")).toBeUndefined();
  });

  it("WARN saat DNSSEC tidak aktif", () => {
    const records = makeRecords();
    for (const key of Object.keys(records)) {
      records[key] = records[key].map((item) => ({ ...item, ad: false }));
    }
    const report = buildReport({ domain: "example.com", records });
    expect(report.findings.find((f) => f.id === "dnssec")?.verdict).toBe("WARN");
  });

  it("FAIL saat tidak ada resolver yang bisa dihubungi", () => {
    const records = makeRecords();
    records.A = [
      { resolver: "cloudflare", rcode: -1, ad: false, answers: [], error: "timeout" },
      { resolver: "google", rcode: -1, ad: false, answers: [], error: "timeout" },
    ];
    const report = buildReport({ domain: "example.com", records });
    expect(report.findings.find((f) => f.id === "a")?.verdict).toBe("FAIL");
  });
});

describe("summarize", () => {
  it("menghitung verdict", () => {
    expect(
      summarize([
        { verdict: "OK" },
        { verdict: "OK" },
        { verdict: "WARN" },
        { verdict: "FAIL" },
      ]),
    ).toEqual({ ok: 2, warn: 1, fail: 1 });
  });
});
