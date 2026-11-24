/**
 * TXT di DoH JSON datang sebagai string ber-kutip, dan record panjang bisa
 * dipecah menjadi beberapa string. Fungsi ini menggabungkannya kembali.
 *
 * `"v=spf1 -all"`            -> `v=spf1 -all`
 * `"bagian1" "bagian2"`      -> `bagian1bagian2`
 * `\"literal\"`              -> `"literal"`
 *
 * @param {string} data
 * @returns {string}
 */
export function unquoteTxt(data) {
  const raw = String(data ?? "");
  const parts = [];
  const pattern = /"((?:[^"\\]|\\.)*)"/g;
  let match;
  while ((match = pattern.exec(raw)) !== null) {
    parts.push(match[1].replace(/\\(.)/g, "$1"));
  }
  if (parts.length === 0) return raw.trim();
  return parts.join("");
}

/**
 * @param {import("./types.js").DnsAnswer[]} answers
 * @returns {string[]}
 */
export function txtValues(answers) {
  return answers.map((answer) => unquoteTxt(answer.data));
}

/**
 * Cari TXT yang diawali prefix tertentu (case-insensitive).
 *
 * @param {import("./types.js").DnsAnswer[]} answers
 * @param {string} prefix
 * @returns {string|null}
 */
export function findTxt(answers, prefix) {
  const needle = prefix.toLowerCase();
  return (
    txtValues(answers).find((value) => value.trim().toLowerCase().startsWith(needle)) ??
    null
  );
}

/**
 * Nilai unik yang dijawab resolver, diurutkan agar perbandingan stabil.
 *
 * @param {import("./types.js").DnsAnswer[]} answers
 * @returns {string[]}
 */
export function uniqueValues(answers) {
  return [...new Set(answers.map((answer) => answer.data))].sort();
}

/**
 * Bandingkan jawaban antar resolver tanpa peduli urutan.
 *
 * TXT harus dibandingkan setelah tanda kutip dilepas: Cloudflare menjawab
 * dengan kutip, Google tanpa. Tanpa normalisasi, record yang sama terlihat
 * berbeda.
 *
 * @param {import("./types.js").DohResult[]} results
 * @param {{ unquote?: boolean }} [options]
 * @returns {{ consistent: boolean, sets: string[][] }}
 */
export function compareResolvers(results, options = {}) {
  const { unquote = false } = options;
  const usable = results.filter((result) => !result.error && result.rcode === 0);
  const sets = usable.map((result) =>
    uniqueValues(
      unquote
        ? result.answers.map((answer) => ({ ...answer, data: unquoteTxt(answer.data) }))
        : result.answers,
    ),
  );
  const consistent =
    sets.length < 2 ||
    sets.every(
      (set) =>
        set.length === sets[0].length && set.every((value) => sets[0].includes(value)),
    );
  return { consistent, sets };
}

/**
 * Boolean yang ramah untuk laporan: apakah semua resolver sepakat record
 * ini tidak ada (NODATA), dan apakah ada resolver yang NXDOMAIN.
 *
 * @param {import("./types.js").DohResult[]} results
 * @returns {{ empty: boolean, notFound: boolean, allFailed: boolean }}
 */
export function rcodeSummary(results) {
  const alive = results.filter((result) => !result.error);
  return {
    empty: alive.length > 0 && alive.every((result) => result.answers.length === 0),
    notFound: alive.length > 0 && alive.every((result) => result.rcode === 3),
    allFailed: alive.length === 0,
  };
}
