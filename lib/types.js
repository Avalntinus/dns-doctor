/**
 * Bentuk data yang dipakai lintas modul.
 *
 * @typedef {'OK'|'WARN'|'FAIL'} Verdict
 * @typedef {{ name: string, type: number, TTL: number, data: string }} DnsAnswer
 * @typedef {'cloudflare'|'google'} ResolverId
 * @typedef {{ resolver: ResolverId, rcode: number, answers: DnsAnswer[], ad: boolean, error?: string }} DohResult
 * @typedef {'alamat'|'email'|'otoritas'|'keamanan'|'propagasi'} FindingGroup
 * @typedef {{ id: string, group: FindingGroup, label: string, value: string, verdict: Verdict, reason: string, advice?: string }} Finding
 * @typedef {{ ok: number, warn: number, fail: number }} Summary
 * @typedef {{ domain: string, fetchedAt: string, cached: boolean, summary: Summary, findings: Finding[], raw: Record<string, DohResult[]> }} Report
 */

export {};
