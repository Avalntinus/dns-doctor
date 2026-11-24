import { describe, expect, it } from "vitest";
import { isValidDomain, normalizeDomain } from "./domain.js";

describe("normalizeDomain", () => {
  it("membuang skema, path, dan query", () => {
    expect(normalizeDomain("https://example.com/blog?x=1#top")).toBe("example.com");
    expect(normalizeDomain("HTTP://Example.COM")).toBe("example.com");
  });

  it("membuang port dan titik akhir", () => {
    expect(normalizeDomain("example.com:8443.")).toBe("example.com");
  });

  it("membuang userinfo", () => {
    expect(normalizeDomain("https://user:pass@mail.example.com/")).toBe("mail.example.com");
  });

  it("merapikan spasi", () => {
    expect(normalizeDomain("  example.com  ")).toBe("example.com");
  });

  it("aman untuk input kosong", () => {
    expect(normalizeDomain("")).toBe("");
    expect(normalizeDomain(undefined)).toBe("");
  });
});

describe("isValidDomain", () => {
  it("menerima domain wajar", () => {
    expect(isValidDomain("example.com")).toBe(true);
    expect(isValidDomain("mail.kantor.co.id")).toBe(true);
    expect(isValidDomain("xn--bcher-kva.example")).toBe(true);
    expect(isValidDomain("a-b.example")).toBe(true);
  });

  it("menolak yang bukan domain", () => {
    expect(isValidDomain("")).toBe(false);
    expect(isValidDomain("localhost")).toBe(false);
    expect(isValidDomain("example")).toBe(false);
    expect(isValidDomain("example..com")).toBe(false);
    expect(isValidDomain("_dmarc.example.com")).toBe(false);
    expect(isValidDomain("-example.com")).toBe(false);
    expect(isValidDomain("example-.com")).toBe(false);
    expect(isValidDomain("contoh domain.com")).toBe(false);
    expect(isValidDomain(`${"a".repeat(64)}.com`)).toBe(false);
  });
});
