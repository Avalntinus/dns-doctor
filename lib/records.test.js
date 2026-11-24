import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareResolvers,
  findTxt,
  rcodeSummary,
  txtValues,
  unquoteTxt,
  uniqueValues,
} from "./records.js";

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), "utf8"));

const answer = (data, TTL = 300, type = 16) => ({
  name: "example.com",
  type,
  TTL,
  data,
});

const result = (resolver, answers, rcode = 0, ad = false) => ({
  resolver,
  rcode,
  ad,
  answers,
});

describe("unquoteTxt", () => {
  it("membuka kutip tunggal", () => {
    expect(unquoteTxt('"v=spf1 -all"')).toBe("v=spf1 -all");
  });

  it("menggabungkan string yang terpecah", () => {
    expect(unquoteTxt('"bagian1" "bagian2"')).toBe("bagian1bagian2");
  });

  it("mengembalikan escape", () => {
    expect(unquoteTxt('"a \\"kutip\\" b"')).toBe('a "kutip" b');
  });

  it("membiarkan teks tanpa kutip", () => {
    expect(unquoteTxt("teks polos")).toBe("teks polos");
  });

  it("aman untuk nilai kosong", () => {
    expect(unquoteTxt(undefined)).toBe("");
  });
});

describe("txtValues & findTxt", () => {
  const answers = [
    answer('"google-site-verification=abc"'),
    answer('"v=spf1 include:_spf.google.com -all"'),
    answer('"v=DMARC1; p=reject"'),
  ];

  it("mengekstrak semua nilai TXT", () => {
    expect(txtValues(answers)).toHaveLength(3);
    expect(txtValues(answers)[1]).toContain("v=spf1");
  });

  it("mencari prefix tanpa peduli huruf besar/kecil", () => {
    expect(findTxt(answers, "V=SPF1")).toContain("include:_spf.google.com");
    expect(findTxt(answers, "v=dkim1")).toBeNull();
  });
});

describe("uniqueValues & compareResolvers", () => {
  it("mengabaikan urutan dan duplikat", () => {
    expect(uniqueValues([answer("b"), answer("a"), answer("a")])).toEqual(["a", "b"]);
  });

  it("sepakat walaupun urutan jawaban berbeda", () => {
    const results = [
      result("cloudflare", [answer("1.1.1.1"), answer("2.2.2.2")]),
      result("google", [answer("2.2.2.2"), answer("1.1.1.1")]),
    ];
    expect(compareResolvers(results).consistent).toBe(true);
  });

  it("menandai jawaban yang berbeda", () => {
    const results = [
      result("cloudflare", [answer("1.1.1.1")]),
      result("google", [answer("9.9.9.9")]),
    ];
    expect(compareResolvers(results).consistent).toBe(false);
  });

  it("menganggap TXT ber-kutip dan tanpa kutip itu sama", () => {
    const results = [
      result("cloudflare", [answer('"v=spf1 -all"')]),
      result("google", [answer("v=spf1 -all")]),
    ];
    expect(compareResolvers(results).consistent).toBe(false);
    expect(compareResolvers(results, { unquote: true }).consistent).toBe(true);
  });

  it("mengabaikan resolver yang error", () => {
    const results = [
      result("cloudflare", [answer("1.1.1.1")]),
      { resolver: "google", rcode: -1, ad: false, answers: [], error: "timeout" },
    ];
    expect(compareResolvers(results).consistent).toBe(true);
  });
});

describe("rcodeSummary", () => {
  it("mengenali NODATA", () => {
    const summary = rcodeSummary([result("cloudflare", []), result("google", [])]);
    expect(summary.empty).toBe(true);
    expect(summary.notFound).toBe(false);
  });

  it("mengenali NXDOMAIN", () => {
    const results = [
      result("cloudflare", [], 3),
      result("google", [], 3),
    ];
    expect(rcodeSummary(results).notFound).toBe(true);
  });

  it("mengenali semua resolver gagal", () => {
    const results = [
      { resolver: "cloudflare", rcode: -1, ad: false, answers: [], error: "x" },
      { resolver: "google", rcode: -1, ad: false, answers: [], error: "y" },
    ];
    expect(rcodeSummary(results).allFailed).toBe(true);
  });
});
