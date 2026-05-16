/**
 * ShadowBuyer SSE client. Talks to the FastAPI backend at /run/stream.
 *
 * Backend URL is configured via VITE_SHADOWBUYER_URL (set to the Zeabur URL in
 * production; defaults to localhost:8000 in dev).
 *
 * Demo-cannot-crash contract: every event handler is permissive. If the backend
 * is unreachable, the UI falls back to baked-in deterministic mock events so
 * the stage demo still plays.
 */

export type NegotiatorTurn = {
  round: number;
  role: "hardball" | "diplomat" | "referee";
  headline: string;
  text: string;
  cites?: string[];
  price_target_per_host_mo?: number | null;
  deal_term_months?: number | null;
  mocked?: boolean;
};

export type Redline = {
  clause_key: string;
  clause_title: string;
  severity: "high" | "med" | "low";
  standard_text: string;
  vendor_text: string;
  similarity: number;
  deviation_summary: string;
  recommended_redline: string;
  embedding_backend: string;
};

export type EmailDraft = {
  to: string;
  from: string;
  cc?: string[];
  subject: string;
  body: string;
  strategy: "hardball" | "diplomat";
  cites?: string[];
  dry_run: boolean;
};

export type Summary = {
  ok: boolean;
  vendor?: string;
  competing_vendor?: string;
  hosts?: number;
  list_price_per_host_mo?: number;
  starting_quote_per_host_mo?: number;
  final_price_per_host_mo?: number;
  annual_savings_vs_list_usd?: number;
  discount_vs_list_pct?: number;
  winning_strategy?: "hardball" | "diplomat";
  contract_redline_count?: number;
  contract_high_severity?: number;
  evermind_writes?: number;
};

export type SponsorRow = {
  name: string;
  env: string[];
  role: string;
  owner: string;
  code_ref: string;
  env_status: "live" | "mock" | "n/a";
};

export type SponsorHealth = {
  total: number;
  counts: { live: number; mock: number; "n/a": number };
  sponsors: SponsorRow[];
  all_eleven_wired: boolean;
};

export type StreamEvent =
  | { event: "stage_start"; stage: string; label?: string; target_vendor?: string; competing_vendor?: string; list_price_per_host_mo?: number; starting_quote_per_host_mo?: number; hosts?: number }
  | { event: "stage_done"; stage: string; payload?: unknown }
  | { event: "negotiator_turn"; turn: NegotiatorTurn }
  | { event: "evermind_writes"; count: number; by_backend: Record<string, number> }
  | { event: "contract_diff_summary"; vendor: string; redline_count: number; severity_counts: { high: number; med: number; low: number }; embedding_backend: string }
  | { event: "redline"; redline: Redline }
  | { event: "summary"; payload: Summary }
  | { event: "done" };

export const SHADOWBUYER_URL =
  (import.meta.env.VITE_SHADOWBUYER_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:8000";

export function streamSwarm(
  onEvent: (e: StreamEvent) => void,
  opts: { category?: string; onError?: (e: unknown) => void; onClose?: () => void } = {},
): () => void {
  const url = `${SHADOWBUYER_URL}/run/stream?category=${encodeURIComponent(opts.category ?? "observability")}`;
  let es: EventSource | null = null;
  let closed = false;
  try {
    es = new EventSource(url);
  } catch (err) {
    opts.onError?.(err);
    return () => {};
  }
  es.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data) as StreamEvent;
      onEvent(parsed);
      if ((parsed as { event?: string }).event === "done" && !closed) {
        closed = true;
        es?.close();
        opts.onClose?.();
      }
    } catch (err) {
      opts.onError?.(err);
    }
  };
  es.onerror = (err) => {
    if (!closed) {
      closed = true;
      es?.close();
      opts.onError?.(err);
      opts.onClose?.();
    }
  };
  return () => {
    if (!closed) {
      closed = true;
      es?.close();
      opts.onClose?.();
    }
  };
}

export async function fetchEmailDraft(category = "observability"): Promise<EmailDraft | null> {
  try {
    const r = await fetch(`${SHADOWBUYER_URL}/api/email-draft?category=${encodeURIComponent(category)}`);
    if (!r.ok) return null;
    const json = (await r.json()) as { ok: boolean; email?: EmailDraft };
    return json.ok ? json.email ?? null : null;
  } catch {
    return null;
  }
}

export async function fetchSponsorHealth(): Promise<SponsorHealth | null> {
  try {
    const r = await fetch(`${SHADOWBUYER_URL}/api/sponsor-health`);
    if (!r.ok) return null;
    return (await r.json()) as SponsorHealth;
  } catch {
    return null;
  }
}

export async function fetchHealthz(): Promise<{ ok: boolean; version?: string; services?: Record<string, boolean> } | null> {
  try {
    const r = await fetch(`${SHADOWBUYER_URL}/healthz`);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// ── Mock events ─────────────────────────────────────────────────────────
// If the backend is unreachable, the swarm page plays these so the demo
// still works. Numbers match the locked backend mock output.
export const MOCK_EVENTS: StreamEvent[] = [
  { event: "stage_start", stage: "scout", label: "Researching observability vendors" },
  { event: "stage_done", stage: "scout" },
  { event: "stage_start", stage: "quote_hunter", label: "Pulling vendor quotes via Actionbook" },
  { event: "stage_done", stage: "quote_hunter" },
  {
    event: "stage_start",
    stage: "negotiator",
    label: "Adversarial negotiation: Datadog vs New Relic",
    target_vendor: "Datadog",
    competing_vendor: "New Relic",
    list_price_per_host_mo: 195,
    starting_quote_per_host_mo: 175.5,
    hosts: 500,
  },
  { event: "negotiator_turn", turn: { round: 1, role: "hardball", headline: "Open with competitor on the table", text: "New Relic just quoted us $160.00/host across 500 hosts. You're at $175.50. We need parity to keep this conversation moving. Match $160.00 this week and we keep talking; otherwise we shortlist drops to two and you're not on it.", cites: ["competitor:New Relic@$160.00/host", "hosts:500", "shortlist_threat:cut_to_two_vendors"], price_target_per_host_mo: 160, mocked: true } },
  { event: "negotiator_turn", turn: { round: 1, role: "diplomat", headline: "Open: long-term partnership frame", text: "We're not shopping on price — we're picking an observability partner for the next three years. 500 hosts today, projecting 3× by end of next year. Lock us in at $158.00/host for 36 months and your ARR triples from this one account by Q3 2027.", cites: ["hosts_today:500", "expansion:3x_18mo", "arr_growth_argument"], price_target_per_host_mo: 158, deal_term_months: 36, mocked: true } },
  { event: "negotiator_turn", turn: { round: 2, role: "hardball", headline: "Escalate: quarter-end + internal review", text: "Our CFO froze net-new SaaS spend pending Q-review. The only way this gets unstuck before 2026-06-30 is if you come in under New Relic, not at parity. $158.50/host, signed by Friday, or it slides to next quarter and your AE eats the slip.", cites: ["quarter_end:2026-06-30", "cfo_spend_freeze", "ae_quota_pressure:slip_risk"], price_target_per_host_mo: 158.5, mocked: true } },
  { event: "negotiator_turn", turn: { round: 2, role: "diplomat", headline: "Add value: case study + reference", text: "Sweetener: we'll be a public reference customer. Joint case study, quote from our CTO, logo on your homepage, speaking slot at your conference. That's worth more than the $155.00/host delta over 36 months.", cites: ["reference_customer", "joint_case_study", "conference_speaking_slot", "homepage_logo"], price_target_per_host_mo: 155, deal_term_months: 36, mocked: true } },
  { event: "negotiator_turn", turn: { round: 3, role: "hardball", headline: "Close: deadline + walk-away", text: "Last move. $157.50/host, 12 months, no auto-renew clause, MSA redlines in our favor on liability cap. Signed by EOD Friday or we sign with New Relic Monday morning. Your AE knows this is real — Honeycomb POC is already provisioned as fallback #2.", cites: ["deadline:friday_eod", "fallback_poc:honeycomb_provisioned", "msa_redlines:liability_cap"], price_target_per_host_mo: 157.5, deal_term_months: 12, mocked: true } },
  { event: "negotiator_turn", turn: { round: 3, role: "diplomat", headline: "Close: expansion rights for price lock", text: "Final shape: $153.00/host, 36 months, 8% annual price-lock cap, expansion rights to APM + RUM at the same per-host rate. Everyone's CFO can defend this. Send paper today, we counter-sign Monday.", cites: ["price_lock:8pct_annual_cap", "expansion_rights:apm_rum_same_rate", "term:36mo"], price_target_per_host_mo: 153, deal_term_months: 36, mocked: true } },
  { event: "negotiator_turn", turn: { round: 4, role: "referee", headline: "Verdict: HARDBALL opens, DIPLOMAT closes", text: "HARDBALL takes round one. The quarter-end clock plus the New Relic quote on paper is discrete, time-bounded leverage. DIPLOMAT's 36-month case-study sweetener is the right second move once price is anchored. Recommended play: open HARDBALL through Friday EOD, close with DIPLOMAT's expansion-rights wrapper.", cites: ["winner:hardball", "hardball_savings_yr1:$225,000", "final_price:$157.50/host"], price_target_per_host_mo: 157.5, mocked: true } },
  { event: "stage_done", stage: "negotiator" },
  { event: "stage_start", stage: "contract_diff", label: "Comparing vendor MSA to standard template" },
  { event: "contract_diff_summary", vendor: "Datadog", redline_count: 15, severity_counts: { high: 7, med: 6, low: 2 }, embedding_backend: "heuristic" },
  { event: "stage_done", stage: "contract_diff" },
  { event: "summary", payload: { ok: true, vendor: "Datadog", competing_vendor: "New Relic", hosts: 500, list_price_per_host_mo: 195, starting_quote_per_host_mo: 175.5, final_price_per_host_mo: 157.5, annual_savings_vs_list_usd: 225000, discount_vs_list_pct: 19.2, winning_strategy: "hardball", contract_redline_count: 15, contract_high_severity: 7, evermind_writes: 10 } },
  { event: "done" },
];

export const MOCK_REDLINES: Redline[] = [
  { clause_key: "auto_renewal", clause_title: "Auto-Renewal", severity: "high", standard_text: "30-day non-renewal notice.", vendor_text: "90-day non-renewal notice required.", similarity: 0.63, deviation_summary: "Vendor's non-renewal notice window is 90 days vs. our 30. Auto-renewal trap.", recommended_redline: "Reduce non-renewal notice from 90 to 30 days. Known auto-renewal trap.", embedding_backend: "heuristic" },
  { clause_key: "data_deletion", clause_title: "Data Deletion on Termination", severity: "high", standard_text: "30-day data deletion with certification.", vendor_text: "(missing from vendor MSA)", similarity: 0.0, deviation_summary: "Vendor MSA omits any post-termination data deletion clause entirely.", recommended_redline: "MISSING CLAUSE — require 30-day data deletion on termination with written certification.", embedding_backend: "heuristic" },
  { clause_key: "data_processing", clause_title: "Data Processing Addendum", severity: "high", standard_text: "DPA attached as Exhibit A; no training on customer data.", vendor_text: "DPA available upon request; vendor may train on aggregated telemetry.", similarity: 0.38, deviation_summary: "Vendor reserves right to train models on Customer telemetry, even aggregated.", recommended_redline: "Attach DPA at signing. Strike all training/benchmarking rights on telemetry.", embedding_backend: "heuristic" },
  { clause_key: "indemnification", clause_title: "Indemnification", severity: "high", standard_text: "Indemnify for IP, gross negligence, willful misconduct.", vendor_text: "Indemnify solely for direct IP claims; carve out modifications + OSS.", similarity: 0.5, deviation_summary: "Vendor narrows indemnity to direct IP claims only; carves out modifications and OSS.", recommended_redline: "Expand indemnity to gross negligence and willful misconduct.", embedding_backend: "heuristic" },
  { clause_key: "limitation_of_liability", clause_title: "Limitation of Liability", severity: "high", standard_text: "12 months fees or $1M, whichever greater.", vendor_text: "3 months fees, excludes consequential.", similarity: 0.4, deviation_summary: "Vendor caps liability at 3 months of fees vs. our 12-month / $1M floor.", recommended_redline: "Restore 12-month aggregate cap or $1M, whichever is greater.", embedding_backend: "heuristic" },
  { clause_key: "price_lock", clause_title: "Price Lock", severity: "high", standard_text: "Year-2+ increases capped at 5% annually.", vendor_text: "Vendor reserves right to adjust at then-current list rates.", similarity: 0.37, deviation_summary: "Vendor reserves unilateral renewal price increases; no cap.", recommended_redline: "Cap annual price escalation at 5% post initial term.", embedding_backend: "heuristic" },
  { clause_key: "warranty", clause_title: "Warranty", severity: "high", standard_text: "Service materially conforms to documentation.", vendor_text: "AS IS, all implied warranties disclaimed.", similarity: 0.33, deviation_summary: "Vendor disclaims all warranties; service is 'AS IS' with no remedy.", recommended_redline: "Replace 'AS IS' with materially-conforms warranty + re-performance remedy.", embedding_backend: "heuristic" },
  { clause_key: "audit_rights", clause_title: "Audit Rights", severity: "med", standard_text: "Annual audit, 30-day notice; SOC 2 delivered automatically.", vendor_text: "SOC 2 on request at vendor's discretion; no on-site audit.", similarity: 0.42, deviation_summary: "Vendor offers SOC 2 on request, no on-site audit, at vendor's discretion.", recommended_redline: "Restore annual on-site audit right; require SOC 2 delivered automatically.", embedding_backend: "heuristic" },
  { clause_key: "ip_assignment", clause_title: "IP Assignment", severity: "med", standard_text: "Each party retains pre-existing IP; customer owns data.", vendor_text: "Vendor receives perpetual royalty-free license to customer feedback.", similarity: 0.49, deviation_summary: "Vendor takes perpetual royalty-free license to Customer feedback and ideas.", recommended_redline: "Strike perpetual feedback license. Feedback should not transfer IP.", embedding_backend: "heuristic" },
  { clause_key: "publicity", clause_title: "Publicity Rights", severity: "med", standard_text: "(not in standard template)", vendor_text: "Vendor may use customer name + logo without consent.", similarity: 0.0, deviation_summary: "Vendor unilaterally claims Customer logo + name usage rights with no opt-out.", recommended_redline: "Strike unilateral logo/name usage. Mutual written consent per use.", embedding_backend: "heuristic" },
  { clause_key: "sla_credits", clause_title: "SLA Credits", severity: "med", standard_text: "99.9% uptime; 10% credit per 0.1% miss.", vendor_text: "99.5% uptime; credits capped at 10%; require written claim.", similarity: 0.39, deviation_summary: "Vendor weakens SLA to 99.5%, caps credits at 10%, and gates on written request.", recommended_redline: "Raise SLA to 99.9%. Remove credit cap. Auto-issue credits.", embedding_backend: "heuristic" },
  { clause_key: "subprocessors", clause_title: "Subprocessors", severity: "med", standard_text: "15-day objection window; right to terminate.", vendor_text: "Vendor engages subprocessors at its discretion.", similarity: 0.32, deviation_summary: "Vendor controls subprocessor changes unilaterally; no Customer objection right.", recommended_redline: "Add 15-day Customer objection window + termination right.", embedding_backend: "heuristic" },
  { clause_key: "termination_for_convenience", clause_title: "Termination for Convenience", severity: "med", standard_text: "60-day notice, pro-rated refund.", vendor_text: "No mid-term termination; pay all committed fees.", similarity: 0.44, deviation_summary: "Vendor disallows termination during committed term; charges remaining fees.", recommended_redline: "Add 60-day termination-for-convenience right with pro-rated refund.", embedding_backend: "heuristic" },
  { clause_key: "confidentiality", clause_title: "Confidentiality", severity: "low", standard_text: "5 years survival; trade secrets indefinite.", vendor_text: "3 years survival.", similarity: 0.53, deviation_summary: "Confidentiality term shortened to 3 years vs. our 5.", recommended_redline: "Extend confidentiality survival from 3 to 5 years.", embedding_backend: "heuristic" },
  { clause_key: "governing_law", clause_title: "Governing Law & Venue", severity: "low", standard_text: "Delaware law; AAA arbitration in SF.", vendor_text: "New York law; jury trial waived.", similarity: 0.32, deviation_summary: "Vendor's venue is NY with jury waiver; we prefer Delaware/SF with AAA arbitration.", recommended_redline: "Negotiate neutral venue. Preserve jury trial right where applicable.", embedding_backend: "heuristic" },
];

export const MOCK_EMAIL: EmailDraft = {
  to: "morgan.chen@datadog.com",
  from: "procurement@shadowbuyer.ai",
  cc: ["procurement-cc@shadowbuyer.ai"],
  subject: "Datadog — closing by Friday at $157.50/host",
  body: "Hi Morgan,\n\nThanks for the quote on Datadog at $175.50/host/mo across 500 hosts.\n\nWe've finalized our shortlist for observability and need to close this week. New Relic has a competing offer on the table at $160.00/host. Given the quarter close on 2026-06-30, we'd like to move forward with the following terms:\n\n  • Price: $157.50/host/month\n  • Term: 12 months\n  • Auto-renewal: 30-day notice window (not 90)\n  • Liability cap: 12 months of fees (not 3)\n  • Annual price escalation: capped at 5%\n\nOur Honeycomb POC is provisioned as backup if we can't align by Friday EOD.\n\nBest,\nProcurement, ShadowBuyer",
  strategy: "hardball",
  cites: ["competing_offer:New Relic@$160.00", "quarter_end:2026-06-30", "fallback_poc:honeycomb", "final_price:$157.50/host"],
  dry_run: true,
};

export const MOCK_SUMMARY: Summary = {
  ok: true,
  vendor: "Datadog",
  competing_vendor: "New Relic",
  hosts: 500,
  list_price_per_host_mo: 195,
  starting_quote_per_host_mo: 175.5,
  final_price_per_host_mo: 157.5,
  annual_savings_vs_list_usd: 225000,
  discount_vs_list_pct: 19.2,
  winning_strategy: "hardball",
  contract_redline_count: 15,
  contract_high_severity: 7,
  evermind_writes: 10,
};
