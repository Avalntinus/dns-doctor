/**
 * Membersihkan input pengguna menjadi nama domain yang bisa di-query.
 * Menerima hal-hal yang biasanya ditempel orang: URL lengkap, spasi, titik akhir.
 *
 * @param {string} input
 * @returns {string}
 */
export function normalizeDomain(input) {
  let value = String(input ?? "").trim().toLowerCase();

  // buang skema dan path: https://user:pass@host:443/path?q=1#frag
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.replace(/^\/\//, "");
  value = value.replace(/^[^/@]*@/, "");
  value = value.replace(/[/?#].*$/, "");
  // buang titik akhir dulu, lalu port (dan titik akhir lagi bila ada)
  value = value.replace(/\.+$/, "");
  value = value.replace(/:\d+$/, "");
  value = value.replace(/\.+$/, "");

  return value;
}

/**
 * Apakah ini kandidat domain yang wajar? Sengaja konservatif:
 * minimal satu titik, label 1-63 karakter, tanpa underscore.
 *
 * @param {string} domain
 * @returns {boolean}
 */
export function isValidDomain(domain) {
  if (domain.length === 0 || domain.length > 253) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  return labels.every((label) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}
