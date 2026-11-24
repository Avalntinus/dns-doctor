import { describe, expect, it } from "vitest";
import { dmarcName, findDmarc, inspectDmarc, parseDmarc } from "./dmarc.js";

describe("dmarcName", () => {
  it("menambahkan prefix _dmarc", () => {
    expect(dmarcName("example.com")).toBe("_dmarc.example.com");
  });
});

describe("findDmarc", () => {
  it("menemukan record yang valid", () => {
    expect(findDmarc(["v=DMARC1; p=reject"])).toBe("v=DMARC1; p=reject");
  });

  it("mengabaikan TXT lain", () => {
    expect(findDmarc(["v=spf1 -all", "abc"])).toBeNull();
  });
});

describe("parseDmarc", () => {
  it("membaca tag penting", () => {
    const parsed = parseDmarc(
      "v=DMARC1; p=reject; sp=quarantine; pct=100; rua=mailto:dmarc@example.com; adkim=s",
    );
    expect(parsed?.policy).toBe("reject");
    expect(parsed?.subdomainPolicy).toBe("quarantine");
    expect(parsed?.pct).toBe(100);
    expect(parsed?.rua).toBe("mailto:dmarc@example.com");
    expect(parsed?.adkim).toBe("s");
  });

  it("memberi default saat tag opsional tidak ada", () => {
    const parsed = parseDmarc("v=DMARC1; p=none");
    expect(parsed?.pct).toBe(100);
    expect(parsed?.adkim).toBe("r");
    expect(parsed?.aspf).toBe("r");
    expect(parsed?.rua).toBeNull();
  });

  it("membaca pct sebagian", () => {
    expect(parseDmarc("v=DMARC1; p=quarantine; pct=25")?.pct).toBe(25);
  });

  it("null untuk record kosong", () => {
    expect(parseDmarc(null)).toBeNull();
  });
});

describe("inspectDmarc", () => {
  it("menandai tidak ada", () => {
    const result = inspectDmarc([]);
    expect(result.present).toBe(false);
    expect(result.parsed).toBeNull();
  });

  it("menandai ada", () => {
    const result = inspectDmarc(["v=DMARC1; p=reject"]);
    expect(result.present).toBe(true);
    expect(result.parsed?.policy).toBe("reject");
  });
});
