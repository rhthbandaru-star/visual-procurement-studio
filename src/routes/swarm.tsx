import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion, useMotionValue, useTransform, animate, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchEmailDraft,
  fetchSponsorHealth,
  streamSwarm,
  MOCK_EMAIL,
  MOCK_EVENTS,
  MOCK_REDLINES,
  MOCK_SUMMARY,
  SHADOWBUYER_URL,
  type EmailDraft,
  type NegotiatorTurn,
  type Redline,
  type SponsorHealth,
  type StreamEvent,
  type Summary,
} from "../lib/shadowbuyer";

import "./swarm.css";

export const Route = createFileRoute("/swarm")({ component: SwarmPage });

const STAGES = [
  { key: "scout", label: "Scout" },
  { key: "quote_hunter", label: "Quote Hunter" },
  { key: "negotiator", label: "Negotiator" },
  { key: "contract_diff", label: "Contract Diff" },
] as const;

type StageState = "idle" | "active" | "done";

const SPRING = { type: "spring" as const, stiffness: 160, damping: 22, mass: 0.6 };
const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;

function fmtCurrency(n: number | undefined | null, opts: { compact?: boolean } = {}): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: opts.compact ? "compact" : "standard",
  }).format(n);
}

function fmtPerHost(n: number | undefined | null): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function SwarmPage() {
  const [streaming, setStreaming] = useState(false);
  const [stages, setStages] = useState<Record<string, StageState>>({});
  const [hardball, setHardball] = useState<NegotiatorTurn[]>([]);
  const [diplomat, setDiplomat] = useState<NegotiatorTurn[]>([]);
  const [referee, setReferee] = useState<NegotiatorTurn | null>(null);
  const [meta, setMeta] = useState<{ vendor?: string; competing?: string; hosts?: number; list?: number; starting?: number }>({});
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [redlines, setRedlines] = useState<Redline[]>([]);
  const [redlineHeader, setRedlineHeader] = useState<{ vendor: string; high: number; med: number; low: number; backend: string } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [email, setEmail] = useState<EmailDraft | null>(null);
  const [sponsor, setSponsor] = useState<SponsorHealth | null>(null);
  const [mode, setMode] = useState<"idle" | "live" | "mock">("idle");
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    fetchSponsorHealth().then((s) => s && setSponsor(s));
  }, []);

  const resetAll = useCallback(() => {
    setStages({});
    setHardball([]);
    setDiplomat([]);
    setReferee(null);
    setMeta({});
    setLivePrice(null);
    setRedlines([]);
    setRedlineHeader(null);
    setSummary(null);
    setEmail(null);
  }, []);

  const handleEvent = useCallback((ev: StreamEvent) => {
    if ("stage" in ev && (ev.event === "stage_start" || ev.event === "stage_done")) {
      setStages((s) => ({ ...s, [ev.stage]: ev.event === "stage_start" ? "active" : "done" }));
    }
    if (ev.event === "stage_start" && ev.stage === "negotiator") {
      setMeta({
        vendor: ev.target_vendor,
        competing: ev.competing_vendor,
        hosts: ev.hosts,
        list: ev.list_price_per_host_mo,
        starting: ev.starting_quote_per_host_mo,
      });
      setLivePrice(ev.starting_quote_per_host_mo ?? null);
    }
    if (ev.event === "negotiator_turn") {
      const t = ev.turn;
      if (t.price_target_per_host_mo != null) setLivePrice(t.price_target_per_host_mo);
      if (t.role === "hardball") setHardball((arr) => [...arr, t]);
      else if (t.role === "diplomat") setDiplomat((arr) => [...arr, t]);
      else if (t.role === "referee") setReferee(t);
    }
    if (ev.event === "contract_diff_summary") {
      setRedlineHeader({ vendor: ev.vendor, high: ev.severity_counts.high, med: ev.severity_counts.med, low: ev.severity_counts.low, backend: ev.embedding_backend });
    }
    if (ev.event === "redline") {
      setRedlines((arr) => [...arr, ev.redline]);
    }
    if (ev.event === "summary") {
      setSummary(ev.payload);
    }
  }, []);

  const playMock = useCallback(() => {
    setMode("mock");
    setStreaming(true);
    resetAll();
    let i = 0;
    const step = () => {
      if (i >= MOCK_EVENTS.length) {
        setStreaming(false);
        setEmail(MOCK_EMAIL);
        // Trickle redlines in to match the live flow's stagger.
        let r = 0;
        const redlineTimer = setInterval(() => {
          if (r >= MOCK_REDLINES.length) {
            clearInterval(redlineTimer);
            return;
          }
          setRedlines((arr) => [...arr, MOCK_REDLINES[r]]);
          r += 1;
        }, 120);
        return;
      }
      const ev = MOCK_EVENTS[i];
      handleEvent(ev);
      i += 1;
      const delay = ev.event === "negotiator_turn" ? 520 : 280;
      setTimeout(step, delay);
    };
    step();
  }, [handleEvent, resetAll]);

  const runSwarm = useCallback(() => {
    if (streaming) return;
    resetAll();
    setStreaming(true);
    setMode("live");
    let receivedAny = false;
    const close = streamSwarm(
      (ev) => {
        receivedAny = true;
        handleEvent(ev);
      },
      {
        onError: () => {
          if (!receivedAny) {
            // Backend unreachable from the very first message — play mock instead.
            playMock();
          }
        },
        onClose: () => {
          setStreaming(false);
          fetchEmailDraft().then((em) => setEmail(em ?? MOCK_EMAIL));
        },
      },
    );
    cancelRef.current = close;
  }, [handleEvent, playMock, resetAll, streaming]);

  useEffect(() => () => cancelRef.current?.(), []);

  const refereeCites = referee?.cites ?? [];

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.32, ease: EASE_OUT }}>
      <div className="sb-root">
        <Header running={streaming} mode={mode} onRun={runSwarm} />
        <Tagline />
        <StatsRow meta={meta} livePrice={livePrice} />
        <PipelinePills stages={stages} />

        <main className="mx-auto grid w-full max-w-[1280px] gap-4 px-6 py-6 md:grid-cols-2 md:gap-6 md:px-10">
          <NegotiationColumn role="hardball" turns={hardball} />
          <NegotiationColumn role="diplomat" turns={diplomat} />
        </main>

        <AnimatePresence>
          {referee && summary && (
            <VerdictCard verdict={referee} summary={summary} cites={refereeCites} />
          )}
        </AnimatePresence>

        <AnimatePresence>{email && <EmailCard email={email} />}</AnimatePresence>

        {(redlineHeader || redlines.length > 0) && (
          <RedlinesPanel header={redlineHeader} redlines={redlines} />
        )}

        <SponsorStrip sponsor={sponsor} />

        <Footer />
      </div>
    </MotionConfig>
  );
}

// ── Header ───────────────────────────────────────────────────────────────
function Header({ running, mode, onRun }: { running: boolean; mode: "idle" | "live" | "mock"; onRun: () => void }) {
  const tag = mode === "mock" ? "demo · mock fallback" : mode === "live" ? "live stream" : "ready";
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--sb-line)] bg-[hsl(220_10%_6%/.75)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-6 px-6 py-4 md:px-10">
        <div className="flex items-center gap-3">
          <span className={`sb-dot ${running ? "live" : ""}`} />
          <Link to="/swarm" className="text-[15px] font-semibold tracking-tight text-[var(--sb-ink)] hover:opacity-80">
            ShadowBuyer
          </Link>
          <span className="sb-eyebrow">{tag}</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/" className="hidden text-[12px] text-[var(--sb-ink-2)] hover:text-[var(--sb-ink)] sm:inline-block">
            Workspace →
          </Link>
          <motion.button
            type="button"
            onClick={onRun}
            disabled={running}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            className="rounded-md bg-[var(--sb-accent)] px-4 py-2 text-[13px] font-semibold tracking-tight text-[hsl(220_30%_10%)] shadow-[0_1px_0_0_hsl(220_90%_70%/.4)_inset,0_-1px_0_0_hsl(220_90%_50%/.3)_inset] disabled:opacity-50"
          >
            {running ? "Streaming…" : "Run the swarm →"}
          </motion.button>
        </div>
      </div>
    </header>
  );
}

// ── Tagline ──────────────────────────────────────────────────────────────
function Tagline() {
  return (
    <section className="border-b border-[var(--sb-line)]">
      <div className="mx-auto w-full max-w-[1280px] px-6 py-12 md:px-10 md:py-20">
        <p className="sb-eyebrow">$5T procurement market · live demo · Datadog</p>
        <h1 className="mt-4 max-w-3xl text-[40px] font-semibold leading-[1.08] tracking-[-0.02em] text-[var(--sb-ink)] md:text-[56px]">
          Six weeks of demos and contract games. <span className="text-[var(--sb-ink-2)]">Collapsed to six hours.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-[1.55] text-[var(--sb-ink-2)] md:text-[17px]">
          Watch a six-agent swarm research observability vendors, run an adversarial negotiation between Qwen
          (<span className="text-[var(--sb-hb)]">Hardball</span>) and Z.ai{" "}
          (<span className="text-[var(--sb-dp)]">Diplomat</span>), draft the AE email, and redline the MSA — live.
        </p>
      </div>
    </section>
  );
}

// ── Stats row ────────────────────────────────────────────────────────────
function StatsRow({ meta, livePrice }: { meta: { vendor?: string; competing?: string; hosts?: number; list?: number; starting?: number }; livePrice: number | null }) {
  return (
    <section className="border-b border-[var(--sb-line)]">
      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-2 gap-x-6 gap-y-4 px-6 py-5 md:grid-cols-5 md:px-10">
        <Stat label="Vendor" value={meta.vendor ?? "—"} />
        <Stat label="Competing" value={meta.competing ?? "—"} />
        <Stat label="Hosts" value={meta.hosts != null ? String(meta.hosts) : "—"} mono />
        <Stat label="List $/host/mo" value={meta.list != null ? `$${meta.list.toFixed(2)}` : "—"} mono />
        <LivePriceStat value={livePrice} />
      </div>
    </section>
  );
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="sb-eyebrow">{label}</div>
      <div className={`mt-1 text-[15px] text-[var(--sb-ink)] ${mono ? "sb-mono" : ""}`}>{value}</div>
    </div>
  );
}

function LivePriceStat({ value }: { value: number | null }) {
  const mv = useMotionValue(value ?? 0);
  const display = useTransform(mv, (v) => `$${v.toFixed(2)}`);
  useEffect(() => {
    if (value == null) return;
    const controls = animate(mv, value, { type: "spring", stiffness: 80, damping: 14, mass: 0.7 });
    return () => controls.stop();
  }, [mv, value]);
  return (
    <div>
      <div className="sb-eyebrow">Live target $/host/mo</div>
      <motion.div className="sb-mono mt-1 text-[24px] font-semibold tracking-tight text-[var(--sb-rf)]">
        {value == null ? "—" : <motion.span>{display}</motion.span>}
      </motion.div>
    </div>
  );
}

// ── Pipeline pills ───────────────────────────────────────────────────────
function PipelinePills({ stages }: { stages: Record<string, StageState> }) {
  return (
    <section className="border-b border-[var(--sb-line)]">
      <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-2 px-6 py-4 md:px-10">
        {STAGES.map((s, i) => {
          const state = stages[s.key] ?? "idle";
          const color = state === "done" ? "var(--sb-dp)" : state === "active" ? "var(--sb-accent)" : "var(--sb-ink-3)";
          return (
            <div key={s.key} className="flex items-center gap-2">
              <motion.div
                className="sb-mono flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
                style={{ borderColor: color, color }}
                animate={state === "active" ? { scale: [1, 1.03, 1] } : { scale: 1 }}
                transition={state === "active" ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
              >
                <span className="size-1.5 rounded-full" style={{ background: color }} />
                {s.label}
              </motion.div>
              {i < STAGES.length - 1 && <span className="text-[var(--sb-line-2)]">→</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Negotiation columns ──────────────────────────────────────────────────
function NegotiationColumn({ role, turns }: { role: "hardball" | "diplomat"; turns: NegotiatorTurn[] }) {
  const isHB = role === "hardball";
  const accent = isHB ? "var(--sb-hb)" : "var(--sb-dp)";
  const title = isHB ? "Hardball" : "Diplomat";
  const model = isHB ? "Qwen3-Max via TokenRouter" : "GLM-5.1 via Z.ai";
  return (
    <section className="flex flex-col">
      <div className="flex items-baseline justify-between border-b border-dashed border-[var(--sb-line)] pb-2">
        <h2 className="sb-eyebrow" style={{ color: accent }}>{title}</h2>
        <span className="sb-mono text-[10px] text-[var(--sb-ink-3)]">{model}</span>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {turns.map((t, idx) => (
            <TurnCard key={`${role}-${t.round}-${idx}`} turn={t} accent={accent} />
          ))}
        </AnimatePresence>
        {turns.length === 0 && <div className="rounded-md border border-dashed border-[var(--sb-line)] p-4 text-[12px] text-[var(--sb-ink-3)]">Waiting for {title.toLowerCase()} to open the round…</div>}
      </div>
    </section>
  );
}

function TurnCard({ turn, accent }: { turn: NegotiatorTurn; accent: string }) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.article
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.32, ease: EASE_OUT }}
      className="rounded-lg border border-[var(--sb-line)] bg-[var(--sb-surface)] p-4"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <header className="flex items-baseline justify-between gap-3">
        <span className="sb-eyebrow">Round {turn.round}{turn.mocked && " · mock"}</span>
        {turn.price_target_per_host_mo != null && (
          <motion.span
            className="sb-mono text-[13px] text-[var(--sb-rf)]"
            initial={prefersReduced ? false : { scale: 1.06, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={SPRING}
          >
            ${turn.price_target_per_host_mo.toFixed(2)}/host{turn.deal_term_months ? ` · ${turn.deal_term_months}mo` : ""}
          </motion.span>
        )}
      </header>
      <h3 className="mt-2 text-[13px] font-semibold leading-snug tracking-tight text-[var(--sb-ink)]">{turn.headline}</h3>
      <p className="mt-2 text-[13px] leading-[1.55] text-[var(--sb-ink)]">{turn.text}</p>
      {turn.cites && turn.cites.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {turn.cites.map((c) => (
            <span key={c} className="sb-mono rounded-full bg-white/[0.04] px-2 py-[2px] text-[10px] text-[var(--sb-ink-2)]">
              {c}
            </span>
          ))}
        </div>
      )}
    </motion.article>
  );
}

// ── Verdict ──────────────────────────────────────────────────────────────
function VerdictCard({ verdict, summary, cites }: { verdict: NegotiatorTurn; summary: Summary; cites: string[] }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.42, ease: EASE_OUT }}
      className="mx-6 mb-6 mt-2 rounded-xl border p-6 md:mx-10 md:p-8"
      style={{
        borderColor: "hsl(45 95% 60% / 0.35)",
        background: "linear-gradient(180deg, hsl(45 95% 60% / 0.06), hsl(45 95% 60% / 0))",
      }}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="sb-eyebrow" style={{ color: "var(--sb-rf)" }}>Referee verdict</h2>
        {cites.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {cites.map((c) => (
              <span key={c} className="sb-mono rounded-full bg-white/[0.04] px-2 py-[2px] text-[10px] text-[var(--sb-ink-2)]">
                {c}
              </span>
            ))}
          </div>
        )}
      </header>
      <h3 className="mt-3 text-[20px] font-semibold tracking-tight text-[var(--sb-ink)]">{verdict.headline}</h3>
      <p className="mt-2 max-w-3xl text-[14px] leading-[1.6] text-[var(--sb-ink)]">{verdict.text}</p>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
        <Metric label="Final $/host/mo" value={fmtPerHost(summary.final_price_per_host_mo)} tint="var(--sb-rf)" />
        <Metric label="Discount vs list" value={summary.discount_vs_list_pct != null ? `${summary.discount_vs_list_pct.toFixed(1)}%` : "—"} tint="var(--sb-rf)" />
        <Metric label="Annual savings" value={fmtCurrency(summary.annual_savings_vs_list_usd)} tint="var(--sb-rf)" />
        <Metric label="Winning strategy" value={summary.winning_strategy ?? "—"} tint="var(--sb-rf)" />
      </div>
    </motion.section>
  );
}

function Metric({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div>
      <div className="sb-eyebrow">{label}</div>
      <div className="sb-mono mt-1 text-[18px] font-semibold tracking-tight" style={{ color: tint }}>{value}</div>
    </div>
  );
}

// ── Email card ───────────────────────────────────────────────────────────
function EmailCard({ email }: { email: EmailDraft }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: EASE_OUT }}
      className="mx-6 mb-6 overflow-hidden rounded-xl border border-[var(--sb-line)] bg-[var(--sb-surface)] md:mx-10"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--sb-line)] px-5 py-4">
        <h2 className="sb-eyebrow" style={{ color: "var(--sb-dp)" }}>Outbound email to AE · drafted, not sent</h2>
        <span className="sb-mono text-[11px] text-[var(--sb-ink-3)]">{email.dry_run ? "dry-run" : "sent"} · {email.strategy}</span>
      </header>
      <div className="grid grid-cols-[80px_1fr] gap-x-4 gap-y-1 border-b border-[var(--sb-line)] px-5 py-3 text-[12px]">
        <div className="sb-eyebrow">From</div>
        <div className="sb-mono text-[var(--sb-ink)]">{email.from}</div>
        <div className="sb-eyebrow">To</div>
        <div className="sb-mono text-[var(--sb-ink)]">{email.to}</div>
      </div>
      <div className="border-b border-[var(--sb-line)] px-5 py-3 text-[14px] font-semibold tracking-tight text-[var(--sb-ink)]">{email.subject}</div>
      <pre className="sb-mono m-0 whitespace-pre-wrap break-words bg-[hsl(220_10%_5%)] px-5 py-5 text-[12.5px] leading-[1.6] text-[var(--sb-ink)]">{email.body}</pre>
      {email.cites && email.cites.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-[var(--sb-line)] px-5 py-3">
          {email.cites.map((c) => (
            <span key={c} className="sb-mono rounded-full bg-[hsl(220_90%_64%/.08)] px-2 py-[2px] text-[10px] text-[var(--sb-accent)]">
              {c}
            </span>
          ))}
        </div>
      )}
    </motion.section>
  );
}

// ── Redlines panel ───────────────────────────────────────────────────────
function RedlinesPanel({ header, redlines }: { header: { vendor: string; high: number; med: number; low: number; backend: string } | null; redlines: Redline[] }) {
  const count = redlines.length || (header ? header.high + header.med + header.low : 0);
  return (
    <section className="mx-6 mb-10 rounded-xl border border-[var(--sb-line)] bg-[var(--sb-surface)] p-5 md:mx-10 md:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-dashed border-[var(--sb-line)] pb-3">
        <h2 className="sb-eyebrow" style={{ color: "var(--sb-accent)" }}>Contract Diff · MSA redlines</h2>
        {header && (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <SevPill kind="high" count={header.high} />
            <SevPill kind="med" count={header.med} />
            <SevPill kind="low" count={header.low} />
            <span className="sb-mono rounded-full border border-[var(--sb-line)] px-2 py-[2px] text-[var(--sb-ink-3)]">
              backend: {header.backend}
            </span>
          </div>
        )}
      </header>
      <div className="mt-2 flex items-baseline gap-2 text-[var(--sb-ink)]">
        <span className="sb-mono text-[28px] font-semibold tracking-tight text-[var(--sb-rf)]">{count}</span>
        <span className="text-[13px] text-[var(--sb-ink-2)]">deviations flagged{header ? ` in ${header.vendor} MSA` : ""}</span>
      </div>
      <div className="mt-4 flex flex-col">
        <AnimatePresence initial={false}>
          {redlines.map((r, idx) => (
            <RedlineRow key={`${r.clause_key}-${idx}`} r={r} />
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

function SevPill({ kind, count }: { kind: "high" | "med" | "low"; count: number }) {
  const tint = kind === "high" ? "var(--sb-hb)" : kind === "med" ? "var(--sb-rf)" : "var(--sb-ink-3)";
  return (
    <span
      className="sb-mono rounded-full border px-2 py-[2px] uppercase tracking-[0.14em]"
      style={{ borderColor: tint, color: tint }}
    >
      {kind} {count}
    </span>
  );
}

function RedlineRow({ r }: { r: Redline }) {
  const tint = r.severity === "high" ? "var(--sb-hb)" : r.severity === "med" ? "var(--sb-rf)" : "var(--sb-ink-3)";
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
      className="grid grid-cols-[90px_1fr_64px] items-start gap-4 border-t border-dashed border-[var(--sb-line)] py-3"
    >
      <div>
        <span
          className="sb-mono inline-flex rounded-sm px-2 py-[2px] text-[10px] uppercase tracking-[0.16em]"
          style={{ background: `${tint.replace("var(", "color-mix(in oklab, ").replace(")", " 18%, transparent)")}`, color: tint }}
        >
          {r.severity}
        </span>
      </div>
      <div>
        <div className="text-[13px] font-semibold tracking-tight text-[var(--sb-ink)]">{r.clause_title}</div>
        <div className="mt-1 text-[12.5px] leading-[1.5] text-[var(--sb-ink)]">{r.deviation_summary}</div>
        <div className="mt-1.5 text-[11.5px] leading-[1.55] text-[var(--sb-dp)]">↳ {r.recommended_redline}</div>
      </div>
      <div className="sb-mono text-right text-[11px] tabular-nums text-[var(--sb-ink-3)]">sim {r.similarity.toFixed(2)}</div>
    </motion.div>
  );
}

// ── Sponsor strip ────────────────────────────────────────────────────────
const SPONSOR_FALLBACK = [
  "AgentField", "TokenRouter", "Qwen Cloud", "Z.ai", "Evermind", "Nosana",
  "Bright Data", "Actionbook", "Zeabur", "Qoder", "Butterbase",
];

function SponsorStrip({ sponsor }: { sponsor: SponsorHealth | null }) {
  const items = useMemo(() => {
    if (sponsor) {
      return sponsor.sponsors.map((s) => ({ name: s.name, status: s.env_status }));
    }
    return SPONSOR_FALLBACK.map((name) => ({ name, status: "mock" as const }));
  }, [sponsor]);
  const liveCount = sponsor?.counts.live ?? 0;
  const mockCount = sponsor?.counts.mock ?? items.length;
  return (
    <section className="border-t border-[var(--sb-line)] bg-[hsl(220_10%_4%)]">
      <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-2 px-6 py-5 md:px-10">
        <span className="sb-eyebrow mr-3">Built on</span>
        {items.map((s, i) => (
          <motion.span
            key={s.name}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * i, ease: EASE_OUT }}
            className="sb-mono rounded-full border px-2.5 py-[3px] text-[11px]"
            style={{
              borderColor: s.status === "live" ? "var(--sb-dp)" : s.status === "n/a" ? "var(--sb-line)" : "var(--sb-line)",
              color: s.status === "live" ? "var(--sb-dp)" : s.status === "n/a" ? "var(--sb-ink)" : "var(--sb-ink-2)",
            }}
          >
            {s.name}
          </motion.span>
        ))}
        <span className="sb-mono ml-3 text-[10px] text-[var(--sb-ink-3)]">
          {liveCount} live · {mockCount} mock · all 11 wired
        </span>
      </div>
    </section>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="border-t border-[var(--sb-line)]">
      <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-3 px-6 py-5 text-[11px] text-[var(--sb-ink-3)] md:px-10">
        <div className="flex flex-wrap items-center gap-3">
          <span>shadowbuyer · adversarial procurement</span>
          <a href={`${SHADOWBUYER_URL}/api/sponsor-health`} target="_blank" rel="noreferrer" className="text-[var(--sb-accent)] hover:underline">/api/sponsor-health</a>
          <a href={`${SHADOWBUYER_URL}/healthz`} target="_blank" rel="noreferrer" className="text-[var(--sb-accent)] hover:underline">/healthz</a>
        </div>
        <a href="https://github.com/LeSingh1/shadowbuyer" target="_blank" rel="noreferrer" className="text-[var(--sb-accent)] hover:underline">github</a>
      </div>
    </footer>
  );
}
