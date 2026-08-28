#!/usr/bin/env node
/* MASSFRONT social contract lab — deterministic, offline client↔Worker checker.

   WHAT: extracts the /social/* and /multiplayer/* route+method contract that
   src/authportal.js actually calls (via apRequest) and compares it against the
   route dispatch in cloudflare/massfront-auth/src/index.js, plus the capability
   names each side reads/advertises in the /social/capabilities handshake.

   WHY: the 1.33.48 client requires GET /social/capabilities while the deployed
   Worker predates it. tools/verify-social-live-contract.mjs proves that LIVE;
   this tool proves the same class of drift OFFLINE, from source alone, so a
   client that ships ahead of the Worker source fails in CI instead of in the
   app store review build.

   RULES (deliberate, do not relax):
   - Bounded parsing only: string-literal/concat expressions, exact-match and
     anchored-regex route dispatch. No eval, no execution of either source.
   - FAIL CLOSED on ambiguity: any apRequest call or dispatch pattern this
     parser cannot resolve is recorded in `ambiguities` and turns the verdict
     incompatible. A checker that silently skips what it cannot parse is how
     1.33.35 shipped as two builds with one number.
   - No network, no writes outside --out. --worker-ref reads git objects
     read-only. */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOCIAL_PREFIXES = ['/social/', '/multiplayer/'];
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']);
const DYN = ''; /* sentinel for a dynamic (non-literal) concat chunk */
const REGEX_SLASH = '\u0002'; /* split marker for a regex-escaped route slash */
const CAP_FLAG_DRIVERS = ['chat', 'presence', 'lobbies', 'invites'];

/* ---- tiny source utilities --------------------------------------------------- */

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}
function lineNo(starts, idx) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; }
  return lo + 1;
}
function lineText(text, starts, idx) {
  const n = lineNo(starts, idx) - 1;
  const end = text.indexOf('\n', starts[n]);
  return text.slice(starts[n], end < 0 ? text.length : end).trim();
}
function ev(text, starts, idx) {
  return { line: lineNo(starts, idx), source: lineText(text, starts, idx).slice(0, 160) };
}
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* Comment/quote-aware brace matcher. Regex literals are NOT tokenized; the only
   functions ever sliced here contain no regex with unbalanced braces, and an
   unbalanced future edit fails closed (returns -1 -> ambiguity) rather than
   slicing wrong. Template ${} increments depth so its } cannot close early. */
function matchBrace(src, openIdx) {
  let depth = 0, state = null;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (state === 'sq') { if (c === '\\') i++; else if (c === "'") state = null; continue; }
    if (state === 'dq') { if (c === '\\') i++; else if (c === '"') state = null; continue; }
    if (state === 'tpl') { if (c === '\\') i++; else if (c === '`') state = null; else if (c === '$' && n === '{') { depth++; i++; } continue; }
    if (state === 'lc') { if (c === '\n') state = null; continue; }
    if (state === 'bc') { if (c === '*' && n === '/') { state = null; i++; } continue; }
    if (c === "'") state = 'sq';
    else if (c === '"') state = 'dq';
    else if (c === '`') state = 'tpl';
    else if (c === '/' && n === '/') { state = 'lc'; i++; }
    else if (c === '/' && n === '*') { state = 'bc'; i++; }
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/* Slice a whole function starting at the index of its `async function name(`
   match. Returns {start,end,text} or null. */
function sliceFunction(src, fnIdx) {
  const paren = src.indexOf('(', fnIdx);
  if (paren < 0) return null;
  let depth = 0, i = paren;
  for (; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) return null;
  const open = src.indexOf('{', i);
  if (open < 0) return null;
  const close = matchBrace(src, open);
  if (close < 0) return null;
  return { start: fnIdx, end: close + 1, text: src.slice(fnIdx, close + 1) };
}

/* Split an argument list / expression at top-level separators, respecting
   quotes, template literals, comments and bracket depth. Returns null on
   anything unterminated. */
function splitTopLevel(src, sep) {
  const parts = [];
  let depth = 0, state = null, start = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (state === 'sq') { if (c === '\\') i++; else if (c === "'") state = null; continue; }
    if (state === 'dq') { if (c === '\\') i++; else if (c === '"') state = null; continue; }
    if (state === 'tpl') { if (c === '\\') i++; else if (c === '`') state = null; continue; }
    if (state === 'lc') { if (c === '\n') state = null; continue; }
    if (state === 'bc') { if (c === '*' && n === '/') { state = null; i++; } continue; }
    if (c === "'") state = 'sq';
    else if (c === '"') state = 'dq';
    else if (c === '`') state = 'tpl';
    else if (c === '/' && n === '/') { state = 'lc'; i++; }
    else if (c === '/' && n === '*') { state = 'bc'; i++; }
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === sep && depth === 0) { parts.push(src.slice(start, i)); start = i + 1; }
  }
  if (state || depth !== 0) return null;
  parts.push(src.slice(start));
  return parts;
}

/* Bounded concat evaluator: string literals and simple identifier/call atoms
   joined by '+'. Anything else (ternary, template, index, regex) -> null. */
function parseStringLiteral(raw) {
  const s = raw.trim();
  const m = s.match(/^'((?:[^'\\]|\\.)*)'$/) || s.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (!m) return null;
  return m[1].replace(/\\(['"\\])/g, '$1');
}
function isDynamicAtom(s) {
  const atom = s.trim();
  /* Numeric literals are values, never route syntax. Treating them as a
     dynamic chunk lets a bounded `path+='&before='+99` assignment contribute
     its query key without pretending the literal is part of the contract. */
  if (/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(atom)) return true;
  return /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*(\([A-Za-z_$.][\w$.]*\))?$/.test(atom);
}
function evalConcatExpr(raw) {
  const pieces = splitTopLevel(raw, '+');
  if (!pieces) return null;
  const parts = [];
  for (const piece of pieces) {
    const lit = parseStringLiteral(piece);
    if (lit !== null) { if (lit) parts.push({ lit }); continue; }
    if (isDynamicAtom(piece)) { parts.push({ dyn: true }); continue; }
    return null;
  }
  return parts.length ? parts : null;
}

/* Resolve a bare identifier passed as the path argument (the client builds
   `/social/messages?with=...` in a local `path` variable). Bounded: only
   assignments of the form [let|const|var] name = <concat>; and name += <concat>;
   inside the enclosing function, in source order, before the call. */
function resolveIdentifier(src, starts, name, callIdx) {
  const fnRe = /(?:^|\n)(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
  let fnStart = -1, m;
  while ((m = fnRe.exec(src))) { if (m.index < callIdx) fnStart = m.index; else break; }
  if (fnStart < 0) return null;
  const slice = src.slice(fnStart, callIdx);
  const assignRe = new RegExp('(?:^|[^\\w$.])((?:let|const|var)\\s+)?' + escRe(name) + '\\s*(\\+?=)\\s*', 'g');
  const assigns = [];
  while ((m = assignRe.exec(slice))) {
    const exprStart = assignRe.lastIndex;
    const rest = slice.slice(exprStart);
    let depth = 0, state = null, end = -1;
    for (let i = 0; i < rest.length; i++) {
      const c = rest[i], n = rest[i + 1];
      if (state === 'sq') { if (c === '\\') i++; else if (c === "'") state = null; continue; }
      if (state === 'dq') { if (c === '\\') i++; else if (c === '"') state = null; continue; }
      if (c === "'") state = 'sq';
      else if (c === '"') state = 'dq';
      else if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === ';' && depth === 0) { end = i; break; }
    }
    if (end < 0) return null;
    assigns.push({ op: m[2], expr: rest.slice(0, end), at: fnStart + exprStart });
  }
  if (!assigns.length) return null;
  let parts = [];
  for (const a of assigns) {
    const p = evalConcatExpr(a.expr);
    if (!p) return null;
    if (a.op === '+=') parts = parts.concat(p); else parts = p;
  }
  return { parts, evidenceAt: assigns[0].at };
}

/* ---- client extraction ------------------------------------------------------- */

function normalizeClientPath(parts) {
  const joined = parts.map(p => (p.dyn ? DYN : p.lit)).join('');
  const q = joined.indexOf('?');
  const pathPart = q < 0 ? joined : joined.slice(0, q);
  const queryPart = q < 0 ? '' : joined.slice(q + 1);
  const segs = pathPart.split('/').filter(s => s !== '');
  const template = '/' + segs.map(s => (s.includes(DYN) ? ':id' : s)).join('/');
  const queryKeys = queryPart
    ? [...new Set(queryPart.split('&').map(kv => kv.split('=')[0]).filter(Boolean))].sort()
    : [];
  return { template, queryKeys, dynamic: parts.some(p => p.dyn) };
}

function enclosingCaller(src, idx) {
  const re = /(?:^|\n)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let name = null, m;
  while ((m = re.exec(src))) { if (m.index < idx) name = m[1]; else break; }
  return name || '(top level)';
}

export function extractClientContract(src, label) {
  const starts = lineStarts(src);
  const out = {
    label, protocol: null, protocolVersion: null, capabilitiesRead: [],
    routes: [], outOfScope: [], ambiguities: []
  };

  const pm = src.match(/const\s+AP_SOCIAL_PROTOCOL\s*=\s*'([^']+)'/);
  const vm = src.match(/const\s+AP_SOCIAL_PROTOCOL_VERSION\s*=\s*(\d+)/);
  if (pm) out.protocol = { value: pm[1], ...ev(src, starts, pm.index) };
  else out.ambiguities.push({ kind: 'client-protocol', detail: 'AP_SOCIAL_PROTOCOL const not found' });
  if (vm) out.protocolVersion = { value: Number(vm[1]), ...ev(src, starts, vm.index) };
  else out.ambiguities.push({ kind: 'client-protocol', detail: 'AP_SOCIAL_PROTOCOL_VERSION const not found' });

  /* Capability names are read only inside socialHandshake as `c.<name>===true`
     — literal true is the client's own fail-closed rule. */
  const hsIdx = src.search(/async\s+function\s+socialHandshake\s*\(/);
  if (hsIdx < 0) {
    out.ambiguities.push({ kind: 'client-handshake', detail: 'socialHandshake() not found' });
  } else {
    const slice = sliceFunction(src, hsIdx);
    if (!slice) {
      out.ambiguities.push({ kind: 'client-handshake', detail: 'socialHandshake() body did not brace-match', ...ev(src, starts, hsIdx) });
    } else {
      const names = new Set();
      const capRe = /\bc\.([A-Za-z_$][\w$]*)\s*===\s*true/g;
      let cm;
      while ((cm = capRe.exec(slice.text))) names.add(cm[1]);
      if (!names.size)
        out.ambiguities.push({ kind: 'client-handshake', detail: 'no `c.<name>===true` capability reads found', ...ev(src, starts, hsIdx) });
      out.capabilitiesRead = [...names].sort();
    }
  }

  const callRe = /\bapRequest\s*\(/g;
  let m;
  while ((m = callRe.exec(src))) {
    const callIdx = m.index;
    const openIdx = callIdx + m[0].length - 1;
    const before = src.slice(Math.max(0, callIdx - 40), callIdx);
    if (/(?:async\s+)?function\s*$/.test(before)) continue; /* the apRequest definition itself */
    const closeIdx = matchParen(src, openIdx);
    const args = closeIdx < 0 ? null : splitTopLevel(src.slice(openIdx + 1, closeIdx), ',');
    if (!args || args.length < 2) {
      out.ambiguities.push({ kind: 'client-call', detail: 'unparseable apRequest argument list', ...ev(src, starts, callIdx) });
      continue;
    }
    const method = parseStringLiteral(args[0]);
    if (!method || !HTTP_METHODS.has(method)) {
      out.ambiguities.push({ kind: 'client-method', detail: 'method is not a known string literal', ...ev(src, starts, callIdx) });
      continue;
    }
    const rawPath = args[1].trim();
    let parts = null, pathEvidence = ev(src, starts, callIdx + m[0].length);
    if (/^[A-Za-z_$][\w$]*$/.test(rawPath)) {
      const resolved = resolveIdentifier(src, starts, rawPath, callIdx);
      if (!resolved) {
        out.ambiguities.push({ kind: 'client-path', detail: `path identifier '${rawPath}' did not resolve to a bounded concat`, ...ev(src, starts, callIdx) });
        continue;
      }
      parts = resolved.parts;
      pathEvidence = ev(src, starts, resolved.evidenceAt);
    } else {
      parts = evalConcatExpr(rawPath);
      if (!parts) {
        out.ambiguities.push({ kind: 'client-path', detail: 'path argument is not a bounded string concat', ...ev(src, starts, callIdx) });
        continue;
      }
    }
    const norm = normalizeClientPath(parts);
    const rec = {
      method, path: norm.template, query: norm.queryKeys, dynamic: norm.dynamic,
      caller: enclosingCaller(src, callIdx), ...ev(src, starts, callIdx)
    };
    if (norm.queryKeys.length) rec.queryEvidence = pathEvidence;
    if (SOCIAL_PREFIXES.some(p => norm.template === p.slice(0, -1) || norm.template.startsWith(p))) out.routes.push(rec);
    else out.outOfScope.push(rec);
  }

  const seen = new Map();
  for (const r of out.routes) {
    const key = r.method + ' ' + r.path;
    if (seen.has(key)) seen.get(key).duplicates = (seen.get(key).duplicates || []).concat([{ line: r.line, caller: r.caller }]);
    else seen.set(key, r);
  }
  out.routes = [...seen.values()].sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
  out.outOfScope.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
  return out;
}

function matchParen(src, openIdx) {
  let depth = 0, state = null;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (state === 'sq') { if (c === '\\') i++; else if (c === "'") state = null; continue; }
    if (state === 'dq') { if (c === '\\') i++; else if (c === '"') state = null; continue; }
    if (state === 'tpl') { if (c === '\\') i++; else if (c === '`') state = null; continue; }
    if (state === 'lc') { if (c === '\n') state = null; continue; }
    if (state === 'bc') { if (c === '*' && n === '/') { state = null; i++; } continue; }
    if (c === "'") state = 'sq';
    else if (c === '"') state = 'dq';
    else if (c === '`') state = 'tpl';
    else if (c === '/' && n === '/') { state = 'lc'; i++; }
    else if (c === '/' && n === '*') { state = 'bc'; i++; }
    else if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/* ---- worker extraction ------------------------------------------------------- */

/* Bounded converter for anchored dispatch regexes. Supported segments:
   literal [a-z0-9_-], a capture group of a char class with a {n}/{n,m}
   quantifier (-> ':id'), or an alternation of literals (-> one route each).
   Anything else fails closed. */
function parseRouteRegex(lit) {
  const m = lit.match(/^\/(.*)\/([a-z]*)$/);
  if (!m) return { ok: false, reason: 'not a regex literal' };
  /* JavaScript regex route separators are written `\/`. Convert that exact
     token to an explicit separator before splitting. Masking it and then
     splitting on a literal slash leaves the entire pattern in one segment. */
  const body = m[1].replace(/^\^/, '').replace(/\$$/, '').replace(/\\\//g, REGEX_SLASH);
  const segments = body.split(REGEX_SLASH).filter(s => s !== '');
  let templates = [''];
  for (const segRaw of segments) {
    const seg = segRaw;
    if (/^[A-Za-z0-9_.~-]+$/.test(seg)) {
      templates = templates.map(t => t + '/' + seg);
    } else if (/^\(\[[A-Za-z0-9-]+\]\{\d+(?:,\d*)?\}\)$/.test(seg)) {
      templates = templates.map(t => t + '/:id');
    } else if (/^\([A-Za-z0-9_]+(\|[A-Za-z0-9_]+)*\)$/.test(seg)) {
      const options = seg.slice(1, -1).split('|');
      const next = [];
      for (const t of templates) for (const o of options) next.push(t + '/' + o);
      templates = next;
    } else {
      return { ok: false, reason: 'unsupported regex segment: ' + segRaw };
    }
  }
  return { ok: true, templates };
}

export function extractWorkerContract(src, label) {
  const starts = lineStarts(src);
  const out = {
    label, protocol: null, protocolVersion: null, capabilitiesAdvertised: null,
    routes: [], catchAll404: false, ambiguities: []
  };

  const rdIdx = src.lastIndexOf('export default');
  if (rdIdx < 0) {
    out.ambiguities.push({ kind: 'worker-router', detail: 'no `export default` (module worker dispatch) found' });
    return out;
  }
  out.catchAll404 = /err\(404,\s*'route_not_found'/.test(src.slice(rdIdx));

  /* Collect route markers first so each route's method evidence window ends at
     the next marker — a bounded slice, never a whole-file search. */
  const markers = [];
  const exactRe = /if\s*\(\s*path\s*===\s*'([^']+)'\s*\)/g;
  const regexRe = /path\.match\s*\(\s*(\/(?:\\.|[^\\/\n])+\/[a-z]*)\s*\)/g;
  let m;
  while ((m = exactRe.exec(src))) if (m.index >= rdIdx) markers.push({ idx: m.index, end: m.index + m[0].length, kind: 'exact', value: m[1] });
  while ((m = regexRe.exec(src))) if (m.index >= rdIdx) markers.push({ idx: m.index, end: m.index + m[0].length, kind: 'regex', value: m[1] });
  markers.sort((a, b) => a.idx - b.idx);

  for (let i = 0; i < markers.length; i++) {
    const mk = markers[i];
    const window = src.slice(mk.end, i + 1 < markers.length ? markers[i + 1].idx : src.length);
    const methodRe = /request\.method\s*===?\s*'([A-Z]+)'/g;
    const methods = new Set();
    let mm;
    while ((mm = methodRe.exec(window))) methods.add(mm[1]);
    const methodList = [...methods].sort();
    const base = { methods: methodList, ...ev(src, starts, mk.idx) };

    if (mk.kind === 'exact') {
      const rec = { ...base, path: mk.value, dispatch: 'exact' };
      if (!methodList.length) {
        if (SOCIAL_PREFIXES.some(p => rec.path.startsWith(p)))
          out.ambiguities.push({ kind: 'worker-method', detail: `social route '${rec.path}' has no method guard in its dispatch window`, ...ev(src, starts, mk.idx) });
        else { rec.methods = ['*']; rec.note = 'no method guard (any method)'; }
      }
      out.routes.push(rec);
      continue;
    }

    const parsed = parseRouteRegex(mk.value);
    if (!parsed.ok) {
      out.ambiguities.push({ kind: 'worker-regex', detail: parsed.reason, ...ev(src, starts, mk.idx) });
      continue;
    }
    for (const template of parsed.templates) {
      const rec = { ...base, path: template, dispatch: 'regex', regex: mk.value };
      if (!methodList.length)
        out.ambiguities.push({ kind: 'worker-method', detail: `regex route '${template}' has no method guard`, ...ev(src, starts, mk.idx) });
      out.routes.push(rec);
    }
  }
  const seen = new Map();
  for (const r of out.routes) {
    const key = r.path + '|' + r.methods.join(',');
    if (!seen.has(key)) seen.set(key, r);
  }
  out.routes = [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));

  /* Capability payload: only meaningful if the handler exists. Absent handler
     is a legitimate old-contract state (findings, not ambiguity); present but
     unparseable IS an ambiguity. */
  const capIdx = src.search(/async\s+function\s+handleSocialCapabilities\s*\(/);
  if (capIdx >= 0) {
    const slice = sliceFunction(src, capIdx);
    if (!slice) {
      out.ambiguities.push({ kind: 'worker-capabilities', detail: 'handleSocialCapabilities() body did not brace-match', ...ev(src, starts, capIdx) });
    } else {
      const capKey = slice.text.match(/\bcapabilities\s*:\s*\{/);
      if (!capKey) {
        out.ambiguities.push({ kind: 'worker-capabilities', detail: 'no `capabilities: {` object in handler', ...ev(src, starts, capIdx) });
      } else {
        const objOpen = capKey.index + capKey[0].length - 1;
        const objClose = matchBrace(slice.text, objOpen);
        if (objClose < 0) {
          out.ambiguities.push({ kind: 'worker-capabilities', detail: 'capabilities object literal did not brace-match', ...ev(src, starts, capIdx) });
        } else {
          const inner = slice.text.slice(objOpen + 1, objClose);
          const pairs = splitTopLevel(inner, ',');
          const caps = [];
          let cursor = 0;
          for (const pair of pairs || []) {
            const pairAt = inner.indexOf(pair, cursor);
            cursor = pairAt < 0 ? cursor : pairAt + pair.length + 1;
            const trimmed = pair.trim();
            if (!trimmed) continue;
            const kv = trimmed.match(/^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]*?)\s*$/);
            const shorthand = trimmed.match(/^([A-Za-z_$][\w$]*)$/);
            if (!kv && !shorthand) {
              out.ambiguities.push({
                kind: 'worker-capabilities',
                detail: `unsupported capability property '${trimmed.slice(0, 80)}'`,
                ...ev(src, starts, capIdx + objOpen + 1 + Math.max(0, pairAt))
              });
              continue;
            }
            const name = (kv || shorthand)[1];
            const value = kv ? kv[2].trim() : name;
            const keyAt = Math.max(0, pairAt) + Math.max(0, pair.indexOf(name));
            caps.push({
              name,
              kind: value === 'true' ? 'static-true' : value === 'false' ? 'static-false' : 'dynamic',
              value: value.slice(0, 80),
              ...ev(src, starts, capIdx + objOpen + 1 + keyAt)
            });
          }
          out.capabilitiesAdvertised = caps.sort((a, b) => a.name.localeCompare(b.name));
        }
      }
      const pm = slice.text.match(/\bprotocol\s*:\s*'([^']+)'/);
      if (pm) out.protocol = { value: pm[1], ...ev(src, starts, capIdx + pm.index) };
      else out.ambiguities.push({ kind: 'worker-capabilities', detail: 'no protocol literal in handler', ...ev(src, starts, capIdx) });
      const vm = slice.text.match(/\bversion\s*:\s*([A-Za-z_$][\w$]*|\d+)/);
      if (vm) {
        let value = Number(vm[1]);
        if (!Number.isFinite(value)) {
          const cm = src.match(new RegExp('const\\s+' + escRe(vm[1]) + '\\s*=\\s*(\\d+)'));
          if (!cm) {
            out.ambiguities.push({ kind: 'worker-capabilities', detail: `version identifier '${vm[1]}' did not resolve to a numeric const`, ...ev(src, starts, capIdx + vm.index) });
          } else value = Number(cm[1]);
        }
        if (Number.isFinite(value)) out.protocolVersion = { value, ...ev(src, starts, capIdx + vm.index) };
      } else {
        out.ambiguities.push({ kind: 'worker-capabilities', detail: 'no version field in handler', ...ev(src, starts, capIdx) });
      }
    }
  }

  /* Env-var drivers for dynamic capabilities, resolved through the bounded
     `function <cap>Enabled(env){ return featureEnabled(env,'VAR'); }` shape.
     Unresolved drivers are notes, not ambiguities: the contract question is
     which NAMES are advertised; the driver is deploy-config evidence. */
  out.capabilityFlags = [];
  for (const cap of CAP_FLAG_DRIVERS) {
    const re = new RegExp('function\\s+' + cap + 'Enabled\\s*\\(\\s*env\\s*\\)\\s*\\{\\s*return\\s+featureEnabled\\(\\s*env\\s*,\\s*\'([^\']+)\'');
    const fm = src.match(re);
    if (fm) out.capabilityFlags.push({ capability: cap, envVar: fm[1], ...ev(src, starts, fm.index) });
  }
  return out;
}

/* wrangler.toml advisory: is the committed deploy config able to turn a
   capability on? Full-line comments and section headers are bounded; anything
   fancier (dotted keys, inline tables) is simply not matched -> reported off. */
export function extractWranglerFlags(tomlText, varNames) {
  const lines = tomlText.split('\n');
  const out = {};
  for (const name of varNames) {
    let enabled = false, line = 0;
    const re = new RegExp('^\\s*' + escRe(name) + '\\s*=\\s*"1"\\s*$');
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t || t.startsWith('#')) continue;
      if (re.test(lines[i])) { enabled = true; line = i + 1; }
    }
    out[name] = { enabled, line: line || null };
  }
  return out;
}

/* ---- comparison -------------------------------------------------------------- */

export function compareContracts(client, worker, wrangler) {
  const findings = [];
  const routeRows = [];
  const workerByPath = new Map();
  for (const w of worker.routes) {
    if (!workerByPath.has(w.path)) workerByPath.set(w.path, []);
    workerByPath.get(w.path).push(w);
  }

  for (const c of client.routes) {
    const cands = workerByPath.get(c.path) || [];
    const hit = cands.find(w => w.methods.includes('*') || w.methods.includes(c.method));
    if (hit) {
      routeRows.push({ status: 'OK', method: c.method, path: c.path, client: c, worker: hit });
      continue;
    }
    if (cands.length) {
      const methods = [...new Set(cands.flatMap(w => w.methods))].sort();
      routeRows.push({ status: 'METHOD_MISMATCH', method: c.method, path: c.path, client: c, worker: cands[0], workerMethods: methods });
      findings.push({ severity: 'error', type: 'method_mismatch', method: c.method, path: c.path, workerMethods: methods, evidence: { client: evOf(c), worker: evOf(cands[0]) } });
    } else {
      routeRows.push({ status: 'MISSING_ROUTE', method: c.method, path: c.path, client: c, worker: null });
      findings.push({ severity: 'error', type: 'missing_route', method: c.method, path: c.path, evidence: { client: evOf(c) } });
    }
  }

  const clientPaths = new Set(client.routes.map(r => r.path));
  const extraWorkerRoutes = worker.routes
    .filter(w => SOCIAL_PREFIXES.some(p => w.path.startsWith(p)) && !clientPaths.has(w.path))
    .map(w => ({ path: w.path, methods: w.methods, ...evOf(w) }));

  /* Capability handshake comparison. */
  const capRows = [];
  const handshakeRoute = workerByPath.get('/social/capabilities') || [];
  const handshakeServed = handshakeRoute.some(w => w.methods.includes('*') || w.methods.includes('GET'));
  if (!handshakeServed) {
    for (const name of client.capabilitiesRead)
      capRows.push({ status: 'INDETERMINATE', name, reason: 'worker has no GET /social/capabilities route — no capability can ever be confirmed' });
  } else if (worker.capabilitiesAdvertised) {
    const advert = new Map(worker.capabilitiesAdvertised.map(c => [c.name, c]));
    const flagByCap = new Map((worker.capabilityFlags || []).map(f => [f.capability, f]));
    for (const name of client.capabilitiesRead) {
      const a = advert.get(name);
      if (!a) {
        capRows.push({ status: 'MISSING_CAPABILITY', name });
        findings.push({ severity: 'error', type: 'missing_capability', name, detail: 'client reads this capability; the worker handshake payload never carries it' });
        continue;
      }
      if (a.kind === 'static-true') { capRows.push({ status: 'OK', name, worker: a }); continue; }
      if (a.kind === 'static-false') {
        capRows.push({ status: 'STATIC_FALSE', name, worker: a });
        findings.push({ severity: 'note', type: 'capability_static_false', name, detail: 'worker source hard-wires this to false — it can never be advertised true by this build', evidence: { worker: evOf(a) } });
        continue;
      }
      const flag = flagByCap.get(name);
      const w = flag && wrangler ? wrangler[flag.envVar] : null;
      const flagState = !flag ? 'driver env var not resolved'
        : !w ? 'no wrangler evidence'
        : w.enabled ? `${flag.envVar}="1" in committed wrangler.toml (line ${w.line})`
        : `${flag.envVar} not set in committed wrangler.toml`;
      capRows.push({ status: 'DYNAMIC', name, worker: a, flag: flagState });
      findings.push({
        severity: 'note', type: w && w.enabled ? 'capability_flag_on' : 'capability_gated', name,
        detail: `advertised dynamically; ${flagState}`,
        evidence: flag ? { worker: evOf(flag) } : { worker: evOf(a) }
      });
    }
  }

  if (client.protocol && worker.protocol) {
    if (client.protocol.value !== worker.protocol.value)
      findings.push({ severity: 'error', type: 'protocol_mismatch', client: client.protocol.value, worker: worker.protocol.value, evidence: { client: evOf(client.protocol), worker: evOf(worker.protocol) } });
    if (client.protocolVersion && worker.protocolVersion && client.protocolVersion.value !== worker.protocolVersion.value)
      findings.push({ severity: 'error', type: 'protocol_version_mismatch', client: client.protocolVersion.value, worker: worker.protocolVersion.value, evidence: { client: evOf(client.protocolVersion), worker: evOf(worker.protocolVersion) } });
  } else if (handshakeServed) {
    findings.push({ severity: 'error', type: 'protocol_unverifiable', detail: 'one side has no parseable protocol declaration' });
  }

  for (const a of client.ambiguities)
    findings.push({ severity: 'error', type: 'ambiguity_client', kind: a.kind, detail: a.detail,
      ...(a.line ? { evidence: { client: { line: a.line, source: a.source } } } : {}) });
  for (const a of worker.ambiguities)
    findings.push({ severity: 'error', type: 'ambiguity_worker', kind: a.kind, detail: a.detail,
      ...(a.line ? { evidence: { worker: { line: a.line, source: a.source } } } : {}) });

  const errors = findings.filter(f => f.severity === 'error');
  return {
    ok: errors.length === 0,
    routeRows, capRows, extraWorkerRoutes, findings,
    summary: {
      clientRoutes: client.routes.length,
      workerSocialRoutes: worker.routes.filter(w => SOCIAL_PREFIXES.some(p => w.path.startsWith(p))).length,
      okRoutes: routeRows.filter(r => r.status === 'OK').length,
      missingRoutes: routeRows.filter(r => r.status === 'MISSING_ROUTE').length,
      methodMismatches: routeRows.filter(r => r.status === 'METHOD_MISMATCH').length,
      capabilitiesRead: client.capabilitiesRead.length,
      capabilityErrors: errors.filter(f => f.type === 'missing_capability').length,
      ambiguities: client.ambiguities.length + worker.ambiguities.length,
      errors: errors.length, notes: findings.length - errors.length
    }
  };
}
function evOf(x) { return { line: x.line, source: x.source }; }
function sourceLoc(report, side, evidence) {
  const input = report.inputs && report.inputs[side];
  if (!input || !input.ref || !evidence || !Number.isInteger(evidence.line)) return 'unknown';
  return `${input.ref}:${evidence.line}`;
}

/* ---- report ------------------------------------------------------------------ */

export function formatReport(r) {
  const L = [];
  const w = p => L.push(p);
  w('# MASSFRONT social contract — offline source check');
  w('');
  w(`- generated: ${r.generatedAt}`);
  w(`- git: branch \`${r.git.branch}\` HEAD \`${r.git.head}\``);
  w(`- verdict: **${r.comparison.ok ? 'COMPATIBLE' : 'INCOMPATIBLE'}** (${r.comparison.summary.errors} errors, ${r.comparison.summary.notes} notes)`);
  w('');
  w('## Inputs (sha256 of exact bytes parsed)');
  w('');
  for (const [k, v] of Object.entries(r.inputs))
    if (v) w(`- ${k}: \`${v.ref}\` sha256 \`${v.sha256}\` (${v.bytes} bytes${v.gitStatus ? ', git: ' + JSON.stringify(v.gitStatus) : ''})`);
  w('');
  w('## Route contract (what the client calls → what the worker dispatches)');
  w('');
  w('| # | Method | Path | Client evidence | Worker evidence | Status |');
  w('|---|---|---|---|---|---|');
  r.comparison.routeRows.forEach((row, i) => {
    const ce = `${r.inputs.client.ref}:${row.client.line}`;
    const we = row.worker ? `${r.inputs.worker.ref}:${row.worker.line} [${row.worker.methods.join('/')}]` : '—';
    w(`| ${i + 1} | ${row.method} | \`${row.path}\` | ${ce} | ${we} | ${row.status} |`);
  });
  w('');
  if (r.comparison.extraWorkerRoutes.length) {
    w('Worker social/multiplayer routes the client never calls (informational): '
      + r.comparison.extraWorkerRoutes.map(x => `\`${x.path}\``).join(', '));
    w('');
  }
  const proto = r.worker.protocol
    ? `client \`${r.client.protocol ? r.client.protocol.value : '?'} v${r.client.protocolVersion ? r.client.protocolVersion.value : '?'}\` ↔ worker \`${r.worker.protocol.value} v${r.worker.protocolVersion ? r.worker.protocolVersion.value : '?'}\``
    : 'worker has no capability handshake payload to compare';
  w(`## Capability handshake (${proto})`);
  w('');
  w('| Capability | Worker advertises | Detail | Status |');
  w('|---|---|---|---|');
  for (const c of r.comparison.capRows)
    w(`| \`${c.name}\` | ${c.worker ? c.worker.kind : '—'} | ${c.flag || c.reason || (c.worker ? `\`${r.inputs.worker.ref}:${c.worker.line}\`` : '')} | ${c.status} |`);
  w('');
  w('Client reads: ' + (r.client.capabilitiesRead.map(n => `\`${n}\``).join(', ') || '(none parsed)'));
  w('');
  w('## Findings');
  w('');
  if (!r.comparison.findings.length) w('- none');
  for (const f of r.comparison.findings) {
    const loc = f.evidence
      ? ` (${[['client', f.evidence.client], ['worker', f.evidence.worker]]
          .filter(([, e]) => e).map(([side, e]) => sourceLoc(r, side, e)).join(' ↔ ')})`
      : '';
    w(`- [${f.severity.toUpperCase()}] ${f.type}${f.kind ? '/' + f.kind : ''}: ${f.method ? f.method + ' ' : ''}${f.path || f.name || ''} ${f.detail || ''}${loc}`.replace(/\s+/g, ' ').trim());
  }
  w('');
  w('## Limits of this check');
  w('');
  w('- Offline source comparison only. It says nothing about which build is actually');
  w('  deployed; that is the job of tools/verify-social-live-contract.mjs.');
  w('- Query-parameter names and response body shapes are evidence, not verified');
  w('  contract: only route, method, protocol id/version and capability names are');
  w('  compared.');
  w('');
  return L.join('\n');
}

/* ---- CLI ---------------------------------------------------------------------- */

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function git(args) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (e) { return null; }
}
function readInput(rel, ref) {
  if (ref) {
    const text = git(['show', `${ref}:${rel}`]);
    if (text === null) throw new Error(`git show ${ref}:${rel} failed`);
    return { text, ref: `${rel} @ ${ref}`, gitStatus: `(git object ${ref})` };
  }
  const abs = path.join(ROOT, rel);
  const text = fs.readFileSync(abs, 'utf8');
  return { text, ref: rel, gitStatus: git(['status', '--porcelain', '--', rel]) || 'clean' };
}

export function run(argv) {
  const args = argv.slice(2);
  const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ''; };
  const clientRel = arg('--client') || 'src/authportal.js';
  const workerRel = arg('--worker') || 'cloudflare/massfront-auth/src/index.js';
  const workerRef = arg('--worker-ref') || '';
  const wranglerRel = arg('--wrangler') || 'cloudflare/massfront-auth/wrangler.toml';
  const outDir = arg('--out') || path.join(ROOT, 'tmp', 'social-contract-lab');
  const label = arg('--label') || (workerRef ? workerRef.replace(/[^\w.-]/g, '_') : 'worktree');
  const noWrite = args.includes('--no-write');

  const clientIn = readInput(clientRel, '');
  const workerIn = readInput(workerRel, workerRef);
  let wrangler = null, wranglerMeta = null;
  try {
    const wIn = readInput(wranglerRel, '');
    wranglerMeta = { ref: wIn.ref, sha256: sha256(Buffer.from(wIn.text)), bytes: Buffer.byteLength(wIn.text), gitStatus: wIn.gitStatus };
    wrangler = wIn.text;
  } catch (e) { wranglerMeta = { ref: wranglerRel, error: 'unreadable: ' + e.message }; }

  const client = extractClientContract(clientIn.text, clientIn.ref);
  const worker = extractWorkerContract(workerIn.text, workerIn.ref);
  const flagVars = (worker.capabilityFlags || []).map(f => f.envVar);
  const wranglerFlags = wrangler && flagVars.length ? extractWranglerFlags(wrangler, flagVars) : null;
  const comparison = compareContracts(client, worker, wranglerFlags);

  const report = {
    tool: 'tools/social-contract-lab/checker.mjs',
    generatedAt: new Date().toISOString(),
    git: { branch: git(['rev-parse', '--abbrev-ref', 'HEAD']) || 'unknown', head: git(['rev-parse', 'HEAD']) || 'unknown' },
    inputs: {
      client: { ref: clientIn.ref, sha256: sha256(Buffer.from(clientIn.text)), bytes: Buffer.byteLength(clientIn.text), gitStatus: clientIn.gitStatus },
      worker: { ref: workerIn.ref, sha256: sha256(Buffer.from(workerIn.text)), bytes: Buffer.byteLength(workerIn.text), gitStatus: workerIn.gitStatus },
      wrangler: wranglerMeta
    },
    client, worker, wranglerFlags, comparison
  };
  const md = formatReport(report);

  if (!noWrite) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `contract-report.${label}.md`), md);
    fs.writeFileSync(path.join(outDir, `contract-evidence.${label}.json`), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(md);
  console.log(`\nsocial-contract-lab [${label}]: ${comparison.ok ? 'COMPATIBLE' : 'INCOMPATIBLE'} — `
    + `${comparison.summary.okRoutes}/${comparison.summary.clientRoutes} client routes served, `
    + `${comparison.summary.missingRoutes} missing, ${comparison.summary.methodMismatches} method mismatches, `
    + `${comparison.summary.capabilityErrors} capability errors, ${comparison.summary.ambiguities} ambiguities`);
  return comparison.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exit(run(process.argv)); }
  catch (e) { console.error('social-contract-lab: ' + (e && e.message || e)); process.exit(2); }
}
