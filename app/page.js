"use client";

import { useState } from "react";
import { GROUP_LABELS } from "@/lib/verdict";

const GROUPS = ["alamat", "email", "otoritas", "keamanan", "propagasi"];

const BADGE = {
  OK: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400",
  WARN: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400",
  FAIL: "bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-400",
};

const DOT = {
  OK: "bg-emerald-500",
  WARN: "bg-amber-500",
  FAIL: "bg-rose-500",
};

const EXAMPLES = ["cloudflare.com", "github.com", "example.com"];

function Badge({ verdict }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium ring-1 ring-inset ${BADGE[verdict]}`}
    >
      {verdict}
    </span>
  );
}

function Summary({ report }) {
  const items = [
    ["OK", report.summary.ok],
    ["WARN", report.summary.warn],
    ["FAIL", report.summary.fail],
  ];

  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <span className="font-mono text-xs tracking-wide text-black/50 dark:text-white/50">
        {report.domain}
      </span>
      <span className="h-3 w-px bg-black/10 dark:bg-white/15" />
      {items.map(([verdict, count]) => (
        <span key={verdict} className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[verdict]}`} />
          <span className="tabular-nums font-medium">{count}</span>
          <span className="text-black/50 dark:text-white/50">{verdict}</span>
        </span>
      ))}
      {report.cached ? (
        <span className="ml-auto font-mono text-[11px] text-black/40 dark:text-white/40">
          dari cache
        </span>
      ) : null}
    </div>
  );
}

function FindingRow({ finding }) {
  return (
    <li className="grid gap-1 border-t border-black/[0.06] py-3 first:border-t-0 first:pt-0 dark:border-white/10 sm:grid-cols-[7rem_1fr_auto] sm:gap-x-4">
      <span className="font-mono text-xs text-black/45 dark:text-white/45">
        {finding.label}
      </span>
      <div className="min-w-0">
        <p className="break-words font-mono text-sm">{finding.value}</p>
        <p className="mt-1 text-[13px] leading-5 text-black/60 dark:text-white/55">
          {finding.reason}
        </p>
        {finding.advice ? (
          <p className="mt-1 text-[13px] leading-5 text-black/40 dark:text-white/35">
            → {finding.advice}
          </p>
        ) : null}
      </div>
      <div className="sm:pt-0.5">
        <Badge verdict={finding.verdict} />
      </div>
    </li>
  );
}

function ReportView({ report }) {
  const [copied, setCopied] = useState(false);

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

      <div className="mt-6 space-y-4">
        {GROUPS.map((group) => {
          const findings = report.findings.filter((item) => item.group === group);
          if (findings.length === 0) return null;

          return (
            <div
              key={group}
              className="rounded-xl border border-black/[0.08] bg-black/[0.015] p-4 dark:border-white/10 dark:bg-white/[0.02]"
            >
              <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-black/40 dark:text-white/35">
                {GROUP_LABELS[group] ?? group}
              </h2>
              <ul>
                {findings.map((finding) => (
                  <FindingRow key={finding.id} finding={finding} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={copyJson}
          className="rounded-lg border border-black/10 px-3 py-1.5 font-mono text-xs transition-colors hover:bg-black/[0.04] dark:border-white/15 dark:hover:bg-white/[0.06]"
        >
          {copied ? "tersalin ✓" : "copy JSON"}
        </button>
        <span className="font-mono text-[11px] text-black/35 dark:text-white/30">
          {new Date(report.fetchedAt).toLocaleTimeString("id-ID")} · Cloudflare + Google DoH
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
      const response = await fetch(
        `/api/lookup?domain=${encodeURIComponent(value)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload?.error ?? "Terjadi kesalahan saat memeriksa domain.");
        setStatus("error");
        return;
      }

      setReport(payload);
      setStatus("done");
    } catch {
      setError("Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.");
      setStatus("error");
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    check();
  }

  const loading = status === "loading";

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:py-20">
      <header>
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-black/40 dark:text-white/40">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          dns.doctor
        </p>
        <h1 className="mt-6 text-[2rem] font-semibold leading-[1.15] tracking-tight sm:text-[2.75rem]">
          Periksa kesehatan DNS
          <br className="hidden sm:block" /> sebuah domain.
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-7 text-black/55 dark:text-white/50">
          Record, kesepakatan antar resolver, DNSSEC, sampai SPF dan DMARC — lengkap
          dengan alasan di balik setiap peringatan.
        </p>
      </header>

      <form onSubmit={onSubmit} className="mt-8">
        <label htmlFor="domain" className="sr-only">
          Nama domain
        </label>
        <div className="flex items-stretch gap-2 rounded-xl border border-black/10 bg-black/[0.015] p-1.5 transition-colors focus-within:border-black/25 dark:border-white/15 dark:bg-white/[0.02] dark:focus-within:border-white/30">
          <span className="hidden select-none self-center pl-2.5 font-mono text-sm text-black/30 dark:text-white/25 sm:block">
            https://
          </span>
          <input
            id="domain"
            name="domain"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="example.com"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent px-1 py-2 font-mono text-[15px] outline-none placeholder:text-black/25 dark:placeholder:text-white/20"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {loading ? "Memeriksa…" : "Periksa"}
          </button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-black/30 dark:text-white/25">coba:</span>
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              setInput(example);
              check(example);
            }}
            className="rounded-md border border-black/[0.08] px-2 py-0.5 font-mono text-[11px] text-black/50 transition-colors hover:bg-black/[0.04] dark:border-white/10 dark:text-white/45 dark:hover:bg-white/[0.06]"
          >
            {example}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-10 space-y-3" aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="h-16 animate-pulse rounded-xl border border-black/[0.06] bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03]"
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mt-8 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] p-4 text-sm leading-6 text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      ) : null}

      {report ? <ReportView report={report} /> : null}

      {status === "idle" ? (
        <p className="mt-12 max-w-xl border-t border-black/[0.06] pt-6 text-[13px] leading-6 text-black/45 dark:border-white/10 dark:text-white/40">
          Satu domain per pemeriksaan. Hasil dibandingkan dari dua resolver publik
          (Cloudflare dan Google) lalu disimpan di cache selama lima menit.
        </p>
      ) : null}
    </main>
  );
}
