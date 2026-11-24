"use client";

import { useState } from "react";
import { GROUP_LABELS } from "@/lib/verdict";

const GROUPS = ["alamat", "email", "otoritas", "keamanan", "propagasi"];

const VERDICT = {
  OK: { label: "Lolos", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  WARN: { label: "Perhatian", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  FAIL: { label: "Gagal", dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-400" },
};

const EXAMPLES = ["cloudflare.com", "github.com", "example.com"];

const SEVERITY = { FAIL: 0, WARN: 1, OK: 2 };

function StatusLine({ verdict, className = "" }) {
  const meta = VERDICT[verdict];
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
      <span className={`text-xs font-medium ${meta.text}`}>{meta.label}</span>
    </span>
  );
}

function FindingRow({ finding }) {
  return (
    <li className="grid gap-1.5 border-t border-black/[0.07] py-3 first:border-t-0 first:pt-0 dark:border-white/10 sm:grid-cols-[7.5rem_1fr] sm:gap-6">
      <div className="flex items-center gap-2 sm:block">
        <p className="font-mono text-xs text-black/65 dark:text-white/60">{finding.label}</p>
        <StatusLine verdict={finding.verdict} className="sm:mt-1.5" />
      </div>

      <div className="min-w-0">
        <p className="break-words font-mono text-[13px] leading-6">{finding.value}</p>
        <p className="mt-1 text-[13px] leading-6 text-black/65 dark:text-white/60">
          {finding.reason}
        </p>
        {finding.advice ? (
          <p className="mt-1 text-[13px] leading-6 text-black/65 dark:text-white/60">
            <span className="font-medium">Saran:</span> {finding.advice}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function Summary({ report }) {
  const { ok, warn, fail } = report.summary;
  const parts = fail > 0 ? [`${fail} gagal`, `${warn} perhatian`, `${ok} lolos`] : [`${ok} lolos`, `${warn} perhatian`, `${fail} gagal`];

  return (
    <div className="mt-10 border-t border-black/10 pt-5 dark:border-white/15">
      <p className="font-mono text-[17px] tracking-[-0.01em]">{report.domain}</p>
      <p className="mt-1 text-sm text-black/65 dark:text-white/60">
        {report.findings.length} pemeriksaan: {parts.join(", ")}.
      </p>
    </div>
  );
}

function Filter({ value, onChange, counts }) {
  const options = [
    ["semua", "Semua", counts.all],
    ["perhatian", "Perlu perhatian", counts.attention],
  ];

  return (
    <div className="mt-4 flex items-center gap-1 text-xs" role="group" aria-label="Saring temuan">
      {options.map(([key, label, count]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={`rounded-md px-2 py-1 transition-colors ${
            value === key
              ? "bg-black/[0.06] font-medium text-black ring-1 ring-black/10 dark:bg-white/[0.12] dark:text-white dark:ring-white/15"
              : "text-black/65 hover:bg-black/[0.04] dark:text-white/60 dark:hover:bg-white/[0.06]"
          }`}
        >
          {label} <span className="tabular-nums opacity-60">{count}</span>
        </button>
      ))}
    </div>
  );
}

function ReportView({ report }) {
  const [filter, setFilter] = useState("semua");
  const [copied, setCopied] = useState(false);

  const counts = {
    all: report.findings.length,
    attention: report.findings.filter((item) => item.verdict !== "OK").length,
  };

  const visible = [...report.findings]
    .filter((item) => (filter === "semua" ? true : item.verdict !== "OK"))
    .sort((a, b) => {
      if (filter === "perhatian") return SEVERITY[a.verdict] - SEVERITY[b.verdict];
      return GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group);
    });

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-live="polite">
      <Summary report={report} />
      <Filter value={filter} onChange={setFilter} counts={counts} />

      {visible.length === 0 ? (
        <p className="mt-8 border-t border-black/10 pt-5 text-sm text-black/55 dark:border-white/15 dark:text-white/50">
          Tidak ada temuan yang perlu perhatian. Semua record yang diperiksa lolos.
        </p>
      ) : (
        GROUPS.map((group) => {
          const findings = visible.filter((item) => item.group === group);
          if (findings.length === 0) return null;

          return (
            <div key={group} className="mt-8">
              <h2 className="mb-3 text-xs font-medium text-black/65 dark:text-white/60">
                {GROUP_LABELS[group] ?? group}
              </h2>
              <ul>
                {findings.map((finding) => (
                  <FindingRow key={finding.id} finding={finding} />
                ))}
              </ul>
            </div>
          );
        })
      )}

      <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-black/10 pt-4 dark:border-white/15">
        <button
          type="button"
          onClick={copyJson}
          className="-my-1 py-1 text-xs text-black/50 underline decoration-black/20 underline-offset-4 transition-colors hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/40 dark:text-white/45 dark:decoration-white/20 dark:hover:text-white dark:focus-visible:outline-white/40"
        >
          {copied ? "Tersalin" : "Salin JSON"}
        </button>
        <span className="font-mono text-[11px] text-black/55 dark:text-white/50">
          {new Date(report.fetchedAt).toLocaleTimeString("id-ID")} · Cloudflare, Google
          {report.cached ? " · cache" : ""}
        </span>
      </div>
    </section>
  );
}

export default function Home() {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("idle");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  async function check(domain) {
    const value = (domain ?? input).trim();
    if (!value) return;

    setStatus("loading");
    setError("");
    setReport(null);

    try {
      const response = await fetch(`/api/lookup?domain=${encodeURIComponent(value)}`, {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload?.error ?? "Pemeriksaan gagal. Coba lagi sebentar.");
        setStatus("error");
        return;
      }

      setReport(payload);
      setStatus("done");
    } catch {
      setError("Server tidak merespons. Periksa koneksi lalu coba lagi.");
      setStatus("error");
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    check();
  }

  const loading = status === "loading";

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-14 sm:py-20">
      <header>
        <p className="font-mono text-xs text-black/65 dark:text-white/60">dns.doctor</p>
        <h1 className="mt-5 text-[1.9rem] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[2.4rem]">
          Periksa kesehatan DNS sebuah domain.
        </h1>
        <p className="mt-3 max-w-lg text-[15px] leading-7 text-black/65 dark:text-white/60">
          Record, kesepakatan antar resolver, DNSSEC, SPF, dan DMARC. Setiap
          peringatan disertai alasan dan saran perbaikan.
        </p>
      </header>

      <form onSubmit={onSubmit} className="mt-8">
        <label htmlFor="domain" className="sr-only">
          Nama domain
        </label>
        <div className="flex items-stretch gap-2 rounded-lg border border-black/15 bg-white p-1.5 transition-colors focus-within:border-black/40 dark:border-white/15 dark:bg-white/[0.03] dark:focus-within:border-white/35">
          <input
            id="domain"
            name="domain"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="example.com"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent px-2 py-1.5 font-mono text-[15px] outline-none placeholder:text-black/30 dark:placeholder:text-white/25"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-black px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/40 disabled:opacity-50 dark:bg-white dark:text-black dark:focus-visible:outline-white/50"
          >
            {loading ? "Memeriksa" : "Periksa"}
          </button>
        </div>
      </form>

      <p className="mt-3 text-xs text-black/65 dark:text-white/60">
        Contoh:{" "}
        {EXAMPLES.map((example, index) => (
          <span key={example}>
            {index > 0 ? ", " : ""}
            <button
              type="button"
              onClick={() => {
                setInput(example);
                check(example);
              }}
              className="-my-1 inline-block py-1 underline decoration-black/20 underline-offset-4 transition-colors hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/40 dark:decoration-white/20 dark:hover:text-white dark:focus-visible:outline-white/40"
            >
              {example}
            </button>
          </span>
        ))}
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-black/65 dark:text-white/60">
          Mengambil A, AAAA, MX, TXT, NS, CAA, dan DMARC dari Cloudflare dan Google.
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mt-8 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-4 text-sm leading-6 text-rose-800 dark:text-rose-300"
        >
          {error}
        </div>
      ) : null}

      {report ? <ReportView report={report} /> : null}

      {status === "idle" ? (
        <p className="mt-10 max-w-lg border-t border-black/[0.08] pt-5 text-[13px] leading-6 text-black/45 dark:border-white/10 dark:text-white/40">
          Satu domain per pemeriksaan. Hasil dari dua resolver publik dibandingkan
          lalu disimpan di cache selama lima menit.
        </p>
      ) : null}
    </main>
  );
}
