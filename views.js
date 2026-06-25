// HTML rendering without a framework: guardrail pipeline, stats tiles,
// agent role cards, approval queue, audit, and A2A.

import {
  escapeHtml, formatMoney, agentsForAccount, paymentsForAgent,
  paymentsForAccount, todaySpentCents, getAgent, policyProfileLabel, policyTemplateIds,
} from './store.js';
import { creditTopupProviders } from './credit-scenarios.js';

const STATUS_BADGE = {
  received: ['#eef0f4', '#475467'],
  paid: ['#d1fae5', '#065f46'],
  executing: ['#cffafe', '#155e75'],
  needs_human: ['#eef2ff', '#3730a3'],
  pending_reversible: ['#e0e7ff', '#3730a3'],
  cancelled: ['#f3f4f6', '#4b5563'],
  rejected: ['#fee2e2', '#991b1b'],
  blocked_by_verifier: ['#fee2e2', '#991b1b'],
};

const badge = (status) => {
  const [bg, fg] = STATUS_BADGE[status] ?? STATUS_BADGE.received;
  return `<span class="badge" style="background:${bg};color:${fg}">${escapeHtml(status)}</span>`;
};

const displayText = (value) => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
};

const verdictChip = (v) => {
  if (!v) return '<span class="muted">—</span>';
  const cls = v.allow ? 'ok' : 'bad';
  return `<span class="chip ${cls}" title="${escapeHtml(displayText(v.reason))}">${v.allow ? '✓ allow' : '✗ block'} · ${escapeHtml(displayText(v.source))} · ${escapeHtml(displayText(v.risk))}</span>`;
};

const layout = (title, body) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="manifest" href="/manifest.json">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<title>${escapeHtml(title)}</title>
<style>
  :root{--ink:#0f172a;--ink2:#1e293b;--mut:#64748b;--line:#e2e8f0;--brand:#5b3df5;--brand2:#6d28d9;--bg:#f8fafc;--ok:#047857;--bad:#7f1d1d;--warn:#3730a3;
    --font-sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    --font-display:var(--font-sans)}
  *{box-sizing:border-box}
  body{font-family:var(--font-sans);margin:0;background:var(--bg);color:var(--ink);line-height:1.5;-webkit-font-smoothing:antialiased;overflow-x:hidden}
  a{color:var(--brand);text-decoration:none}
  header{background:#fff;color:var(--ink);padding:16px 28px;border-bottom:1px solid var(--line)}
  .brand{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:700;font-family:var(--font-display);letter-spacing:0}
  h1,h2{font-family:var(--font-display)}
  .brand .dot{display:none}
  .brand small{font-weight:500;color:#64748b;font-size:13px;margin-left:6px}
  nav{margin-top:10px;font-size:14px}
  nav a{color:#475569;margin-right:18px}
  main{max-width:1080px;margin:0 auto;padding:26px 28px 60px}
  h1{font-size:24px;margin:0 0 4px;letter-spacing:0} h2{font-size:15px;margin:0 0 12px;text-transform:uppercase;letter-spacing:0;color:var(--mut)}
  .sub{color:var(--mut);font-size:15px;margin:0 0 22px;max-width:70ch}
  .card{background:#fff;border:1px solid var(--line);border-radius:8px;padding:20px;margin-bottom:16px}
  .card.alert{border-color:#c7d2fe;background:#f8f7ff}
  .product-panel{background:#fff;color:var(--ink);border-color:#cbd5e1;padding:24px}
  .product-panel .eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:0;color:#3448ff;font-weight:800;margin-bottom:8px}
  .product-panel h1{font-size:30px;line-height:1.08;margin-bottom:10px}
  .product-panel p{margin:0 0 18px;color:#334155;max-width:68ch}
  .grid{display:grid;gap:14px}
  .stats{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
  .stat{background:#fff;border:1px solid var(--line);border-radius:8px;padding:14px 16px}
  .stat .n{font-size:22px;font-weight:700;letter-spacing:0}
  .stat .l{font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:0;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{text-align:left;padding:10px 10px;border-bottom:1px solid var(--line);vertical-align:top}
  th{color:var(--mut);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
  tr:last-child td{border-bottom:0}
  code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  .chipcode{background:#111827;color:#d1d5db;padding:3px 8px;border-radius:6px;font-size:12.5px;font-family:ui-monospace,Menlo,monospace;display:inline-block}
  .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600}
  .chip{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;background:#eef0f4;color:#475467}
  .chip.ok{background:#d1fae5;color:var(--ok)} .chip.bad{background:#fee2e2;color:var(--bad)}
  .role{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0;padding:3px 9px;border-radius:6px}
  .role.payer{background:#eef2ff;color:#3730a3} .role.provider{background:#dcfce7;color:#166534}
  button{background:var(--brand);color:#fff;border:0;border-radius:8px;padding:9px 15px;font-size:14px;font-weight:600;cursor:pointer}
  button:hover{background:#4c2fe6} button.ghost{background:#fff;color:var(--brand);border:1px solid #d8d2ff} button.danger{background:#334155}
  input,select,textarea{padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:14px;background:#fff}
  label{display:block;font-size:12px;color:var(--mut);margin:0 0 4px;font-weight:600}
  .row{display:flex;gap:12px;flex-wrap:wrap;align-items:end}
  .muted{color:var(--mut)} .pill{font-size:13px;color:var(--mut)}
  pre{background:#111827;color:#d1d5db;padding:14px;border-radius:8px;overflow:auto;font-size:12.5px;margin:8px 0 0}
  details summary{cursor:pointer;color:var(--brand);font-size:13px;font-weight:600}
  .market-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
  .provider-card{background:#fff;border:1px solid var(--line);border-radius:8px;padding:18px;min-height:190px;display:flex;flex-direction:column;justify-content:space-between}
  .provider-card .top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
  .price{font-size:24px;font-weight:800;letter-spacing:0;color:var(--ink)}
  .earnings{display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--line);padding-top:12px;margin-top:14px}
  .budget-panel{border:1px solid #c7d2fe;background:#fbfdff;border-radius:8px;padding:14px;margin:12px 0}
  .budget-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}
  .budget-profile{font-size:12px;text-transform:uppercase;letter-spacing:0;color:var(--brand);font-weight:800;margin-bottom:2px}
  .budget-title{font-size:16px;font-weight:800;color:var(--ink)}
  .budget-usage{text-align:right;min-width:150px}
  .budget-usage b{display:block;font-size:18px;color:var(--ink)}
  .budget-meter{height:7px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-top:8px}
  .budget-meter span{display:block;height:100%;background:var(--brand);border-radius:999px}
  .rule-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .rule-box{border:1px solid var(--line);background:#fff;border-radius:8px;padding:10px;min-width:0}
  .rule-box b{display:block;font-size:13px;color:var(--ink)}
  .rule-box span{display:block;font-size:12px;color:#475569;margin-top:3px}
  .live-shell{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:16px;align-items:start}
  .protocol-shell{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.72fr);gap:16px;align-items:start}
  .object-card{background:#fff;border:1px solid #c7d2fe;border-top:3px solid var(--brand);border-radius:8px;padding:18px;margin-bottom:16px}
  .object-card h2{font-size:17px;text-transform:none;color:var(--ink);margin:0 0 12px}
  .object-label{font-size:12px;color:#475569;font-weight:700;margin-bottom:2px}
  .object-amount{font-size:34px;font-weight:800;letter-spacing:0;margin:12px 0 4px}
  .object-meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
  .object-box{border:1px solid var(--line);border-radius:8px;background:#f8fafc;padding:10px;min-width:0}
  .object-box span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:0;color:#64748b;font-weight:800}
  .object-box b{display:block;font-size:13px;overflow-wrap:anywhere;margin-top:2px;color:#111827}
  .status-pill{display:inline-flex;align-items:center;border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3;border-radius:999px;padding:5px 10px;font-size:13px;font-weight:800}
  .status-rail{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
  .rail-step{border:1px solid var(--line);border-radius:8px;background:#f8fafc;padding:10px;min-height:58px}
  .rail-step b{display:block;font-size:13px}.rail-step span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:0;color:#64748b;margin-top:2px}
  .rail-step.active{border-color:#c7d2fe;background:#eef2ff}
  .event-stream{background:#111827;color:#d1d5db;border-radius:8px;padding:12px;font-family:ui-monospace,Menlo,monospace;font-size:13px;min-height:210px;max-height:360px;overflow:auto}
  .event-line{display:grid;grid-template-columns:150px 1fr;gap:10px;padding:8px 0;border-bottom:1px solid rgba(209,213,219,.12)}
  .event-line:last-child{border-bottom:0}
  .event-line span{color:#93c5fd}.event-line b{color:#e5e7eb;font-weight:600}
  .product-composition{position:relative;overflow:hidden;border:1px solid #d8d2ff;background:#fff;border-radius:8px;padding:22px;margin-bottom:16px}
  .composition-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}
  .composition-head h2{font-size:18px;text-transform:none;color:var(--ink);margin:0 0 4px}
  .composition-head p{margin:0;color:#475569;font-size:14px;max-width:68ch}
  .composition-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(230px,.75fr);gap:16px;align-items:stretch}
  .product-surface{background:#fff;border:1px solid rgba(148,163,184,.5);border-radius:8px;box-shadow:0 18px 45px rgba(15,23,42,.08);min-width:0}
  .surface-bar{display:flex;justify-content:space-between;gap:10px;align-items:center;border-bottom:1px solid var(--line);padding:10px 12px}
  .surface-bar b{font-size:13px;color:var(--ink)}
  .console-shell{display:grid;grid-template-columns:150px minmax(0,1fr);min-height:430px}
  .console-sidebar{border-right:1px solid var(--line);background:#fbfdff;padding:14px 10px}
  .console-brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:13px;color:var(--ink);margin:0 0 14px}
  .console-mark{display:none}
  .console-nav{display:grid;gap:4px}
  .console-item{display:flex;align-items:center;gap:8px;border-radius:7px;padding:7px 8px;color:#475569;font-size:12px;font-weight:700}
  .console-item:before{content:"";width:5px;height:5px;border-radius:50%;background:#cbd5e1;flex:0 0 auto}
  .console-item.active{background:#eef2ff;color:var(--brand)}
  .console-item.active:before{background:var(--brand)}
  .console-item.connect{margin-top:8px;border:1px solid #c7d2fe;background:#fff;color:var(--brand)}
  .console-main{min-width:0}
  .surface-body{padding:14px}
  .surface-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border:1px solid var(--line);border-radius:8px;padding:10px;margin-bottom:10px;background:#fbfdff}
  .surface-row:last-child{margin-bottom:0}
  .surface-row b{display:block;font-size:14px;color:var(--ink)}
  .surface-row span{font-size:12px;color:#475569}
  .mini-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}
  .mini-metric{border:1px solid var(--line);border-radius:8px;padding:10px;background:#fff}
  .mini-metric b{display:block;font-size:14px}.mini-metric span{font-size:10px;text-transform:uppercase;color:#64748b;font-weight:800}
  .intent-combo{display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,.62fr);gap:10px;margin-top:10px}
  .intent-panel{border:1px solid #c7d2fe;border-top:3px solid var(--brand);border-radius:8px;padding:12px;background:#fff}
  .intent-panel h3{font-size:17px;margin:2px 0 8px;color:var(--ink)}
  .intent-amount{font-size:28px;font-weight:800;letter-spacing:0;margin:8px 0;color:var(--ink)}
  .decision-stack{display:grid;gap:8px}
  .decision{border:1px solid var(--line);border-radius:8px;padding:10px;background:#f8fafc}
  .decision b{display:block;font-size:13px;color:var(--ink)}.decision span{display:block;font-size:12px;color:#475569;margin-top:2px}
  .agent-wallet-strip{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(260px,.95fr);gap:16px;margin-bottom:16px}
  .agent-wallet-card,.agent-proposal-card{background:#fff;border:1px solid var(--line);border-radius:8px;padding:18px}
  .agent-wallet-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}
  .agent-wallet-head h2,.agent-proposal-card h2{font-size:15px;text-transform:none;color:var(--ink);margin:0}
  .agent-wallet-head p,.agent-proposal-card p{margin:3px 0 0;color:#64748b;font-size:13px}
  .wallet-balance-card{background:var(--brand);color:#fff;border-radius:14px;padding:18px;margin:12px 0 14px}
  .wallet-balance-card .label{font-size:11px;text-transform:uppercase;letter-spacing:0;opacity:.72;font-weight:800}
  .wallet-balance-card .amount{font-size:32px;font-weight:900;letter-spacing:0;margin:4px 0 22px}
  .wallet-card-foot{display:flex;justify-content:space-between;gap:12px;align-items:flex-end}
  .wallet-card-foot b{display:block;font-size:14px}.wallet-card-foot span{display:block;font-size:11px;opacity:.72}
  .wallet-limit-row{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:#475569;margin-top:12px}
  .wallet-limit-row b{color:var(--ink)}
  .wallet-meter{height:8px;background:#eef2f7;border-radius:999px;overflow:hidden;margin-top:8px}
  .wallet-meter span{display:block;height:100%;width:42%;background:var(--brand);border-radius:999px}
  .proposal-box{border:1px solid var(--line);background:#f8fafc;border-radius:8px;padding:12px;margin:14px 0}
  .proposal-line{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:8px}
  .proposal-line:last-child{margin-bottom:0}
  .proposal-line span{font-size:12px;color:#64748b}.proposal-line b{font-size:13px;color:var(--ink)}
  .proposal-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
  .proposal-actions span{display:block;text-align:center;border:1px solid #d8d2ff;border-radius:8px;padding:9px 10px;font-weight:800;font-size:13px;color:var(--brand);background:#fff}
  .proposal-actions span:last-child{background:var(--brand);color:#fff}
  .wallet-frame{background:#111827;border:1px solid #1e293b;border-radius:24px;padding:10px;box-shadow:0 18px 38px rgba(15,23,42,.12)}
  .wallet-screen{background:#f8fafc;border-radius:16px;padding:13px;min-height:100%}
  .wallet-screen h3{font-size:15px;margin:2px 0 10px;color:var(--ink)}
  .wallet-object{border:1px solid #c7d2fe;border-radius:8px;background:#fff;padding:10px;margin-bottom:10px}
  .wallet-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .wallet-actions span{display:block;text-align:center;border-radius:8px;padding:8px 6px;font-size:12px;font-weight:800;border:1px solid #c7d2fe;color:var(--brand);background:#fff}
  .wallet-actions span:last-child{background:var(--brand);color:#fff}
  .motion-strip{position:relative;display:grid;grid-template-columns:minmax(300px,1.08fr) minmax(230px,.92fr);gap:14px;border:1px solid #d8d2ff;background:#fbfdff;border-radius:8px;padding:14px;margin:0 0 16px;overflow:hidden}
  .spend-map{position:relative;min-height:306px;border:1px solid rgba(216,210,255,.95);border-radius:8px;background:#fff;overflow:hidden;isolation:isolate}
  .spend-map:before{content:"";position:absolute;left:7%;top:7%;width:86%;height:86%;border-radius:50%;background-image:radial-gradient(circle,rgba(91,61,245,.48) 1px,transparent 1.8px),radial-gradient(circle,rgba(100,116,139,.26) 1px,transparent 1.9px);background-position:0 0,18px 8px;background-size:13px 13px,19px 19px;opacity:.45;mask-image:radial-gradient(circle at center,#000 60%,transparent 62%);-webkit-mask-image:radial-gradient(circle at center,#000 60%,transparent 62%);animation:globeTurn 18s linear infinite;z-index:0}
  .spend-map:after{content:"";position:absolute;left:12%;top:15%;width:76%;height:68%;border:1px solid rgba(124,58,237,.24);border-radius:50%;transform:rotate(-17deg);z-index:0}
  .spend-arcs{position:absolute;inset:8px;width:calc(100% - 16px);height:calc(100% - 16px);overflow:visible}
  .spend-arcs path{fill:none;stroke-linecap:round}
  .arc-base{stroke:rgba(100,116,139,.22);stroke-width:1.2}
  .arc-flow{stroke:url(#agentpayArc);stroke-width:2.2;stroke-dasharray:8 12;animation:dashFlow 3.4s linear infinite}
  .arc-flow.two{animation-delay:.9s;opacity:.75}
  .flow-dot{fill:#fff;stroke:var(--brand);stroke-width:3;filter:drop-shadow(0 6px 10px rgba(91,61,245,.18))}
  .spend-node{position:absolute;border:1px solid #c7d2fe;background:rgba(255,255,255,.94);border-radius:8px;padding:8px 10px;box-shadow:0 10px 26px rgba(15,23,42,.1);font-size:12px;font-weight:800;color:var(--ink);z-index:2}
  .spend-node span{display:block;margin-top:2px;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:0}
  .spend-node.agent{left:8%;bottom:28%}.spend-node.policy{left:34%;top:12%}.spend-node.wallet{right:8%;top:25%}.spend-node.provider{right:10%;bottom:28%}
  .map-tag{position:absolute;left:14px;top:14px;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900;z-index:2}
  .route-label{position:absolute;border:1px solid rgba(199,210,254,.9);background:rgba(255,255,255,.94);border-radius:8px;padding:7px 9px;font-size:11px;font-weight:900;color:#334155;box-shadow:0 12px 26px rgba(15,23,42,.08);z-index:2}
  .route-label b{display:block;color:var(--ink);font-size:12px}
  .route-label.request{left:18%;bottom:50%}.route-label.destination{right:14%;top:48%}
  .map-caption{position:absolute;left:14px;right:14px;bottom:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;z-index:2}
  .map-caption span{border:1px solid rgba(199,210,254,.9);background:rgba(255,255,255,.9);border-radius:8px;padding:8px 9px;font-size:11px;font-weight:800;color:#334155}
  .map-caption b{display:block;color:var(--ink);font-size:12px}
  .pulse-node{position:absolute;width:12px;height:12px;border-radius:50%;background:var(--brand);box-shadow:0 0 0 7px rgba(91,61,245,.1);animation:nodePulse 2.2s ease-in-out infinite;z-index:2}
  .pulse-node.a{left:20%;bottom:32%}.pulse-node.b{left:52%;top:33%;animation-delay:.45s}.pulse-node.c{right:24%;top:44%;animation-delay:.9s}
  .money-lock{position:absolute;left:50%;top:61%;transform:translate(-50%,-50%);border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:900;box-shadow:0 10px 24px rgba(91,61,245,.14);z-index:2;white-space:nowrap}
  .motion-copy{display:grid;gap:8px}
  .flow-kicker{display:inline-flex;align-items:center;width:max-content;border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900}
  .motion-steps{position:relative;display:grid;grid-template-columns:1fr;gap:8px}
  .motion-step{background:rgba(255,255,255,.9);border:1px solid var(--line);border-radius:8px;padding:11px;min-height:0;display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center}
  .step-num{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:12px;font-weight:900}
  .motion-step b{display:block;color:var(--ink);font-size:13px}.motion-step div > span{display:block;color:#475569;font-size:12px;margin-top:3px}
  .motion-step.hold{border-color:#c7d2fe;background:#f8f7ff}
  .motion-note{position:relative;margin:12px 0 0;color:#3730a3;font-size:13px;font-weight:800}
  .adversarial-card{border:1px solid #c7d2fe;background:#f8f7ff;border-radius:8px;padding:10px;margin-top:2px}
  .adversarial-card b{display:block;color:#3730a3;font-size:13px}.adversarial-card span{display:block;color:#475569;font-size:12px;margin-top:3px}
  .phone-status{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}
  .phone-chip{border:1px solid var(--line);border-radius:8px;background:#f8fafc;padding:8px;font-size:11px;color:#475569}
  .phone-chip b{display:block;color:var(--ink);font-size:12px}
  .phone-timer{border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3;border-radius:8px;padding:8px;margin:10px 0;font-size:12px;font-weight:800;text-align:center}
  .lamp{padding:8px 12px;border-radius:999px;font-size:13px;font-weight:700;background:#eef0f4;color:#667085;border:1px solid var(--line);position:relative;overflow:hidden}
  .lamp.run{background:#eef2ff;color:#3730a3;border-color:#c7d2fe;animation:pulse 1s infinite}
  .lamp.ok{background:#d1fae5;color:#065f46;border-color:#a7f3d0}
  .lamp.bad{background:#fee2e2;color:#991b1b;border-color:#fecaca}
  .cl{padding:4px 0;white-space:pre-wrap;border-bottom:1px solid rgba(209,213,219,.12)}
  .cl:last-child{border-bottom:0}
  .deliverable-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.62}}
  @keyframes dashFlow{to{stroke-dashoffset:-80}}
  @keyframes nodePulse{0%,100%{transform:scale(.86);opacity:.45}50%{transform:scale(1.08);opacity:1}}
  @keyframes globeTurn{to{background-position:156px 0,174px 8px}}
  @media (prefers-reduced-motion: reduce){.arc-flow,.pulse-node,.spend-map:before{animation:none}}
  /* pipeline des garde-fous */
  .pipe{display:flex;align-items:stretch;gap:0;flex-wrap:wrap}
  .step{flex:1;min-width:150px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:14px;position:relative}
  .step .k{font-size:11px;font-weight:700;color:var(--brand);text-transform:uppercase;letter-spacing:0}
  .step .t{font-weight:700;margin:2px 0 3px} .step .d{font-size:12.5px;color:var(--mut)}
  .arrow{display:flex;align-items:center;color:#c7cbf2;font-size:20px;padding:0 8px}
  @media(max-width:760px){
    main{padding:18px 14px 48px}
    h1{font-size:26px;line-height:1.12;overflow-wrap:anywhere;max-width:100%}
    p{overflow-wrap:anywhere}
    .product-panel{padding:16px;max-width:100%;overflow:hidden}
    .product-panel h1{font-size:27px}
    .product-panel .row{display:grid;grid-template-columns:1fr;gap:8px}
    .product-panel button{width:100%}
    .arrow{display:none}
    .live-shell,.protocol-shell{grid-template-columns:1fr}
    .composition-head{display:block;max-width:100%}
    .agent-wallet-strip{grid-template-columns:1fr}
    .wallet-card-foot{display:block}
    .wallet-card-foot .mono{margin-top:10px}
    .composition-grid,.intent-combo{grid-template-columns:1fr}
    .console-shell{grid-template-columns:1fr;min-height:0}
    .console-sidebar{border-right:0;border-bottom:1px solid var(--line);padding:12px}
    .console-nav{grid-template-columns:repeat(2,minmax(0,1fr))}
    .console-item{font-size:11px;padding:7px 6px}
    .mini-metrics{grid-template-columns:1fr}
    .product-composition{padding:16px;max-width:100%;overflow:hidden}
    .motion-strip{grid-template-columns:1fr;max-width:100%;padding:10px;overflow:hidden}
    .spend-map{min-height:390px;max-width:100%;overflow:hidden}
    .spend-node{font-size:11px;padding:6px 7px}
    .spend-node.agent{left:9%;bottom:31%}.spend-node.policy{left:38%;top:15%}.spend-node.wallet{right:4%;top:30%}.spend-node.provider{right:5%;bottom:30%}
    .route-label{font-size:10px;padding:6px 7px}
    .route-label.request{left:10%;bottom:53%}.route-label.destination{right:4%;top:49%;max-width:132px}
    .route-label.destination,.spend-node.provider{display:none}
    .flow-kicker{width:100%;max-width:100%;display:flex;overflow-wrap:anywhere}
    .map-caption{grid-template-columns:1fr;left:10px;right:10px;bottom:10px}
    .map-caption span{padding:6px 8px}
    .spend-map .money-lock{display:none!important}
    .motion-step{min-height:auto}
    .phone-status{grid-template-columns:1fr}
    .object-meta{grid-template-columns:1fr}
    .status-rail{grid-template-columns:1fr}
    .budget-head{display:block}
    .budget-usage{text-align:left;margin-top:10px}
    .rule-grid{grid-template-columns:1fr}
    .rail-step{min-height:auto}
    .event-line{grid-template-columns:1fr;gap:2px}
    .card,.object-card,.object-box,.stat{min-width:0;max-width:100%}
    .card{overflow-x:auto}
    .grid button{width:100%;overflow-wrap:anywhere}
    .event-stream{overflow-wrap:anywhere}
    .object-amount{font-size:30px}
  }
</style></head><body>
<header>
  <div class="brand"><span class="dot"></span>AgentPay <small>· credit/spend control for AI agents</small></div>
  <nav><a href="/">Dashboard</a><a href="/credits">Credit top-up</a><a href="/earn">Provider earnings</a><a href="/market">Marketplace</a><a href="/task">Live flow</a><a href="/audit">Audit trail</a></nav>
</header>
<main>${body}</main></body></html>`;

const pipeline = () => `
  <div class="pipe">
    <div class="step"><div class="k">Guardrail 1</div><div class="t">Deterministic policy</div><div class="d">Limits, thresholds, allowlists. The LLM never calculates money.</div></div>
    <div class="arrow">→</div>
    <div class="step"><div class="k">Guardrail 2</div><div class="t">Independent verifier</div><div class="d">A second check inspects every payment and can block it.</div></div>
    <div class="arrow">→</div>
    <div class="step"><div class="k">Guardrail 3</div><div class="t">Human approval</div><div class="d">Human approval above threshold. Every decision is audited.</div></div>
    <div class="arrow">→</div>
    <div class="step"><div class="k">Execution</div><div class="t">Mollie</div><div class="d">Commits to the payment provider only after approval. Money moves last.</div></div>
  </div>`;

const productComposition = () => `
  <section class="product-composition" aria-label="AgentPay product composition">
    <div class="composition-head">
      <div>
        <h2>Agent checkout for controlled spend</h2>
        <p>An agent asks to pay. AgentPay prepares a reversible intent, runs policy and verifier checks, waits for human approval when needed, then commits only if allowed.</p>
      </div>
      <span class="status-pill">Money not moved</span>
    </div>
    <div class="motion-strip" aria-label="Reversible payment motion">
      <div class="spend-map" aria-hidden="true">
        <div class="map-tag">preparePayment(...) checkout</div>
        <svg class="spend-arcs" viewBox="0 0 560 280" preserveAspectRatio="none">
          <defs>
            <linearGradient id="agentpayArc" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stop-color="#5b3df5"/>
              <stop offset="52%" stop-color="#6d28d9"/>
              <stop offset="100%" stop-color="#475569"/>
            </linearGradient>
          </defs>
          <path class="arc-base" d="M72 212 C 155 30, 366 24, 490 116"/>
          <path class="arc-flow" d="M72 212 C 155 30, 366 24, 490 116"/>
          <path class="arc-base" d="M122 214 C 250 98, 360 100, 472 214"/>
          <path class="arc-flow two" d="M122 214 C 250 98, 360 100, 472 214"/>
          <circle class="flow-dot" r="6">
            <animateMotion dur="4.2s" repeatCount="indefinite" path="M72 212 C 155 30, 366 24, 490 116"/>
          </circle>
        </svg>
        <div class="pulse-node a"></div>
        <div class="pulse-node b"></div>
        <div class="pulse-node c"></div>
        <div class="spend-node agent">Agent<span>request</span></div>
        <div class="spend-node policy">Gate<span>policy + verifier</span></div>
        <div class="spend-node wallet">Human<span>review</span></div>
        <div class="spend-node provider">Commit<span>PSP later</span></div>
        <div class="route-label request"><b>Agent request</b>48,00 EUR credit intent</div>
        <div class="route-label destination"><b>Commit target</b>locked until approval</div>
        <div class="money-lock">HELD · no money moved</div>
        <div class="map-caption">
          <span><b>1. Agent asks</b>prepare payment intent</span>
          <span><b>2. AgentPay gates</b>policy + verifier</span>
          <span><b>3. Human decides</b>approve, undo, or block</span>
        </div>
      </div>
      <div class="motion-copy">
        <div class="flow-kicker">ReversiblePaymentIntent before money moves</div>
        <div class="motion-steps">
          <div class="motion-step"><span class="step-num">1</span><div><b>Agent prepares</b><span>OpenRouter credits · 48,00 EUR · no payment captured.</span></div></div>
          <div class="motion-step"><span class="step-num">2</span><div><b>AgentPay gates</b><span>Budget, caps, allowlist, verifier, and adversarial checks run before commit.</span></div></div>
          <div class="motion-step"><span class="step-num">3</span><div><b>Human reviews</b><span>Approve, undo, or reject from the mobile wallet.</span></div></div>
          <div class="motion-step hold"><span class="step-num">4</span><div><b>Money held</b><span>molliePaymentId stays null until commit.</span></div></div>
        </div>
        <div class="adversarial-card"><b>Product proof</b><span>The agent can decide what it wants. AgentPay controls whether money is allowed to move.</span></div>
      </div>
    </div>
    <div class="composition-grid">
      <div class="product-surface">
        <div class="surface-bar">
          <b>AgentPay dashboard</b>
          <span class="chip mono">policy.live</span>
        </div>
        <div class="console-shell">
          <aside class="console-sidebar" aria-label="AgentPay console navigation">
            <div class="console-brand"><span class="console-mark" aria-hidden="true"></span>AgentPay</div>
            <div class="console-nav">
              <div class="console-item active">Home</div>
              <div class="console-item">Agents</div>
              <div class="console-item">Budgets</div>
              <div class="console-item">Payments</div>
              <div class="console-item">Approvals</div>
              <div class="console-item">Audit</div>
              <div class="console-item connect">Connect agent</div>
            </div>
          </aside>
          <div class="console-main">
            <div class="surface-body">
              <div class="surface-row">
                <div><b>Agent budget profile</b><span>Developer agent · daily budget used 24%</span></div>
                <span class="chip">Profile active</span>
              </div>
              <div class="mini-metrics">
                <div class="mini-metric"><b>48,00 EUR</b><span>Prepared payment</span></div>
                <div class="mini-metric"><b>0,00 EUR</b><span>Money moved</span></div>
                <div class="mini-metric"><b>Review</b><span>Commit state</span></div>
              </div>
              <div class="intent-combo">
                <div class="intent-panel">
                  <div class="object-label">Object · ReversiblePaymentIntent</div>
                  <h3>ReversiblePaymentIntent</h3>
                  <div class="status-rail">
                    <div class="rail-step active"><b>Request</b><span>agent prepared</span></div>
                    <div class="rail-step active"><b>Review</b><span>human pending</span></div>
                    <div class="rail-step"><b>Commit</b><span>held</span></div>
                  </div>
                  <div class="intent-amount">48,00 EUR</div>
                  <div class="object-meta">
                    <div class="object-box"><span>Provider</span><b>OpenRouter credits</b></div>
                    <div class="object-box"><span>Payment</span><b>null until commit</b></div>
                  </div>
                </div>
                <div class="decision-stack">
                  <div class="decision"><b>Policy decision</b><span>Allowed merchant, inside daily cap, review threshold reached.</span></div>
                  <div class="decision"><b>Verifier</b><span>Blocks prompt-injected, mismatched, or suspicious payment claims.</span></div>
                  <div class="decision"><b>Audit</b><span>Request, verifier, review, and commit are attributable.</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="wallet-frame" aria-label="Mobile wallet review">
        <div class="wallet-screen">
          <h3>Mobile review</h3>
          <div class="wallet-object">
            <div class="object-label">Object · ReversiblePaymentIntent</div>
            <div class="intent-amount" style="font-size:25px">48,00 EUR</div>
            <div class="pill">OpenRouter credits</div>
            <div class="phone-status">
              <div class="phone-chip"><b>Policy</b>Cap OK · review</div>
              <div class="phone-chip"><b>Verifier</b>No injection</div>
            </div>
            <div class="status-rail" style="grid-template-columns:1fr;margin:10px 0">
              <div class="rail-step active"><b>Human review</b><span>money not moved</span></div>
            </div>
            <div class="phone-timer">Commit window open · molliePaymentId:null</div>
          </div>
          <div class="wallet-actions"><span>Undo</span><span>Commit</span></div>
        </div>
      </div>
    </div>
  </section>`;

// --- Marketplace ----------------------------------------------------------

export const renderMarket = () => layout('AgentPay · Marketplace', `
  <h1>Agent marketplace</h1>
  <p class="sub">Providers publish a handle, a service, and a price. A payer agent can call them through A2A using the same control layer: deterministic policy, independent verification, human approval when needed, then commit.</p>

  <div class="card" style="background:#0f172a;color:#fff;border-color:#1e293b">
    <div class="row" style="justify-content:space-between;align-items:center">
      <div>
        <h2 style="color:#c7cbf2">Agent economy</h2>
        <p style="margin:0;max-width:62ch">Each card is an addressable counterparty. The price comes from the provider, money stays in integer cents, and the provider accrues A2A earnings.</p>
      </div>
      <a href="/"><button style="background:#fff;color:#3448ff">Dashboard</button></a>
    </div>
  </div>

  <div class="grid stats" style="margin-bottom:16px">
    <div class="stat"><div class="n" id="market-count">—</div><div class="l">Providers</div></div>
    <div class="stat"><div class="n" id="market-volume">—</div><div class="l">A2A earned</div></div>
    <div class="stat"><div class="n">A2A</div><div class="l">Same pipeline</div></div>
  </div>

  <div id="market-status" class="card"><p class="pill" style="margin:0">Loading catalog...</p></div>
  <div id="market-grid" class="market-grid"></div>

  <script>
    (function(){
      var grid=document.getElementById('market-grid');
      var status=document.getElementById('market-status');
      var count=document.getElementById('market-count');
      var volume=document.getElementById('market-volume');
      function money(cents){
        var n=Number(cents);
        if(!Number.isFinite(n))n=0;
        return (n/100).toFixed(2).replace('.',',')+' EUR';
      }
      function text(value){
        if(value==null)return '';
        if(typeof value==='string')return value;
        if(typeof value==='number'||typeof value==='boolean')return String(value);
        try{return JSON.stringify(value);}catch(_){return String(value);}
      }
      function el(tag,cls,content){
        var node=document.createElement(tag);
        if(cls)node.className=cls;
        if(content!=null)node.textContent=text(content);
        return node;
      }
      function card(provider){
        var root=el('article','provider-card');
        var top=el('div','top');
        var left=el('div');
        left.appendChild(el('span','chipcode',provider.handle));
        var service=el('h2',null,provider.service||'Service provider');
        service.style.margin='12px 0 6px';
        service.style.color='var(--ink)';
        service.style.textTransform='none';
        service.style.letterSpacing='0';
        service.style.fontSize='17px';
        left.appendChild(service);
        left.appendChild(el('p','pill','Agent-to-agent provider'));
        top.appendChild(left);
        top.appendChild(el('span','chip','provider'));
        root.appendChild(top);

        var price=el('div','price',money(provider.priceCents));
        var priceLabel=el('div','pill','Price per request');
        var priceWrap=el('div');
        priceWrap.style.marginTop='18px';
        priceWrap.appendChild(price);
        priceWrap.appendChild(priceLabel);
        root.appendChild(priceWrap);

        var earn=el('div','earnings');
        earn.appendChild(el('span','pill','A2A earned'));
        var earnAmount=el('b',null,money(provider.earningsCents));
        earnAmount.style.color='var(--ok)';
        earn.appendChild(earnAmount);
        root.appendChild(earn);
        return root;
      }
      fetch('/api/agents/catalog',{headers:{Accept:'application/json'}})
        .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
        .then(function(data){
          var providers=Array.isArray(data.providers)?data.providers:[];
          status.remove();
          count.textContent=String(providers.length);
          volume.textContent=money(providers.reduce(function(sum,p){return sum+(Number(p.earningsCents)||0);},0));
          if(!providers.length){
            grid.appendChild(el('div','card','No providers available yet.'));
            return;
          }
          providers.forEach(function(provider){grid.appendChild(card(provider));});
        })
        .catch(function(err){
          status.innerHTML='';
          var title=el('h2',null,'Catalog unavailable');
          var body=el('p','pill','The backend must expose /api/agents/catalog. Detail: '+err.message);
          body.style.margin='0';
          status.appendChild(title);
          status.appendChild(body);
          count.textContent='0';
          volume.textContent=money(0);
        });
    })();
  </script>`);

// --- Setup (pas de compte) ------------------------------------------------

export const renderSetup = () => layout('AgentPay · Setup', `
  <h1>AgentPay</h1>
  <p class="sub">A human connects AI agents, sets limits, and remains the legal guardrail. Agents can request merchant and agent-to-agent payments inside those controls.</p>
  ${pipeline()}
  <div class="card" style="margin-top:16px">
    <h2>1 · Create the human account</h2>
    <form method="POST" action="/accounts" class="row">
      <div><label>Name</label><input name="name" value="Demo User" required></div>
      <div><label>Email</label><input name="email" type="email" value="demo@example.com"></div>
      <button type="submit">Create account</button>
    </form>
  </div>`);

// --- Agent card -----------------------------------------------------------

const percentUsed = (used, limit) => {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
};

const agentCard = (agent, baseUrl) => {
  const p = agent.policy;
  const spent = todaySpentCents(agent.id);
  const isProvider = agent.role === 'provider';
  const payments = paymentsForAgent(agent.id).slice(-5).reverse();
  const profileLabel = policyProfileLabel(agent.policyProfile);
  const allowedMerchants = Array.isArray(p.allowedMerchants) ? p.allowedMerchants : [];
  const budgetPct = percentUsed(spent, p.maxPerDayCents);
  const merchantsRule = allowedMerchants.length
    ? `Allowed merchants: ${allowedMerchants.join(', ')}`
    : 'Any merchant allowed by policy';

  const rows = payments.map((pay) => `
    <tr>
      <td><span class="mono pill">${escapeHtml(pay.id)}</span> ${pay.kind === 'a2a' ? '<span class="chip">A2A</span>' : ''}</td>
      <td>${escapeHtml(pay.merchant)}<div class="pill">${escapeHtml(pay.description)}</div></td>
      <td><b>${formatMoney(pay.amountCents, pay.currency)}</b></td>
      <td>${badge(pay.status)}</td>
      <td>${verdictChip(pay.verifierVerdict)}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="pill">No payments yet.</td></tr>';

  const earningsBlock = isProvider ? `
    <div class="grid stats" style="margin:6px 0 12px">
      <div class="stat"><div class="n">${formatMoney(agent.earningsCents)}</div><div class="l">A2A earned</div></div>
      <div class="stat"><div class="n">${agent.ledger.length}</div><div class="l">Payments received</div></div>
    </div>
    ${agent.ledger.length ? `<table style="margin-bottom:10px"><thead><tr><th>From</th><th>Amount</th><th>Payment</th></tr></thead><tbody>${
      agent.ledger.slice(-5).reverse().map((l) => `<tr><td>${escapeHtml(getAgent(l.fromAgentId)?.handle ?? l.fromAgentId)}</td><td>${formatMoney(l.amountCents)}</td><td><span class="mono pill">${escapeHtml(l.paymentId)}</span></td></tr>`).join('')
    }</tbody></table>` : ''}` : '';

  const budgetPanel = `<div class="budget-panel">
    <div class="budget-head">
      <div>
        <div class="budget-profile">Agent budget profile</div>
        <div class="budget-title">${escapeHtml(profileLabel)}</div>
        <div class="pill" style="margin-top:4px">${escapeHtml(merchantsRule)}</div>
      </div>
      <div class="budget-usage">
        <b>${formatMoney(spent)} / ${formatMoney(p.maxPerDayCents)}</b>
        <span class="pill">Daily budget used · ${budgetPct}%</span>
        <div class="budget-meter" aria-hidden="true"><span style="width:${budgetPct}%"></span></div>
      </div>
    </div>
    <div class="rule-grid">
      <div class="rule-box"><b>Auto approve</b><span>Up to ${formatMoney(p.approvalThresholdCents)} when policy allows.</span></div>
      <div class="rule-box"><b>Human review</b><span>Above ${formatMoney(p.approvalThresholdCents)} and within ${formatMoney(p.maxPerTxCents)} per transaction.</span></div>
      <div class="rule-box"><b>Blocked</b><span>Over ${formatMoney(p.maxPerTxCents)} per transaction, over daily budget, or outside allowed merchants.</span></div>
    </div>
  </div>`;

  const callExample = isProvider
    ? `<pre># Another agent pays this provider (A2A):
curl -X POST ${escapeHtml(baseUrl)}/agent/pay-agent \\
  -H "Authorization: Bearer &lt;PAYER_TOKEN&gt;" \\
  -H "Content-Type: application/json" \\
  -d '{"payee":"${escapeHtml(agent.handle)}","amount":"2.50","service":"Data enrichment"}'</pre>`
    : `<pre># This agent pays a merchant:
curl -X POST ${escapeHtml(baseUrl)}/agent/pay \\
  -H "Authorization: Bearer ${escapeHtml(agent.token)}" \\
  -H "Content-Type: application/json" \\
  -d '{"amount":"12.00","merchant":"OpenAI API","description":"API credits top-up"}'

# ... or pays another agent (A2A):
curl -X POST ${escapeHtml(baseUrl)}/agent/pay-agent \\
  -H "Authorization: Bearer ${escapeHtml(agent.token)}" \\
  -H "Content-Type: application/json" \\
  -d '{"payee":"@data-provider","amount":"2.50","service":"Data enrichment"}'</pre>`;

  return `<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center">
      <div style="display:flex;align-items:center;gap:10px">
        <b style="font-size:16px">${escapeHtml(agent.name)}</b>
        <span class="role ${isProvider ? 'provider' : 'payer'}">${isProvider ? 'provider' : 'payer'}</span>
        <span class="chip mono">${escapeHtml(agent.handle)}</span>
        <span class="chip">Profile: ${escapeHtml(profileLabel)}</span>
      </div>
      <span class="pill">Today: <b>${formatMoney(spent)}</b> / ${formatMoney(p.maxPerDayCents)}</span>
    </div>
    <p class="pill" style="margin:8px 0">Token : <span class="chipcode">${escapeHtml(agent.token)}</span>${isProvider && agent.service ? ` &nbsp;·&nbsp; Service : <b>${escapeHtml(agent.service.label)}</b> (${formatMoney(agent.service.priceCents)})` : ''}</p>
    ${earningsBlock}
    ${budgetPanel}
    <form method="POST" action="/agents/${agent.id}/policy" class="row" style="margin:6px 0 4px">
      <div><label>Max / transaction (€)</label><input name="maxPerTx" value="${(p.maxPerTxCents/100).toFixed(2)}"></div>
      <div><label>Max / day (€)</label><input name="maxPerDay" value="${(p.maxPerDayCents/100).toFixed(2)}"></div>
      <div><label>Human approval threshold (€)</label><input name="approvalThreshold" value="${(p.approvalThresholdCents/100).toFixed(2)}"></div>
      <div><label>Allowed merchants (blank = all)</label><input name="allowedMerchants" value="${escapeHtml(p.allowedMerchants.join(', '))}" placeholder="OpenAI API, AWS"></div>
      <button class="ghost" type="submit">Update</button>
    </form>
    <table><thead><tr><th>ID</th><th>Counterparty</th><th>Amount</th><th>Status</th><th>Verifier verdict</th></tr></thead><tbody>${rows}</tbody></table>
    <details style="margin-top:10px"><summary>API example</summary>${callExample}</details>
  </div>`;
};

// --- Dashboard ------------------------------------------------------------

export const renderDashboard = ({ account, pending, baseUrl }) => {
  const agents = agentsForAccount(account.id);
  const all = paymentsForAccount(account.id);
  const onboarded = !!account.mandateId;

  const paidToday = all.filter((p) => p.status === 'paid');
  const pendingReversible = all.filter((p) => p.status === 'pending_reversible');
  const cancelled = all.filter((p) => p.status === 'cancelled');
  const spentTotal = paidToday.reduce((s, p) => s + p.amountCents, 0);

  const stats = `<div class="grid stats" style="margin-bottom:16px">
    <div class="stat"><div class="n">${agents.length}</div><div class="l">Connected agents</div></div>
    <div class="stat"><div class="n" style="color:${pendingReversible.length ? '#3730a3' : 'inherit'}">${pendingReversible.length}</div><div class="l">Undoable intents</div></div>
    <div class="stat"><div class="n">${paidToday.length}</div><div class="l">Executed commits</div></div>
    <div class="stat"><div class="n">${cancelled.length}</div><div class="l">Cancelled payments</div></div>
    <div class="stat"><div class="n">${formatMoney(spentTotal)}</div><div class="l">Money moved</div></div>
  </div>`;

  const onboardingCard = `<div class="card">
    <h2>Human wallet</h2>
    ${onboarded
      ? `<p class="ok" style="color:var(--ok);margin:0">✓ Payment method active (<span class="mono">${escapeHtml(account.mandateId)}</span>). Agents can propose payments, and AgentPay keeps the undo window.</p>`
      : `<p class="pill" style="margin:0 0 10px">Simulated MVP mode: film the full flow without moving real money. Connecting Mollie turns commits into real payments.</p>
         <a href="/onboard/${account.id}"><button>Connect Mollie</button></a>`}
  </div>`;

  const pendingRows = pending.map((pay) => `
    <tr>
      <td><span class="mono pill">${escapeHtml(pay.id)}</span> ${pay.kind === 'a2a' ? '<span class="chip">A2A</span>' : ''}</td>
      <td>${escapeHtml(pay.merchant)}<div class="pill">${escapeHtml(pay.description)}</div></td>
      <td><b>${formatMoney(pay.amountCents, pay.currency)}</b></td>
      <td class="pill">${pay.policyDecision ? escapeHtml(pay.policyDecision.reasons.join(' · ')) : ''}</td>
      <td style="white-space:nowrap">
        <form method="POST" action="/approvals/${pay.id}/approve" style="display:inline"><button type="submit">Approve</button></form>
        <form method="POST" action="/approvals/${pay.id}/reject" style="display:inline"><button class="danger" type="submit">Reject</button></form>
      </td>
    </tr>`).join('');

  const pendingCard = `<div class="card${pending.length ? ' alert' : ''}">
    <h2>Human approval queue ${pending.length ? `· <span style="color:var(--warn)">${pending.length}</span>` : ''}</h2>
    ${pending.length
      ? `<table><thead><tr><th>ID</th><th>Counterparty</th><th>Amount</th><th>Policy reason</th><th>Action</th></tr></thead><tbody>${pendingRows}</tbody></table>`
      : '<p class="pill" style="margin:0">Nothing to approve. Payments above the threshold land here.</p>'}
  </div>`;

  const policyProfileOptions = policyTemplateIds().map((id) =>
    `<option value="${escapeHtml(id)}"${id === 'developer_agent' ? ' selected' : ''}>${escapeHtml(policyProfileLabel(id))}</option>`).join('');

  const addAgentCard = `<div class="card">
    <h2>Connect an agent</h2>
    <form method="POST" action="/agents" class="row">
      <div><label>Agent name</label><input name="name" placeholder="Ops payment agent" required></div>
      <div><label>Role</label><select name="role"><option value="payer">payer (initiates payments)</option><option value="provider">provider (sells a paid service)</option></select></div>
      <div><label>Budget profile</label><select name="policyProfile">${policyProfileOptions}</select></div>
      <button type="submit">Create agent + token</button>
    </form>
  </div>`;

  const productHero = `<div class="card product-panel">
    <div style="max-width:720px">
      <div class="eyebrow">AgentPay · Wallet checkout for AI agents</div>
      <h1>Let agents choose. Approve before money moves.</h1>
      <p>AgentPay lets AI agents prepare purchases, then enforces policy, verifier checks, and human approval before any payment is committed.</p>
      <div class="row">
        <a href="/credits"><button>Create payment intent</button></a>
        <a href="/m"><button class="ghost">Open human wallet</button></a>
        <a href="/audit"><button class="ghost">View audit</button></a>
      </div>
    </div>
  </div>`;

  const walletShowcase = `<section class="agent-wallet-strip" aria-label="Agent wallet and approval example">
    <div class="agent-wallet-card">
      <div class="agent-wallet-head">
        <div>
          <h2>Agent wallet</h2>
          <p>Funded by a human. Spendable only inside policy.</p>
        </div>
        <span class="status-pill">Approval required</span>
      </div>
      <div class="wallet-balance-card">
        <div class="label">Available balance</div>
        <div class="amount">184,50 EUR</div>
        <div class="wallet-card-foot">
          <div><span>Agent</span><b>Workspace agent</b><span>owned by human operator</span></div>
          <div class="mono">wallet · 4827</div>
        </div>
      </div>
      <div class="wallet-limit-row"><span>Monthly spend</span><b>315,50 / 500,00 EUR</b></div>
      <div class="wallet-meter" aria-hidden="true"><span></span></div>
      <div class="row" style="margin-top:14px">
        <a href="/credits"><button>Add money</button></a>
        <a href="/m"><button class="ghost">Manage approvals</button></a>
      </div>
    </div>
    <div class="agent-proposal-card">
      <div>
        <h2>Agent proposes a purchase</h2>
        <p>A useful request, still gated by the human wallet.</p>
      </div>
      <div class="proposal-box">
        <div class="proposal-line"><span>Request</span><b>Gift card for teammate</b></div>
        <div class="proposal-line"><span>Amount</span><b>30,00 EUR</b></div>
        <div class="proposal-line"><span>Policy</span><b>Needs human approval</b></div>
        <div class="proposal-line"><span>Payment</span><b class="mono">molliePaymentId:null</b></div>
      </div>
      <p class="pill">The agent can suggest. AgentPay creates a reversible intent. The human decides before commit.</p>
      <div class="proposal-actions"><span>Decline</span><span>Approve</span></div>
    </div>
  </section>`;

  const consumerFlow = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:16px">
    <div class="card" style="margin:0"><h2>1 · Human funds</h2><p class="pill" style="margin:0">The wallet has limits, budget, and allowed spend types.</p></div>
    <div class="card" style="margin:0"><h2>2 · Agent requests</h2><p class="pill" style="margin:0">The agent prepares a payment intent for credits, SaaS, or a gift.</p></div>
    <div class="card" style="margin:0"><h2>3 · Human approves</h2><p class="pill" style="margin:0">Approve, reject, undo, or let the window expire before commit.</p></div>
  </div>`;

  const reversibleRows = pendingReversible.map((pay) => `
    <tr>
      <td><span class="mono pill">${escapeHtml(pay.id)}</span></td>
      <td>${escapeHtml(pay.merchant)}<div class="pill">${escapeHtml(pay.claim || pay.description)}</div></td>
      <td><b>${formatMoney(pay.amountCents, pay.currency)}</b></td>
      <td>${verdictChip(pay.verifierVerdict)}</td>
      <td class="pill">${pay.reversibleUntilMs ? escapeHtml(new Date(pay.reversibleUntilMs).toLocaleTimeString('en-US')) : '—'}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="pill">No pending intents. Open wallet controls to create a test intent.</td></tr>';

  const reversibleCard = `<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center">
      <div><h2>Prepared payments before commit</h2><p class="pill" style="margin:0">ReversiblePaymentIntent records that have not been captured yet. <span class="mono">molliePaymentId:null</span> is intentional until commit.</p></div>
      <a href="/m"><button>Control on mobile</button></a>
    </div>
    <table style="margin-top:12px"><thead><tr><th>Intent</th><th>Destination</th><th>Amount</th><th>Verifier</th><th>Commit after</th></tr></thead><tbody>${reversibleRows}</tbody></table>
  </div>`;

  return layout('AgentPay · Dashboard', `
    ${productHero}
    ${walletShowcase}
    ${productComposition()}
    ${consumerFlow}
    ${stats}
    ${reversibleCard}
    ${onboardingCard}
    ${pendingCard}
    <div class="card">
      <h2>Agent economy</h2>
      <p class="pill" style="margin:0 0 12px">Agents can also pay other agents. Same control path: intent, policy, verifier, audit, commit.</p>
      <a href="/task"><button class="ghost">Run live agent</button></a>
      <a href="/market" style="margin-left:10px"><button class="ghost">Marketplace</button></a>
    </div>
    <h2 style="margin:24px 0 12px">Agents</h2>
    ${agents.map((a) => agentCard(a, baseUrl)).join('')}
    ${addAgentCard}`);
};

// --- Audit ----------------------------------------------------------------

// --- Live agent: SSE page -------------------------------------------------

export const renderTaskLive = (defaultTask = 'Enrich a list of companies (firmographic data, score, segment).') => layout('AgentPay · Live agent', `
  <h1>Live agent payment flow</h1>
  <p class="sub">The agent receives a task and decides live whether it needs to pay another agent to finish it. The provider price comes from deterministic code, not the LLM.</p>

  <div class="card">
    <form id="taskform">
      <label>What should the agent do?</label>
      <textarea id="task" name="task" rows="2" style="width:100%;font-family:inherit">${escapeHtml(defaultTask)}</textarea>
      <div class="row" style="margin-top:10px;align-items:center">
        <button type="submit" id="runbtn">Run agent</button>
        <a href="/">Dashboard</a>
        <a href="/market">Marketplace</a>
        <a href="/audit">Audit trail</a>
      </div>
      <noscript><p class="pill">JavaScript is disabled: use the non-live POST route at <a href="/task/run">/task/run</a>.</p></noscript>
    </form>
  </div>

  <div class="live-shell">
    <div class="card">
      <h2>Console live</h2>
        <div id="console" style="background:#111827;color:#d1d5db;border-radius:8px;padding:14px;font-family:ui-monospace,Menlo,monospace;font-size:13px;min-height:220px;max-height:430px;overflow:auto">
        <div class="cl muted">Waiting.</div>
      </div>
    </div>

    <div class="card">
      <h2>Guardrails</h2>
      <div id="lamps" style="display:flex;gap:10px;flex-wrap:wrap">
        <span class="lamp" data-k="decision">Agent decision</span>
        <span class="lamp" data-k="policy">Policy</span>
        <span class="lamp" data-k="verifier">Verifier</span>
        <span class="lamp" data-k="settlement">A2A settlement</span>
      </div>
      <div style="height:14px"></div>
      <div class="stat">
        <div class="n" id="runstatus">Idle</div>
        <div class="l">Run state</div>
      </div>
      <p class="pill" id="runhint" style="margin:12px 0 0">The button returns to rerun mode when the stream ends.</p>
    </div>
  </div>

  <div id="deliverable"></div>

  <script>
    (function(){
      var form=document.getElementById('taskform');
      var out=document.getElementById('console');
      var btn=document.getElementById('runbtn');
      var deliv=document.getElementById('deliverable');
      var runstatus=document.getElementById('runstatus');
      var runhint=document.getElementById('runhint');
      function lamp(k,state){var el=document.querySelector('.lamp[data-k="'+k+'"]');if(el)el.className='lamp '+state;}
      function resetLamps(){['decision','policy','verifier','settlement'].forEach(function(k){lamp(k,'');});}
      function detailText(value){
        if(value==null)return '';
        if(typeof value==='string')return value;
        if(typeof value==='number'||typeof value==='boolean')return String(value);
        try{return JSON.stringify(value,null,2);}catch(_){return String(value);}
      }
      function icon(ev){if(ev.indexOf('deliverable')===0||ev==='payment.paid'||ev==='price.resolved')return'OK';if(ev.indexOf('blocked')>=0||ev==='error'||ev.indexOf('rejected')>=0||ev==='task.blocked')return'KO';if(ev==='agent.decision')return'DECIDE';if(ev==='agent.thinking'||ev==='payment.processing')return'RUN';if(ev==='task.received')return'TASK';return'LOG';}
      function setStatus(text,kind){runstatus.textContent=text;runstatus.style.color=kind==='bad'?'var(--bad)':kind==='ok'?'var(--ok)':kind==='warn'?'var(--warn)':'var(--ink)';}
      function line(ev,detail){
        var d=document.createElement('div');
        d.className='cl';
        d.textContent='['+icon(String(ev||''))+'] '+detailText(ev)+'  -  '+detailText(detail);
        out.appendChild(d);
        out.scrollTop=out.scrollHeight;
      }
      function esc(s){var p=document.createElement('div');p.textContent=s==null?'':String(s);return p.innerHTML;}
      form.addEventListener('submit',function(e){
        e.preventDefault();
        out.innerHTML='';deliv.innerHTML='';resetLamps();btn.disabled=true;btn.textContent='Running...';setStatus('Running','warn');runhint.textContent='SSE stream open. Steps arrive live.';
        var task=document.getElementById('task').value;
        var es=new EventSource('/task/stream?task='+encodeURIComponent(task));
        es.onmessage=function(m){
          var s;try{s=JSON.parse(m.data);}catch(_){return;}
          line(s.event,s.detail);
          if(s.event==='agent.thinking')lamp('decision','run');
          if(s.event==='agent.decision')lamp('decision','ok');
          if(s.event==='payment.processing'){lamp('policy','run');lamp('verifier','run');}
          if(s.event.indexOf('payment.')===0&&s.payment){
            var pol=s.payment.policyDecision;lamp('policy',pol&&pol.decision!=='REJECTED'?'ok':'bad');
            var v=s.payment.verifierVerdict;if(v)lamp('verifier',v.allow?'ok':'bad');
          }
        };
        es.addEventListener('done',function(m){
          var d={};try{d=JSON.parse(m.data);}catch(_){}
          if(d.error){setStatus('Error','bad');lamp('settlement','bad');line('error',d.error);}
          else if(d.paymentStatus==='paid'){setStatus('Delivered','ok');lamp('settlement','ok');}
          else {setStatus(d.paymentStatus||'Stopped','warn');lamp('settlement','bad');}
          btn.disabled=false;btn.textContent='Rerun';
          runhint.textContent='Run finished. You can start another task.';
          if(d.deliverable){
            var rows=(Array.isArray(d.deliverable.rows)?d.deliverable.rows:[]).map(function(r){return '<tr><td class="mono">'+esc(r.email)+'</td><td>'+esc(r.company)+'</td><td><b>'+esc(r.score)+'</b></td><td><span class="chip">'+esc(r.segment)+'</span></td></tr>';}).join('');
            deliv.innerHTML='<div class="card"><div class="deliverable-head"><div><h2>Deliverable from '+esc(d.payee||'')+'</h2><p class="pill" style="margin-top:0">'+esc(d.deliverable.note)+'</p></div><span class="badge" style="background:#d1fae5;color:#065f46">A2A paid</span></div>'+(rows?'<table><thead><tr><th>Email</th><th>Company</th><th>Score</th><th>Segment</th></tr></thead><tbody>'+rows+'</tbody></table>':'<p class="pill">No rows in the deliverable.</p>')+'<p style="margin-bottom:0"><a href="/audit">View audit trail</a></p></div>';
          }
          es.close();
        });
        es.onerror=function(){line('error','Stream interrupted.');setStatus('Interrupted','bad');btn.disabled=false;btn.textContent='Rerun';runhint.textContent='Stream interrupted. You can rerun.';es.close();};
      });
    })();
  </script>`);

export const renderEarnDemo = ({ account }) => {
  const agents = agentsForAccount(account.id);
  const providers = agents.filter((agent) => agent.role === 'provider');
  const payments = paymentsForAccount(account.id);
  const paidA2A = payments.filter((payment) => payment.kind === 'a2a' && payment.status === 'paid');
  const earned = providers.reduce((sum, agent) => sum + agent.earningsCents, 0);

  const providerRows = providers.map((agent) => `
    <tr>
      <td><span class="chipcode">${escapeHtml(agent.handle)}</span><div class="pill">${escapeHtml(agent.name)}</div></td>
      <td>${escapeHtml(agent.service?.label ?? 'Service')}</td>
      <td><b>${formatMoney(agent.service?.priceCents ?? 0)}</b></td>
      <td><b style="color:var(--ok)">${formatMoney(agent.earningsCents)}</b><div class="pill">${agent.ledger.length} received</div></td>
    </tr>`).join('') || '<tr><td colspan="4" class="pill">No providers yet.</td></tr>';

  return layout('AgentPay · Earn demo', `
    <section class="card" style="background:#0f172a;color:#fff;border-color:#1e293b;padding:24px">
      <div style="max-width:780px">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:0;color:#bfdbfe;font-weight:800;margin-bottom:8px">AgentPay · agent earns safely</div>
        <h1 style="font-size:34px;line-height:1.02;margin-bottom:10px">An agent can generate revenue. It still cannot control the money.</h1>
        <p style="margin:0;color:#cbd5e1;max-width:66ch">This product flow runs a mini economy: a payer agent delegates paid work to provider agents. Every payment still goes through deterministic policy, independent verification, commit, and audit.</p>
      </div>
    </section>

    <div class="grid stats" style="margin-bottom:16px">
      <div class="stat"><div class="n">${providers.length}</div><div class="l">Earning agents</div></div>
      <div class="stat"><div class="n">${paidA2A.length}</div><div class="l">Paid A2A jobs</div></div>
      <div class="stat"><div class="n">${formatMoney(earned)}</div><div class="l">Provider earnings</div></div>
      <div class="stat"><div class="n">0</div><div class="l">LLM money decisions</div></div>
    </div>

    <div class="live-shell">
      <div class="card">
        <div class="row" style="justify-content:space-between;align-items:center">
          <div>
            <h2>Revenue loop</h2>
            <p class="pill" style="margin:0">Runs three paid tasks. In simulated mode, no real money moves.</p>
          </div>
          <button id="earn-run" type="button">Run earning demo</button>
        </div>
        <div id="earn-console" style="background:#111827;color:#d1d5db;border-radius:8px;padding:14px;font-family:ui-monospace,Menlo,monospace;font-size:13px;min-height:250px;max-height:430px;overflow:auto;margin-top:14px">
          <div class="cl muted">Ready.</div>
        </div>
      </div>

      <div class="card">
        <h2>Result</h2>
        <div class="stat" style="margin-bottom:12px">
          <div class="n" id="earned-total">${formatMoney(earned)}</div>
          <div class="l">Total provider earnings</div>
        </div>
        <div class="stat" style="margin-bottom:12px">
          <div class="n" id="earned-run">—</div>
          <div class="l">Earned this run</div>
        </div>
        <p class="pill" id="earn-summary" style="margin:0">Run the demo to produce a fresh audited revenue loop.</p>
      </div>
    </div>

    <div class="card">
      <h2>Providers</h2>
      <table><thead><tr><th>Agent</th><th>Service</th><th>Price</th><th>Earnings</th></tr></thead><tbody id="provider-rows">${providerRows}</tbody></table>
    </div>

    <div class="card">
      <h2>The agent earns. Your code keeps control of the money.</h2>
      <p class="pill" style="margin:0 0 14px">The LLM only routed work to providers. It never chose an amount, picked a payee account, or moved a cent. Every payment above ran through the same five controls — that is the product AgentPay sells for agent-driven spend.</p>
      <div class="pipe">
        <div class="step"><div class="k">Budgets</div><div class="d">Per-transaction and daily caps, enforced in deterministic code.</div></div>
        <div class="step"><div class="k">Approvals</div><div class="d">Anything over threshold waits for a human.</div></div>
        <div class="step"><div class="k">Undo</div><div class="d">A reversible window before any money is captured.</div></div>
        <div class="step"><div class="k">Audit</div><div class="d">Every step attributable, on a signed trail.</div></div>
        <div class="step"><div class="k">Commit</div><div class="d">Providers credited only after the controlled payment commit.</div></div>
      </div>
    </div>

    <script>
      (function(){
        var btn=document.getElementById('earn-run');
        var out=document.getElementById('earn-console');
        var earnedTotal=document.getElementById('earned-total');
        var earnedRun=document.getElementById('earned-run');
        var summary=document.getElementById('earn-summary');
        var providerRows=document.getElementById('provider-rows');
        function money(cents){
          var n=Number(cents);
          if(!Number.isFinite(n))n=0;
          return (n/100).toFixed(2).replace('.',',')+' EUR';
        }
        function text(value){
          if(value==null)return '';
          if(typeof value==='string')return value;
          if(typeof value==='number'||typeof value==='boolean')return String(value);
          try{return JSON.stringify(value);}catch(_){return String(value);}
        }
        function esc(value){var d=document.createElement('div');d.textContent=text(value);return d.innerHTML;}
        function line(event,detail){
          var d=document.createElement('div');
          d.className='cl';
          d.textContent='['+text(event)+'] '+text(detail);
          out.appendChild(d);
          out.scrollTop=out.scrollHeight;
        }
        function renderProviders(list){
          providerRows.innerHTML=(list||[]).map(function(agent){
            return '<tr><td><span class="chipcode">'+esc(agent.handle)+'</span></td><td>'+esc(agent.service)+'</td><td><b>'+money(agent.priceCents)+'</b></td><td><b style="color:var(--ok)">'+money(agent.earningsCents)+'</b><div class="pill">'+esc(agent.ledgerCount)+' received</div></td></tr>';
          }).join('') || '<tr><td colspan="4" class="pill">No providers yet.</td></tr>';
        }
        btn.addEventListener('click',function(){
          btn.disabled=true;
          btn.textContent='Running...';
          out.innerHTML='';
          summary.textContent='Running paid tasks through AgentPay.';
          fetch('/earn/run',{method:'POST',headers:{Accept:'application/json'}})
            .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
            .then(function(data){
              (data.timeline||[]).forEach(function(step){line(step.event,step.detail);});
              earnedRun.textContent=money(data.earnedCents);
              earnedTotal.textContent=money(data.earningsAfter);
              summary.textContent=data.paidRuns+' / '+data.totalRuns+' jobs paid and audited. LLM decided work routing; code decided prices and payment controls.';
              renderProviders(data.providers);
            })
            .catch(function(err){
              line('error',err.message);
              summary.textContent='Demo failed: '+err.message;
            })
            .finally(function(){
              btn.disabled=false;
              btn.textContent='Run again';
            });
        });
      })();
    </script>`);
};

export const renderCreditTopupDemo = ({ account }) => {
  const agents = agentsForAccount(account.id);
  const payer = agents.find((agent) => agent.role === 'payer') ?? agents[0] ?? null;
  const providerCards = creditTopupProviders().map((scenario) => `
    <div class="step">
      <div class="k">${escapeHtml(scenario.provider)}</div>
      <div class="t">${escapeHtml(formatMoney(scenario.amountCents, scenario.currency))} · ${escapeHtml(scenario.merchant)}</div>
      <div class="d">${escapeHtml(scenario.description)}</div>
      <div class="pill" style="margin-top:8px">${escapeHtml(scenario.spendType)}</div>
    </div>`).join('');
  const recent = paymentsForAccount(account.id)
    .filter((payment) => payment.category === 'credits' || /credit/i.test(`${payment.claim ?? ''} ${payment.description ?? ''}`))
    .slice(-8)
    .reverse();

  const recentRows = recent.map((pay) => `
    <tr>
      <td><span class="mono pill">${escapeHtml(pay.id)}</span></td>
      <td>${escapeHtml(pay.merchant)}<div class="pill">${escapeHtml(pay.claim || pay.description)}</div></td>
      <td><b>${formatMoney(pay.amountCents, pay.currency)}</b></td>
      <td>${badge(pay.status)}</td>
      <td>${pay.molliePaymentId ? `<span class="mono pill">${escapeHtml(pay.molliePaymentId)}</span>` : '<span class="mono pill">null until commit</span>'}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="pill">No credit payment requests yet.</td></tr>';

  return layout('AgentPay · Credit top-up control', `
    <section class="card product-panel">
      <div style="max-width:790px">
        <div class="eyebrow">AgentPay · Payment protocol for AI agents</div>
        <h1>Review agent payments before money moves.</h1>
        <p>AgentPay fixes the amount in server code, verifies the request, and keeps commit behind human review.</p>
      </div>
    </section>
    ${productComposition()}

    <div class="grid stats" style="margin-bottom:16px">
      <div class="stat"><div class="n">Credits</div><div class="l">Spend type</div></div>
      <div class="stat"><div class="n">Undo</div><div class="l">Before commit</div></div>
      <div class="stat"><div class="n">Audit</div><div class="l">Every decision</div></div>
      <div class="stat"><div class="n">Simulated</div><div class="l">Settlement mode</div></div>
    </div>

    <div class="card">
      <h2>Credit providers</h2>
      <div class="pipe">${providerCards}</div>
    </div>

    <div class="protocol-shell">
      <div class="card">
        <h2>Protocol inspector</h2>
        <p class="pill" style="margin-top:0;color:#334155">Provider selected by the agent. Amount, merchant, verification, and commit stay controlled.</p>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px">
          <button type="button" data-scenario="openrouter">OpenRouter credits</button>
          <button type="button" data-scenario="firecrawl">Firecrawl credits</button>
          <button type="button" data-scenario="browserbase">Browserbase hours</button>
        </div>
        <div id="credit-console" class="event-stream">
          <div class="event-line"><span>ready</span><b>Pick a credit provider to prepare a payment request.</b></div>
        </div>
      </div>

      <div>
        <div class="object-card">
          <div class="object-label">Object</div>
          <h2>ReversiblePaymentIntent</h2>
          <div class="status-rail">
            <div class="rail-step active"><b>Request</b><span>prepared</span></div>
            <div class="rail-step active"><b>Review</b><span>pending</span></div>
            <div class="rail-step"><b>Commit</b><span>held</span></div>
          </div>
          <div class="object-amount" id="credit-amount">—</div>
          <div><span id="credit-status" class="status-pill">Waiting for request</span></div>
          <div class="object-meta">
            <div class="object-box"><span>Payee</span><b id="credit-payee">—</b></div>
            <div class="object-box"><span>Payment</span><b id="credit-mollie">null until commit</b></div>
            <div class="object-box"><span>Claim</span><b id="credit-claim">—</b></div>
            <div class="object-box"><span>Audit</span><b>enabled</b></div>
          </div>
          <p class="pill" id="credit-summary" style="margin:14px 0 0;color:#334155">No card or payment provider key is exposed to the agent.</p>
        </div>
        <div class="row" style="margin-top:14px">
          <a href="/m"><button class="ghost">Review in wallet</button></a>
          <a href="/audit"><button class="ghost">Audit trail</button></a>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Credit spend pipeline</h2>
      <div class="pipe">
        <div class="step"><div class="k">Agent</div><div class="t">Requests credits</div><div class="d">The agent asks for a credit top-up for one named provider.</div></div>
        <div class="arrow">→</div>
        <div class="step"><div class="k">Policy</div><div class="t">Checks budget</div><div class="d">Price, merchant, caps, and thresholds stay deterministic.</div></div>
        <div class="arrow">→</div>
        <div class="step"><div class="k">Verifier</div><div class="t">Checks claim</div><div class="d">A second guardrail blocks mismatched or suspicious spend.</div></div>
        <div class="arrow">→</div>
        <div class="step"><div class="k">Human</div><div class="t">Can undo</div><div class="d">No money moves until confirm or expiry.</div></div>
      </div>
    </div>

    <div class="card">
      <h2>Recent credit intents</h2>
      <table><thead><tr><th>Intent</th><th>Provider</th><th>Amount</th><th>Status</th><th>Mollie payment</th></tr></thead><tbody id="credit-recent">${recentRows}</tbody></table>
    </div>

    <details class="card">
      <summary>Agent API example</summary>
      <pre>curl -X POST /agent/credit-topup \\
  -H "Authorization: Bearer ${escapeHtml(payer?.token ?? '<AGENT_TOKEN>')}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: agent-run-123:openrouter" \\
  -d '{"provider":"openrouter"}'</pre>
    </details>

    <script>
      (function(){
        var out=document.getElementById('credit-console');
        var amount=document.getElementById('credit-amount');
        var status=document.getElementById('credit-status');
        var summary=document.getElementById('credit-summary');
        var payee=document.getElementById('credit-payee');
        var claim=document.getElementById('credit-claim');
        var mollie=document.getElementById('credit-mollie');
        var recent=document.getElementById('credit-recent');
        function esc(value){var d=document.createElement('div');d.textContent=value == null ? '' : String(value);return d.innerHTML;}
        function money(value){var n=Number(value);if(!Number.isFinite(n))return '—';return n.toFixed(2).replace('.',',')+' EUR';}
        function statusLabel(value){return value === 'pending_reversible' ? 'Pending review' : String(value || '—');}
        function line(event,detail){
          var d=document.createElement('div');
          d.className='event-line';
          var k=document.createElement('span');
          var v=document.createElement('b');
          k.textContent=event;
          v.textContent=detail;
          d.appendChild(k);
          d.appendChild(v);
          out.appendChild(d);
          out.scrollTop=out.scrollHeight;
        }
        function addRecent(intent){
          var row=document.createElement('tr');
          row.innerHTML='<td><span class="mono pill">'+esc(intent.intentId)+'</span></td><td>'+esc(intent.merchant)+'<div class="pill">'+esc(intent.claim)+'</div></td><td><b>'+esc(money(Number(intent.amount)))+'</b></td><td><span class="badge" style="background:#eef2ff;color:#3730a3">'+esc(statusLabel(intent.status))+'</span></td><td><span class="mono pill">'+esc(intent.molliePaymentId || 'null until commit')+'</span></td>';
          if(recent.querySelector('.pill')) recent.innerHTML='';
          recent.prepend(row);
        }
        document.querySelectorAll('[data-scenario]').forEach(function(btn){
          btn.addEventListener('click',function(){
            var scenario=btn.getAttribute('data-scenario');
            btn.disabled=true;
            out.innerHTML='';
            line('agent.request','credit provider: '+scenario);
            fetch('/demo/credit-topup',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({scenario:scenario})})
              .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
              .then(function(data){
                line('policy',data.policy && data.policy.decision ? data.policy.decision : 'policy returned');
                line('verifier',data.verifier ? (data.verifier.allow ? 'allow' : 'block')+' · '+data.verifier.reason : 'verifier returned');
                line('intent.created',data.intentId+' · molliePaymentId='+(data.molliePaymentId || 'null'));
                amount.textContent=money(Number(data.amount));
                status.textContent=statusLabel(data.status);
                payee.textContent=data.merchant || '—';
                claim.textContent=data.claim || data.description || '—';
                mollie.textContent=data.molliePaymentId || 'null until commit';
                summary.textContent='Payment request prepared for '+data.merchant+'. Money has not moved.';
                addRecent(data);
              })
              .catch(function(err){
                line('error',err.message);
                summary.textContent='Demo failed: '+err.message;
              })
              .finally(function(){btn.disabled=false;});
          });
        });
      })();
    </script>`);
};

// --- Live agent: result timeline -----------------------------------------

export const renderTaskResult = ({ task, timeline, deliverable, payment, payer, payee }) => {
  const icon = (e) => e.startsWith('payment.paid') || e === 'deliverable.received' || e === 'price.resolved' ? '🟢'
    : e.includes('blocked') || e === 'error' || e.startsWith('payment.rejected') ? '🔴'
    : e === 'agent.decision' ? '🧠' : e === 'task.received' ? '📋' : '⚪';
  const steps = timeline.map((s) => `
    <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)">
      <div style="font-size:18px">${icon(s.event)}</div>
      <div style="flex:1">
        <div><b>${escapeHtml(displayText(s.event))}</b></div>
        <div class="pill">${escapeHtml(displayText(s.detail))}</div>
        ${s.decision ? `<div style="margin-top:4px">${s.decision.needsPayment ? '<span class="chip">payer</span>' : '<span class="chip">ne pas payer</span>'} <span class="chip mono">${escapeHtml(displayText(s.decision.payee || '—'))}</span> <span class="chip ${s.decision.source === 'codex' ? 'ok' : ''}">${escapeHtml(displayText(s.decision.source))}</span></div>` : ''}
        ${s.payment?.verifierVerdict ? `<div style="margin-top:4px">${verdictChip(s.payment.verifierVerdict)}</div>` : ''}
      </div>
    </div>`).join('');

  const deliverableBlock = deliverable ? `<div class="card">
    <h2>Deliverable from ${escapeHtml(payee ?? '')}</h2>
    <p class="pill">${escapeHtml(deliverable.note)}</p>
    ${deliverable.rows?.length ? `<table><thead><tr><th>Email</th><th>Company</th><th>Score</th><th>Segment</th></tr></thead><tbody>${
      deliverable.rows.map((r) => `<tr><td class="mono">${escapeHtml(r.email)}</td><td>${escapeHtml(r.company)}</td><td>${escapeHtml(displayText(r.score))}</td><td><span class="chip">${escapeHtml(r.segment)}</span></td></tr>`).join('')
    }</tbody></table>` : ''}
  </div>` : '';

  const verdict = payment?.status === 'paid'
    ? `<span class="badge" style="background:#d1fae5;color:#065f46">task complete · ${escapeHtml(payer ?? '')} → ${escapeHtml(payee ?? '')}</span>`
    : `<span class="badge" style="background:#eef2ff;color:#3730a3">task incomplete (${escapeHtml(payment?.status ?? 'no payment')})</span>`;

  return layout('AgentPay · Live agent result', `
    <h1>Live agent run ${verdict}</h1>
    <p class="sub">Task: ${escapeHtml(task)}</p>
    <div class="card"><h2>Timeline</h2>${steps}</div>
    ${deliverableBlock}
    <a href="/task"><button class="ghost">Rerun task</button></a>
    <a href="/" style="margin-left:12px">Dashboard</a>
    <a href="/audit" style="margin-left:12px">Audit trail</a>`);
};

export const renderAudit = (entries) => {
  const cls = (e) => /blocked|rejected|error/.test(e) ? 'bad' : /paid|allow|approve|credited/.test(e) ? 'ok' : /needs_human|simulated|request/.test(e) ? 'warn' : '';
  const color = { bad: 'var(--bad)', ok: 'var(--ok)', warn: 'var(--warn)', '': 'var(--ink)' };
  const rows = entries.map((e) => `
    <tr>
      <td class="pill mono">${escapeHtml(e.at.slice(11, 19))}</td>
      <td><span class="mono pill">${escapeHtml(e.paymentId ?? '—')}</span></td>
      <td><b style="color:${color[cls(e.event)]}">${escapeHtml(displayText(e.event))}</b></td>
      <td>${escapeHtml(displayText(e.detail))}</td>
    </tr>`).join('') || '<tr><td colspan="4" class="pill">No audit entries.</td></tr>';
  return layout('AgentPay · Audit', `
    <h1>Audit trail</h1>
    <p class="sub">Every decision is traced: who, what, why, who approved, and the verifier verdict. This is the approval and accountability layer.</p>
    <div class="card"><table><thead><tr><th>Time</th><th>Payment</th><th>Event</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></div>`);
};

// --- Mobile undo surface --------------------------------------------------

export const manifestJson = () => JSON.stringify({
  name: 'AgentPay',
  short_name: 'AgentPay',
  start_url: '/m',
  scope: '/',
  display: 'standalone',
  background_color: '#f8fafc',
  theme_color: '#3448ff',
  icons: [{
    src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22%234f46e5%22/%3E%3Cpath d=%22M24 52c0-15 12-27 27-27 8 0 16 4 21 10l-8 8c-3-4-8-7-13-7-9 0-16 7-16 16s7 16 16 16c7 0 13-5 15-11h-18V46h31v5c0 17-12 28-28 28-15 0-27-12-27-27Z%22 fill=%22white%22/%3E%3C/svg%3E',
    sizes: '192x192',
    type: 'image/svg+xml',
  }],
});

export const serviceWorkerJs = () => `
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || 'AgentPay', {
    body: data.body || 'Reversible payment pending',
    data,
    requireInteraction: true,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/m'));
});
`;

export const renderMobileNotif = () => layout('AgentPay · ReversiblePaymentIntent', `
  <style>
    body{background:#f1f5f9;color:#111827}
    main{max-width:540px;padding:14px 14px 42px}
    header{display:none}
    nav{display:none}
    .wallet-shell{background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden}
    .wallet-head{background:#fff;color:#111827;padding:18px 18px 20px;border-bottom:1px solid #e2e8f0}
    .wallet-top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
    .wallet-brand{font-family:var(--font-display);font-size:18px;font-weight:700;letter-spacing:0}
    .wallet-controls{display:grid;justify-items:end;gap:8px}
    .wallet-nav{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .wallet-nav a{font-size:12px;font-weight:800;color:#3730a3;background:#eef2ff;border:1px solid #c7d2fe;border-radius:999px;padding:5px 9px}
    .wallet-status{font-size:12px;color:#3730a3;background:#eef2ff;border:1px solid #c7d2fe;border-radius:999px;padding:5px 9px;white-space:nowrap}
    .mobile-hero{padding-top:22px}
    .mobile-hero h1{font-size:28px;line-height:1.08;margin:0 0 9px;color:#111827}
    .mobile-hero p{font-size:14px;color:#475569;margin:0;max-width:42ch}
    .wallet-body{padding:14px}
    .demo-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
    .demo-actions button{min-height:48px;border-radius:8px;background:#3448ff}
    .demo-actions button:disabled{opacity:.58;cursor:wait}
    .demo-actions .secondary{background:#fff;color:#111827;border:1px solid #d7dce7}
    .intent-card{border:1px solid #d9dee8;background:#fff;border-radius:8px;padding:16px;margin-bottom:12px}
    .intent-card.blocked{border-color:#fecaca;background:#fff1f2}
    .intent-card.allowed{border-color:#bbf7d0}
    .blocked-stamp{font-size:13px;font-weight:900;color:#991b1b;background:#fee2e2;border:1px solid #fecaca;border-radius:999px;padding:7px 11px;white-space:nowrap}
    .intent-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    .intent-amount{font-family:var(--font-display);font-size:34px;font-weight:700;letter-spacing:0;margin-top:10px}
    .intent-label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:800}
    .object-label{font-size:13px;color:#475569;font-weight:700;margin-bottom:2px}
    .intent-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
    .intent-box{border:1px solid #e5e7eb;border-radius:8px;padding:10px;background:#f9fafb;min-width:0}
    .intent-box b{display:block;font-size:13px;overflow-wrap:anywhere}
    .intent-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
    .intent-actions button{width:100%;min-height:46px;border-radius:8px}
    .intent-actions .danger{background:#ef4444}
    .countdown{font-size:13px;font-weight:800;color:#3730a3;background:#eef2ff;border:1px solid #c7d2fe;border-radius:999px;padding:6px 10px;white-space:nowrap}
    .null-id{font-size:12px;color:#374151;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-top:12px}
    .empty-state{border-style:dashed;text-align:center;padding:28px 18px;border-radius:8px;background:#fff}
    .trust-rail{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:14px 0}
    .trust-dot{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px;min-height:66px}
    .trust-dot .n{font-size:14px;font-weight:800;color:#111827}
    .trust-dot .l{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-top:3px}
    .toast{display:none;background:#111827;color:#fff;border-radius:8px;padding:11px 12px;margin-bottom:12px;font-size:13px;font-weight:800}
    .toast.block{background:#991b1b}.toast.ok{background:#065f46}
    .verdict{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:13px}
    .verdict .chip{font-size:12px;padding:5px 10px}
    .protocol-stream{border:1px solid #e5e7eb;border-radius:8px;background:#f8fafc;margin-top:13px;overflow:hidden}
    .protocol-event{display:grid;grid-template-columns:96px 1fr;gap:8px;padding:9px 10px;border-bottom:1px solid #e5e7eb;font-size:12px}
    .protocol-event:last-child{border-bottom:0}
    .protocol-event span{color:#3448ff;font-family:ui-monospace,Menlo,monospace}
    .protocol-event b{font-weight:700;color:#111827}
    @media(max-width:430px){main{padding:8px}.wallet-shell{border-radius:8px}.wallet-top{display:block}.wallet-controls{justify-items:start;margin-top:10px}.wallet-nav{justify-content:flex-start}.intent-grid,.demo-actions,.trust-rail{grid-template-columns:1fr}.intent-top{display:block}.countdown{display:inline-block;margin-top:8px}}
  </style>
  <div class="wallet-shell">
    <section class="wallet-head">
      <div class="wallet-top">
        <div class="wallet-brand">AgentPay</div>
        <div class="wallet-controls">
          <div class="wallet-status">Wallet ready</div>
          <div class="wallet-nav"><a href="/">Dashboard</a><a href="/audit">Audit trail</a></div>
        </div>
      </div>
      <div class="mobile-hero">
        <h1>Review agent payments before money moves</h1>
        <p>AI agents can prepare payments. You keep approval, undo, and commit controls.</p>
      </div>
    </section>

    <section class="wallet-body">
      <div class="demo-actions">
        <button type="button" onclick="demoIntent('clean')">Prepare test payment</button>
        <button type="button" class="secondary" onclick="demoIntent('liar')">Test suspicious intent</button>
      </div>
      <div id="toast" class="toast"></div>

      <div class="trust-rail">
        <div class="trust-dot"><div class="n">Request</div><div class="l">prepared</div></div>
        <div class="trust-dot"><div class="n">Review</div><div class="l">available</div></div>
        <div class="trust-dot"><div class="n">Commit</div><div class="l">controlled</div></div>
      </div>

      <div id="notifs"></div>
      <div id="empty" class="empty-state">
        <h2 style="margin-bottom:6px">No pending intents</h2>
        <p class="pill" style="margin:0">Prepare a test payment to start the wallet flow.</p>
      </div>
    </section>
  </div>

  <script>
    (function(){
      var box=document.getElementById('notifs');
      var empty=document.getElementById('empty');
      var toast=document.getElementById('toast');
      var demoButtons=[].slice.call(document.querySelectorAll('.demo-actions button'));
      function esc(value){var d=document.createElement('div');d.textContent=value == null ? '' : String(value);return d.innerHTML;}
      function seconds(ms){return Math.max(0,Math.ceil((Number(ms)-Date.now())/1000));}
      function setButtons(disabled){demoButtons.forEach(function(btn){btn.disabled=disabled;});}
      function showToast(text,kind){
        toast.style.display='block';
        toast.className='toast '+(kind || '');
        toast.textContent=text;
      }
      function focusLatest(){
        var card=box.querySelector('.intent-card');
        if(card)card.scrollIntoView({behavior:'smooth',block:'nearest'});
      }
      function verdict(v){
        if(!v)return '<div class="verdict"><span class="chip">Verifier running</span><span class="pill">waiting</span></div>';
        return '<div class="verdict"><span class="chip '+(v.allow?'ok':'bad')+'">'+(v.allow?'Verified clean':'Blocked by verifier')+'</span><span class="pill">'+esc(v.source || '')+'</span></div>';
      }
      window.act=function(id,what){
        fetch('/pay/'+encodeURIComponent(id)+'/'+what,{method:'POST'})
          .then(function(){ setTimeout(refreshOnce, 180); });
      };
      window.demoIntent=function(scenario){
        setButtons(true);
        showToast(scenario === 'liar' ? 'Preparing suspicious request for verifier...' : 'Preparing payment request...');
        fetch('/demo/reversible-intent?scenario='+encodeURIComponent(scenario),{method:'POST'})
          .then(function(r){return r.json();})
          .then(function(data){
            if(data.error){showToast(data.error,'block');return;}
            showToast('ReversiblePaymentIntent created. Money has not moved.','ok');
            refreshOnce();
            waitForIntent(data.intentId,scenario,0);
          })
          .catch(function(err){showToast('Demo error: '+err.message,'block');})
          .finally(function(){setTimeout(function(){setButtons(false);},450);});
      };
      function card(p){
        var blocked=p.verifier && p.verifier.allow===false;
        var allowed=p.verifier && p.verifier.allow===true;
        var topRight=blocked?'<div class="blocked-stamp">Blocked by verifier</div>':'<div class="countdown">'+seconds(p.commitAfterMs)+'s left</div>';
        var actions=blocked
          ? '<div class="intent-actions" style="grid-template-columns:1fr"><button class="danger" onclick="act(\\''+esc(p.intentId)+'\\',\\'undo\\')">Undo</button></div>'
          : '<div class="intent-actions"><button class="danger" onclick="act(\\''+esc(p.intentId)+'\\',\\'undo\\')">Undo</button><button onclick="act(\\''+esc(p.intentId)+'\\',\\'confirm\\')">Commit</button></div>';
        return '<article class="intent-card '+(blocked?'blocked':allowed?'allowed':'')+'">'+
          '<div class="intent-top"><div><div class="object-label">Object · ReversiblePaymentIntent</div><div class="mono pill">'+esc(p.intentId)+'</div></div>'+topRight+'</div>'+
          '<div class="intent-amount">'+esc(p.amount)+' '+esc(p.currency)+'</div>'+
          '<div class="intent-grid">'+
            '<div class="intent-box"><span class="intent-label">Payee</span><b>'+esc(p.merchant || '?')+'</b></div>'+
            '<div class="intent-box"><span class="intent-label">Agent claim</span><b>'+esc(p.claim || '-')+'</b></div>'+
          '</div>'+
          verdict(p.verifier)+
          '<div class="protocol-stream">'+
            '<div class="protocol-event"><span>agent</span><b>Payment request prepared</b></div>'+
            '<div class="protocol-event"><span>policy</span><b>Amount and provider checked</b></div>'+
            '<div class="protocol-event"><span>wallet</span><b>Awaiting review before commit</b></div>'+
          '</div>'+
          '<div class="null-id">molliePaymentId: <b>'+esc(p.molliePaymentId === null ? 'null until commit' : p.molliePaymentId)+'</b></div>'+
          actions+
        '</article>';
      }
      function render(list){
        empty.style.display=list.length?'none':'block';
        box.innerHTML=[].slice.call(list).reverse().map(card).join('');
      }
      function refreshOnce(){
        fetch('/api/reversible-intents').then(function(r){return r.json();}).then(function(d){render(d.intents || []);}).catch(function(){});
      }
      function waitForIntent(intentId,scenario,attempt){
        fetch('/api/reversible-intents').then(function(r){return r.json();}).then(function(d){
          var list=d.intents || [];
          render(list);
          var p=list.find(function(item){return item.intentId===intentId || item.paymentId===intentId;});
          if(p && p.verifier){
            if(p.verifier.allow===false)showToast('Blocked by verifier. Commit is unavailable.','block');
            else showToast('Verified clean. Human can undo or commit.','ok');
            focusLatest();
            return;
          }
          if(attempt<10)setTimeout(function(){waitForIntent(intentId,scenario,attempt+1);},250);
          else {showToast(scenario==='liar'?'Verifier still running. Refreshing wallet...':'Payment request prepared. Money has not moved.');focusLatest();}
        }).catch(function(){});
      }
      if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){});}
      var es=new EventSource('/m/stream');
      es.onmessage=function(m){var list=[];try{list=JSON.parse(m.data).intents || JSON.parse(m.data);}catch(_){return;}render(list);};
      es.onerror=function(){refreshOnce();};
      setInterval(refreshOnce, 1000);
      refreshOnce();
    })();
  </script>`);
