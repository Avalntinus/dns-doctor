import {
  compareResolvers,
  rcodeSummary,
  txtValues,
  uniqueValues,
} from "./records.js";
import { inspectSpf } from "./spf.js";
import { inspectDmarc } from "./dmarc.js";

/** @typedef {import("./types.js").DohResult} DohResult */
/** @typedef {import("./types.js").Finding} Finding */
/** @typedef {import("./types.js").Verdict} Verdict */

export const GROUP_LABELS = {
  alamat: "Alamat",
  email: "Email",
  otoritas: "Otoritas",
  keamanan: "Keamanan",
  propagasi: "Propagasi",
};

/**
 * @param {string} id
 * @param {Finding["group"]} group
 * @param {string} label
 * @param {string} value
 * @param {Verdict} verdict
 * @param {string} reason
 * @param {string} [advice]
 * @returns {Finding}
 */
function finding(id, group, label, value, verdict, reason, advice) {
  return { id, group, label, value, verdict, reason, advice };
}

/**
 * @param {DohResult[]} results
 * @returns {string[]}
 */
function valuesOf(results) {
  return uniqueValues(results.flatMap((result) => result.answers));
}

/**
 * @param {Finding[]} findings
 * @returns {import("./types.js").Summary}
 */
export function summarize(findings) {
  return findings.reduce(
    (total, item) => {
      if (item.verdict === "OK") total.ok += 1;
      else if (item.verdict === "WARN") total.warn += 1;
      else total.fail += 1;
      return total;
    },
    { ok: 0, warn: 0, fail: 0 },
  );
}

/**
 * Susun laporan dari hasil lookup mentah. Semua keputusan tampil di sini,
 * supaya UI tetap bodoh dan mudah diuji.
 *
 * @param {{ domain: string, records: Record<string, DohResult[]>, fetchedAt?: string, cached?: boolean }} input
 * @returns {import("./types.js").Report}
 */
export function buildReport({ domain, records, fetchedAt, cached = false }) {
  const at = fetchedAt ?? new Date().toISOString();
  const findings = [];

  const aResults = records.A ?? [];
  const aStatus = rcodeSummary(aResults);

  // NXDOMAIN menghentikan pemeriksaan lain: tidak ada gunanya memeriksa
  // SPF/DMARC pada domain yang tidak ada.
  if (aStatus.notFound) {
    findings.push(
      finding(
        "a",
        "alamat",
        "Domain",
        domain,
        "FAIL",
        "Domain tidak ditemukan (NXDOMAIN) di semua resolver.",
        "Periksa ejaan domain, atau pastikan domain sudah terdaftar dan NS-nya aktif.",
      ),
    );
    return { domain, fetchedAt: at, cached, summary: summarize(findings), findings, raw: records };
  }

  // --- Alamat ------------------------------------------------------------
  const aValues = valuesOf(aResults);
  if (aStatus.allFailed) {
    findings.push(
      finding(
        "a",
        "alamat",
        "A",
        "tidak ada",
        "FAIL",
        "Tidak ada resolver yang bisa dihubungi.",
        "Coba lagi beberapa saat; bila berulang, periksa koneksi internet.",
      ),
    );
  } else if (aValues.length > 0) {
    const viaCname = aResults.some((result) =>
      result.answers.some((answer) => answer.type === 5),
    );
    findings.push(
      finding(
        "a",
        "alamat",
        "A",
        aValues.join(", "),
        "OK",
        viaCname
          ? "Domain mengarah ke alamat IP melalui record CNAME."
          : `Dijawab sama oleh ${aResults.length} resolver.`,
      ),
    );
  } else {
    findings.push(
      finding(
        "a",
        "alamat",
        "A",
        "tidak ada",
        "WARN",
        "Domain tidak bisa diakses lewat IPv4.",
        "Tambahkan record A ke alamat server, atau pakai CNAME bila memakai layanan pihak ketiga.",
      ),
    );
  }

  const aaaaValues = valuesOf(records.AAAA ?? []);
  findings.push(
    aaaaValues.length > 0
      ? finding("aaaa", "alamat", "AAAA", aaaaValues.join(", "), "OK", "Domain punya jalur IPv6.")
      : finding(
          "aaaa",
          "alamat",
          "AAAA",
          "tidak ada",
          "WARN",
          "Domain belum punya jalur IPv6.",
          "Tambahkan AAAA bila server/layanan sudah mendukung IPv6.",
        ),
  );

  // --- MX ---------------------------------------------------------------
  const mxResults = records.MX ?? [];
  const mxValues = valuesOf(mxResults);
  const nullMx = mxValues.length === 1 && /^0\s+\.?$/.test(mxValues[0].trim());

  if (nullMx) {
    findings.push(
      finding(
        "mx",
        "email",
        "MX",
        "0 .",
        "OK",
        "Null MX: domain menyatakan secara eksplisit tidak menerima email.",
      ),
    );
  } else if (mxValues.length > 0) {
    findings.push(
      finding("mx", "email", "MX", mxValues.join(", "), "OK", "Ada mail exchanger yang menerima email."),
    );
  } else {
    findings.push(
      finding(
        "mx",
        "email",
        "MX",
        "tidak ada",
        "WARN",
        "Domain ini tidak bisa menerima email.",
        "Tambahkan MX bila ingin menerima email, atau MX 0 . bila memang tidak menerima email.",
      ),
    );
  }

  // --- SPF --------------------------------------------------------------
  // dua resolver mengembalikan record yang sama; dedupe agar tidak
  // terhitung sebagai duplikat SPF.
  const txtRecords = [
    ...new Set(txtValues((records.TXT ?? []).flatMap((result) => result.answers))),
  ];
  const spf = inspectSpf(txtRecords);

  if (!spf.present) {
    findings.push(
      finding(
        "spf",
        "email",
        "SPF",
        "tidak ada",
        "WARN",
        "Penerima tidak bisa memverifikasi siapa yang boleh mengirim email atas nama domain ini.",
        "Tambahkan TXT berisi v=spf1 ... -all sesuai daftar server pengirim.",
      ),
    );
  } else if (spf.duplicates > 1) {
    findings.push(
      finding(
        "spf",
        "email",
        "SPF",
        `${spf.duplicates} record`,
        "FAIL",
        "Ada lebih dari satu record SPF; ini melanggar RFC 7208 dan membuat hasilnya tidak terdefinisi.",
        "Gabungkan semua isi menjadi satu record SPF.",
      ),
    );
  } else if (spf.parsed && spf.parsed.lookups > 10) {
    findings.push(
      finding(
        "spf",
        "email",
        "SPF",
        `${spf.parsed.lookups} lookup`,
        "FAIL",
        "SPF melewati batas 10 DNS lookup; penerima boleh menolak email (permerror).",
        "Kurangi include/a/mx, atau pakai layanan seperti SPF flattening.",
      ),
    );
  } else if (spf.parsed?.allQualifier === "+") {
    findings.push(
      finding(
        "spf",
        "email",
        "SPF",
        "+all",
        "FAIL",
        "+all membuat semua pengirim dianggap sah, sehingga SPF tidak melindungi apa pun.",
        "Ganti dengan -all (atau ~all saat masa transisi).",
      ),
    );
  } else if (spf.parsed?.allQualifier === "?") {
    findings.push(
      finding(
        "spf",
        "email",
        "SPF",
        `?all · ${spf.parsed.lookups} dari 10 lookup`,
        "WARN",
        "?all bersifat netral: email palsu tidak ditolak, hanya tidak diberi label.",
        "Ganti dengan -all setelah semua pengirim sah terdaftar.",
      ),
    );
  } else {
    findings.push(
      finding(
        "spf",
        "email",
        "SPF",
        `${spf.parsed?.allQualifier ?? "tanpa"}all · ${spf.parsed?.lookups ?? 0} dari 10 lookup`,
        "OK",
        "SPF tunggal dan masih di dalam batas lookup.",
      ),
    );
  }

  // --- DMARC ------------------------------------------------------------
  const dmarcTxt = [
    ...new Set(txtValues((records.DMARC ?? []).flatMap((result) => result.answers))),
  ];
  const dmarc = inspectDmarc(dmarcTxt);

  if (!dmarc.present) {
    findings.push(
      finding(
        "dmarc",
        "email",
        "DMARC",
        "tidak ada",
        "WARN",
        "Tanpa DMARC, tidak ada kebijakan dan tidak ada laporan email palsu.",
        "Tambahkan TXT di _dmarc.<domain> berisi v=DMARC1; p=none; rua=mailto:... lalu naikkan ke quarantine/reject.",
      ),
    );
  } else if (dmarc.parsed?.policy === "none") {
    findings.push(
      finding(
        "dmarc",
        "email",
        "DMARC",
        "p=none",
        "WARN",
        "DMARC hanya memantau; email yang gagal verifikasi tetap diterima.",
        "Setelah laporan bersih, naikkan ke p=quarantine lalu p=reject.",
      ),
    );
  } else if (dmarc.parsed && dmarc.parsed.pct < 100) {
    findings.push(
      finding(
        "dmarc",
        "email",
        "DMARC",
        `p=${dmarc.parsed.policy} · pct=${dmarc.parsed.pct}`,
        "WARN",
        "Kebijakan belum berlaku untuk semua email karena pct di bawah 100.",
        "Naikkan pct ke 100 setelah yakin semua pengirim sah sudah lolos.",
      ),
    );
  } else {
    findings.push(
      finding(
        "dmarc",
        "email",
        "DMARC",
        `p=${dmarc.parsed?.policy ?? "?"}${dmarc.parsed?.rua ? " · rua aktif" : ""}`,
        "OK",
        "Ada kebijakan penolakan dan (opsional) alamat laporan.",
      ),
    );
  }

  // --- Otoritas ---------------------------------------------------------
  const nsValues = valuesOf(records.NS ?? []);
  findings.push(
    nsValues.length > 0
      ? finding("ns", "otoritas", "NS", nsValues.join(", "), "OK", "Delegasi nama server terbaca.")
      : finding(
          "ns",
          "otoritas",
          "NS",
          "tidak ada",
          "WARN",
          "Delegasi nama server tidak terbaca.",
          "Pastikan domain terdaftar dan delegasi NS di registrar sudah benar.",
        ),
  );

  const caaValues = valuesOf(records.CAA ?? []);
  findings.push(
    caaValues.length > 0
      ? finding("caa", "otoritas", "CAA", caaValues.join(", "), "OK", "Membatasi CA yang boleh menerbitkan sertifikat.")
      : finding(
          "caa",
          "otoritas",
          "CAA",
          "tidak ada",
          "OK",
          "Tidak wajib, tetapi tanpa CAA siapa pun CA bisa menerbitkan sertifikat untuk domain ini.",
          "Pertimbangkan CAA bila ingin membatasi penerbitan sertifikat.",
        ),
  );

  // --- Keamanan ---------------------------------------------------------
  const dnssec = Object.values(records)
    .flat()
    .some((result) => result.ad && result.answers.length > 0);

  findings.push(
    dnssec
      ? finding("dnssec", "keamanan", "DNSSEC", "AD flag", "OK", "Jawaban tervalidasi DNSSEC oleh resolver.")
      : finding(
          "dnssec",
          "keamanan",
          "DNSSEC",
          "tidak aktif",
          "WARN",
          "DNSSEC tidak aktif: jawaban DNS bisa dipalsukan di jalur resolusi.",
          "Aktifkan DNSSEC di registrar/penyedia DNS bila didukung.",
        ),
  );

  // --- Propagasi --------------------------------------------------------
  /** @type {Array<[string, DohResult[]]>} */
  const checks = [
    ["A", records.A ?? []],
    ["AAAA", records.AAAA ?? []],
    ["MX", records.MX ?? []],
    ["TXT", records.TXT ?? []],
    ["NS", records.NS ?? []],
    ["CAA", records.CAA ?? []],
    ["DMARC", records.DMARC ?? []],
  ];

  for (const [type, results] of checks) {
    if (results.filter((result) => !result.error).length < 2) continue;

    const { consistent } = compareResolvers(results, {
      unquote: type === "TXT" || type === "DMARC",
    });
    if (!consistent) {
      findings.push(
        finding(
          `propagasi-${type}`,
          "propagasi",
          type,
          "resolver tidak sepakat",
          "WARN",
          "Dua resolver publik melihat jawaban berbeda. Bisa karena propagasi belum merata, atau memang GeoDNS/CDN yang sengaja menjawab berbeda per lokasi resolver.",
          "Bila domain memakai GeoDNS/CDN, ini normal. Bila tidak, tunggu selama TTL lama lalu periksa lagi.",
        ),
      );
    }
  }

  if (!findings.some((item) => item.group === "propagasi")) {
    findings.push(
      finding(
        "propagasi-ok",
        "propagasi",
        "Semua record",
        "konsisten",
        "OK",
        "Kedua resolver publik melihat jawaban yang sama untuk semua record yang diperiksa.",
      ),
    );
  }

  // pastikan tidak ada finding ganda dengan id sama
  const unique = [...new Map(findings.map((item) => [item.id, item])).values()];

  return {
    domain,
    fetchedAt: at,
    cached,
    summary: summarize(unique),
    findings: unique,
    raw: records,
  };
}
