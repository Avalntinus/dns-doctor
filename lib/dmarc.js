/**
 * Nama record DMARC selalu `_dmarc.<domain>`, jadi helper ini dipakai
 * sebelum query.
 *
 * @param {string} domain
 * @returns {string}
 */
export function dmarcName(domain) {
  return `_dmarc.${domain}`;
}

/**
 * @param {string[]} txtRecords
 * @returns {string|null}
 */
export function findDmarc(txtRecords) {
  return (
    txtRecords.find((value) => /^v=DMARC1\s*;/i.test(value.trim())) ?? null
  );
}

/**
 * @param {string|null} record
 * @returns {{ tags: Record<string, string>, policy: string|null, subdomainPolicy: string|null, pct: number, rua: string|null, adkim: string, aspf: string }|null}
 */
export function parseDmarc(record) {
  if (!record) return null;

  /** @type {Record<string, string>} */
  const tags = {};
  for (const part of record.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim();
    if (key) tags[key] = value;
  }

  const pctValue = Number(tags.pct ?? "100");

  return {
    tags,
    policy: tags.p ?? null,
    subdomainPolicy: tags.sp ?? null,
    pct: Number.isFinite(pctValue) ? pctValue : 100,
    rua: tags.rua ?? null,
    adkim: tags.adkim ?? "r",
    aspf: tags.aspf ?? "r",
  };
}

/**
 * @param {string[]} txtRecords
 * @returns {{ present: boolean, record: string|null, parsed: ReturnType<typeof parseDmarc> }}
 */
export function inspectDmarc(txtRecords) {
  const record = findDmarc(txtRecords);
  return { present: record !== null, record, parsed: parseDmarc(record) };
}
