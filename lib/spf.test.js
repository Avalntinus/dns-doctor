import { describe, expect, it } from "vitest";
import { findSpf, inspectSpf, parseSpf } from "./spf.js";

describe("findSpf", () => {
  it("menemukan record SPF di antara TXT lain", () => {
    const { record, count } = findSpf([
      "google-site-verification=abc",
      "v=spf1 include:_spf.google.com -all",
    ]);
    expect(record).toContain("include:_spf.google.com");
    expect(count).toBe(1);
  });

  it("menghitung duplikat", () => {
    const { count } = findSpf(["v=spf1 -all", "v=spf1 ~all"]);
    expect(count).toBe(2);
  });

  it("null saat tidak ada", () => {
    expect(findSpf(["v=DMARC1; p=none"]).record).toBeNull();
  });
});

describe("parseSpf", () => {
  it("menghitung semua mekanisme yang memicu lookup", () => {
    const parsed = parseSpf(
      "v=spf1 include:_spf.google.com a mx ptr exists:%{i}._spf.example.com redirect=_spf.example.com exp=explain.example.com -all",
    );
    expect(parsed.lookups).toBe(7);
    expect(parsed.allQualifier).toBe("-");
  });

  it("tidak menghitung ip4/ip6", () => {
    const parsed = parseSpf("v=spf1 ip4:192.0.2.0/24 ip6:2001:db8::/32 -all");
    expect(parsed.lookups).toBe(0);
    expect(parsed.allQualifier).toBe("-");
  });

  it("mengenali kualifier all", () => {
    expect(parseSpf("v=spf1 +all").allQualifier).toBe("+");
    expect(parseSpf("v=spf1 ?all").allQualifier).toBe("?");
    expect(parseSpf("v=spf1 ~all").allQualifier).toBe("~");
  });

  it("menandai token yang tidak dikenal", () => {
    const parsed = parseSpf("v=spf1 !!aneh -all");
    expect(parsed.mechanisms.some((mechanism) => mechanism.name === null)).toBe(true);
  });

  it("menangani spasi berlebih", () => {
    const parsed = parseSpf("v=spf1   mx   -all");
    expect(parsed.mechanisms.map((m) => m.name)).toEqual(["mx", "all"]);
  });
});

describe("inspectSpf", () => {
  it("ringkasan saat record tidak ada", () => {
    const result = inspectSpf([]);
    expect(result.present).toBe(false);
    expect(result.parsed).toBeNull();
  });

  it("ringkasan saat record ada", () => {
    const result = inspectSpf(["v=spf1 mx -all"]);
    expect(result.present).toBe(true);
    expect(result.duplicates).toBe(1);
    expect(result.parsed?.lookups).toBe(1);
  });
});
