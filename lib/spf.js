/**
 * Mekanisme SPF yang memicu query DNS. Batas RFC 7208 adalah 10 lookup;
 * lewat dari itu, receiver boleh menolak (permerror).
 */
const LOOKUP_MECHANISMS = new Set([
  "include",
  "a",
  "mx",
  "ptr",
  "exists",
  "redirect",
  "exp",
]);

/** @typedef {{ raw: string, name: string|null, qualifier: string }} SpfMechanism */

/**
 * Cari record SPF di kumpulan TXT. SPF yang valid harus tunggal.
 *
 * @param {string[]} txtRecords
 * @returns {{ record: string|null, count: number }}
 */
export function findSpf(txtRecords) {
  const candidates = txtRecords.filter((value) =>
    value.trim().toLowerCase().startsWith("v=spf1"),
  );
  return { record: candidates[0] ?? null, count: candidates.length };
}

/**
 * @param {string} record
 * @returns {{ mechanisms: SpfMechanism[], lookups: number, allQualifier: string|null, domain: string|null }}
 */
export function parseSpf(record) {
  const terms = String(record).trim().split(/\s+/);
  /** @type {SpfMechanism[]} */
  const mechanisms = [];
  let lookups = 0;
  let allQualifier = null;

  for (const term of terms.slice(1)) {
    // nama mekanisme berhenti di ":", "=", atau "/" sehingga nilai
    // seperti exists:%{i}._spf.example.com tetap terbaca.
    const match = /^([+\-~?]?)([a-z0-9][a-z0-9_.-]*)(.*)$/i.exec(term);
    if (!match) {
      mechanisms.push({ raw: term, name: null, qualifier: "+" });
      continue;
    }

    const [, qualifier, rawName] = match;
    const name = rawName.toLowerCase();
    mechanisms.push({ raw: term, name, qualifier });

    if (LOOKUP_MECHANISMS.has(name)) lookups += 1;
    if (name === "all") allQualifier = qualifier;
  }

  const redirect = mechanisms.find((mechanism) => mechanism.name === "redirect");

  return {
    mechanisms,
    lookups,
    allQualifier,
    domain: redirect ? redirect.raw.split("=")[1] ?? null : null,
  };
}

/**
 * Ringkasan untuk laporan, tanpa memutuskan verdict (itu tugas verdict.js).
 *
 * @param {string[]} txtRecords
 * @returns {{ present: boolean, duplicates: number, record: string|null, parsed: ReturnType<typeof parseSpf>|null }}
 */
export function inspectSpf(txtRecords) {
  const { record, count } = findSpf(txtRecords);
  return {
    present: record !== null,
    duplicates: count,
    record,
    parsed: record ? parseSpf(record) : null,
  };
}
