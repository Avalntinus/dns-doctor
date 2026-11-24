---
project: dns-doctor
status: planned
effort: 1 weekend (6–8 jam)
stack: Next.js App Router + JavaScript + JSDoc + Tailwind + Vitest + Zod
repo_target: ~/Project-DnsDoctor
github: github.com/Avalntinus/dns-doctor (publik, MIT)
deploy: Vercel Hobby
---

# dns-doctor — pemeriksa kesehatan DNS sebuah domain

## Fungsi

Masukkan satu domain → laporan < 2 detik berisi: record DNS apa saja yang ada,
apakah dua resolver publik melihat hal yang sama (propagasi), apakah DNSSEC
aktif, dan apakah konfigurasi email (SPF/DMARC) benar — dengan **penjelasan
kenapa sebuah item WARN/FAIL**, bukan cuma merah-hijau.

Contoh target output (harus bisa dicapai):

```
cloudflare.com
  A          104.16.132.229, 104.16.133.229   OK    TTL 291s
  AAAA       2606:4700::6810:84e5             OK
  MX         (kosong)                         WARN  domain tidak menerima email
  TXT (SPF)  v=spf1 ... -all                  OK    6/10 DNS lookup terpakai
  DMARC      _dmarc p=reject                  OK    policy ketat
  DNSSEC     AD flag                          OK    tervalidasi
  Propagasi  CF 291s / Google 116s            WARN  TTL beda jauh
```

## Batasan teknis yang sudah diverifikasi (2026-11-24)

- `https://cloudflare-dns.com/dns-query?name=X&type=A` + header
  `accept: application/dns-json` → 200, JSON, `access-control-allow-origin: *`,
  field `AD: true` tersedia (DNSSEC tervalidasi).
- `https://dns.google/resolve?name=X&type=A` → 200, JSON, nama dijawab dengan
  titik akhir (`example.com.`) sedangkan Cloudflare tanpa titik.
- Artinya: **tidak butuh API key, tidak butuh backend wajib**. Tetap pakai route
  handler Next.js agar bisa cache dan menghindari rate limit per-pengunjung.

## Scope

Masuk (v1):
- Query A, AAAA, MX, TXT, NS, CAA ke 2 resolver.
- Verdict per record: OK / WARN / FAIL + alasan singkat berbahasa Indonesia.
- Deteksi perbedaan TTL antar resolver (indikasi propagasi belum merata).
- SPF: parse mekanisme, hitung jumlah DNS lookup (batas 10), deteksi `+all` / `?all`.
- DMARC: parse `p=`, `pct=`, `rua=`, `sp`; nilai `p=none` → WARN.
- DNSSEC: pakai flag `AD` dari resolver.
- Copy JSON hasil, tampilan tabel rapi, responsif (mobile).

Tidak masuk (jangan ditambah di v1):
- Login/akun, riwayat, database.
- Query massal / enumerasi subdomain / scan domain orang banyak.
- Verifikasi kriptografis tanda tangan DKIM (cukup cek keberadaan TXT per selector).
- Quad9/AdGuard (format wire/biner), IPv6 subnetting, grafik historis.

## Dependency

```bash
pnpm create next-app@latest dns-doctor --js --tailwind --eslint --app --no-src-dir --import-alias "@/*"
cd dns-doctor
pnpm add zod
pnpm add -D vitest
```
Tidak ada paket lain tanpa persetujuan. `package.json` tidak boleh berisi
`typescript` atau `@types/*`.

## Struktur

```
dns-doctor/
├── app/
│   ├── page.jsx                 # form + laporan
│   ├── layout.jsx               # metadata, font, tema
│   └── api/lookup/route.js      # GET /api/lookup?domain=&type=
├── lib/
│   ├── types.js                 # hanya @typedef
│   ├── doh.js                   # query + normalisasi 2 resolver
│   ├── records.js               # klasifikasi & format record
│   ├── spf.js                   # parser SPF + hitung lookup
│   ├── dmarc.js                 # parser DMARC
│   └── verdict.js               # aturan OK/WARN/FAIL + alasan
├── test/fixtures/*.json         # jawaban DoH asli (rekaman)
├── jsconfig.json                # checkJs: true
├── vitest.config.js
└── README.md
```

Test file berdampingan: `lib/doh.test.js`, dst.

## Data model (lib/types.js)

```js
/** @typedef {{ name: string, type: number, TTL: number, data: string }} DnsAnswer */
/** @typedef {{ resolver: 'cloudflare'|'google', rcode: number, answers: DnsAnswer[], ad: boolean }} DohResult */
/** @typedef {'OK'|'WARN'|'FAIL'} Verdict */
/** @typedef {{ id: string, label: string, value: string, verdict: Verdict, reason?: string }} Finding */
```

Catatan penamaan: pakai `rcode` (0 NOERROR, 3 NXDOMAIN, 2 SERVFAIL), **jangan**
`status`, agar tidak tertukar dengan HTTP status.

## Weekend 1 — task berurutan

### T1. Skeleton + konfigurasi (30 menit)
- Bootstrap seperti di atas, hapus semua aset contoh Next.js.
- `jsconfig.json`: `{"compilerOptions":{"checkJs":true,"baseUrl":".","paths":{"@/*":["./*"]}},"exclude":["node_modules",".next"]}`
- `package.json`: tambah `"test": "vitest run"`, `"test:watch": "vitest"`.
- Commit: `chore: scaffold next app with js config`

### T2. lib/doh.js + tes (60–90 menit)
- `query(resolver, domain, type)` → fetch DoH JSON, timeout 5s (`AbortSignal.timeout(5000)`).
- Normalisasi: nama lowercase, buang titik akhir, `answers ?? []`, `ad ?? false`.
- Terjemahkan HTTP error / parse error → lempar `Error` dengan pesan jelas.
- `lookupAll(domain, type)` → `Promise.allSettled` ke 2 resolver; satu gagal tidak boleh menggagalkan seluruh laporan.
- Tes: fixture CF vs Google untuk A, NXDOMAIN, NODATA, TXT panjang.
- Acceptance: `pnpm test` lulus tanpa jaringan.
- Commit: `feat: doh client with resolver normalization`

### T3. API route (45 menit)
- `GET /api/lookup?domain=&type=` → validasi Zod (domain RFC-ish, type ∈ daftar).
- Cache in-memory `Map` TTL 5 menit, key `domain:type`. Tulis di README bahwa ini
  best-effort per instance (Vercel serverless).
- Response: `{ domain, type, results: DohResult[], findings: Finding[], fetchedAt }`.
- Rate limit sederhana per IP (mis. 20 req/menit, in-memory) → 429 + pesan.
- Commit: `feat: lookup api with cache and validation`

### T4. UI laporan (90 menit)
- Form domain (+ pilihan tipe record opsional), tombol Cek.
- Tabel per tipe record, badge verdict berwarna (hijau/kuning/merah), skeleton saat loading.
- Kelompokkan: Alamat (A/AAAA), Email (MX/SPF/DMARC), Otoritas (NS/CAA), Keamanan (DNSSEC), Propagasi.
- Error state manusiawi: "Domain tidak ditemukan (NXDOMAIN)" ≠ "Resolver tidak merespons".
- Commit: `feat: report ui with verdict badges`

### T5. lib/spf.js (60 menit)
- Ambil TXT yang diawali `v=spf1`, gabungkan string terpecah.
- Hitung mekanisme yang memicu DNS lookup: `include`, `a`, `mx`, `ptr`, `exists`, `redirect`, `exp`. Batas 10 → lebih = FAIL.
- Deteksi `+all` = FAIL, `?all` = WARN, `~all` = OK (soft), `-all` = OK.
- Tes table-driven minimal 10 kasus.
- Commit: `feat: spf parser with lookup budget`

### T6. lib/dmarc.js (45 menit)
- Ambil TXT `_dmarc.<domain>`; parse `v=DMARC1`, `p`, `sp`, `pct`, `rua`.
- `p=none` → WARN ("hanya monitoring"), tanpa record → WARN, `p=reject` + rua → OK.
- Tes 6 kasus.
- Commit: `feat: dmarc parser`

### T7. lib/verdict.js + alasan (45 menit)
- Gabungkan semua Finding, hitung ringkasan (mis. "5 OK, 2 WARN").
- Setiap WARN/FAIL **wajib** punya `reason` satu kalimat + saran perbaikan singkat.
- Tes: domain sehat, domain tanpa email, domain tanpa DNSSEC, domain NXDOMAIN.
- Commit: `feat: verdict rules with explanations`

### T8. README + deploy (45 menit)
- README: 1 paragraf masalah → screenshot laporan asli → `pnpm dev` → daftar cek yang
  dilakukan → batasan (2 resolver, cache best-effort, tanpa query massal).
- `LICENSE` MIT, deskripsi repo, topics: `dns`, `dnskey`, `dnssec`, `spf`, `dmarc`, `nextjs`, `network-tools`.
- Deploy Vercel, uji di production dengan 3 domain berbeda (sehat, tanpa email, NXDOMAIN).
- Commit: `docs: readme and deployment`

## Definition of Done

- [ ] `pnpm install && pnpm test` hijau, ≥ 30 tes, tanpa akses jaringan.
- [ ] `pnpm dev` → `cloudflare.com` menghasilkan laporan lengkap < 2 detik.
- [ ] Tiga kasus diuji manual: domain sehat, domain tanpa MX/DMARC, domain NXDOMAIN.
- [ ] Tidak ada file `.ts`/`.tsx`, tidak ada `typescript` di `package.json`.
- [ ] Repo publik + deploy Vercel hidup + link ditambahkan ke web portofolio.
- [ ] README memuat screenshot asli (bukan mockup).

## Jebakan (baca sebelum coding)

1. `data` di DoH selalu string: MX = `"10 mail.example.com."`, TXT = `"\"v=spf1 ...\""`.
2. Google menambah titik akhir; normalisasi wajib sebelum membandingkan resolver.
3. `Answer` bisa `undefined` untuk NODATA — beda dengan NXDOMAIN (`rcode: 3`).
4. TXT panjang bisa terpecah beberapa string → gabung sebelum parse.
5. Jangan `status` untuk rcode.
6. `Promise.allSettled` supaya 1 resolver mati tidak mematikan laporan.
7. Cache in-memory hilang saat cold start; jangan janjikan lebih di README.

## Etika & biaya

- 2 resolver, 1 domain per request, cache 5 menit, rate limit per IP.
- Gratis total: Vercel Hobby, DoH publik tanpa key, GitHub publik.
- Domain sendiri tidak wajib; `*.vercel.app` cukup. Beli hanya jika sudah bangga.

## Fase 2 (opsional, jangan dikerjakan sebelum DoD tercapai)

- Resolver tambahan (Quad9/AdGuard) via `dns-packet` untuk wireformat.
- Halaman demo tertanam di web portofolio (bisa `iframe` atau pindah komponen).
- Cek CAA + MTA-STS + TLS-RPT.
- OG image dinamis berisi ringkasan verdict domain yang dicek.
