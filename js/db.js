// ============================================================
// js/db.js
// ============================================================

async function fetchMembers() {
  const { data, error } = await sb.from('members').select('*').eq('is_active', true).order('joined_at');
  if (error) { console.error(error); return []; }
  return data;
}

async function fetchPicksByMonth(month) {
  const { data, error } = await sb.from('picks_with_trades').select('*').eq('month', month).order('submitted_at');
  if (error) { console.error(error); return []; }
  return data;
}

async function fetchAllPicks(filters = {}) {
  let q = sb.from('picks_with_trades').select('*');
  if (filters.member_id) q = q.eq('member_id', filters.member_id);
  if (filters.status)    q = q.eq('status', filters.status);
  const { data, error } = await q.order('month', { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}

async function fetchTrades(limit = 30) {
  const { data, error } = await sb.from('trades')
    .select('*, members(name), picks(stock_name, month)')
    .order('traded_at', { ascending: false }).limit(limit);
  if (error) { console.error(error); return []; }
  return data;
}

async function fetchSettlements() {
  const { data, error } = await sb.from('settlements')
    .select('*, members(name), picks(stock_name, month)')
    .order('settled_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}

async function submitPick(payload) {
  const { data, error } = await sb.from('picks').insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function submitTrade(payload) {
  const { data, error } = await sb.from('trades').insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function submitSettlement(payload) {
  const { data, error } = await sb.from('settlements').insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function upsertMember(payload) {
  if (payload.id) {
    const { id, ...rest } = payload;
    const { data, error } = await sb.from('members').update(rest).eq('id', id).select().single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await sb.from('members').insert(payload).select().single();
    if (error) throw error;
    return data;
  }
}

async function deactivateMember(id) {
  const { error } = await sb.from('members').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

async function fetchMemberStats() {
  const members     = await fetchMembers();
  const settlements = await fetchSettlements();
  return members.map((m, i) => {
    const myS       = settlements.filter(s => s.member_id === m.id);
    const netProfit = myS.reduce((sum, s) => sum + (s.net_profit || 0), 0);
    const returnRate= parseFloat(((m.base_amount - 1000000) / 1000000 * 100).toFixed(1));
    return { ...m, net_profit: netProfit, return_rate: returnRate, av_cls: avCls[i % 4] };
  });
}

// ============================================================
// 현재가 조회 — allorigins CORS 프록시 → Yahoo Finance
// Edge Function 없이도 동작 / 5분 캐시
// ============================================================
const priceCache = {};

async function fetchCurrentPrices(codes) {
  if (!codes || codes.length === 0) return {};

  const now   = Date.now();
  const fresh = {};
  const toFetch = [];

  for (const c of codes) {
    if (priceCache[c] && (now - priceCache[c].ts) < 5 * 60 * 1000) {
      fresh[c] = priceCache[c].data;
    } else {
      toFetch.push(c);
    }
  }
  if (toFetch.length === 0) return fresh;

  // 1차: .KS (KOSPI) 시도
  const result = await _yahooFetch(toFetch.map(c => c + '.KS'));

  // 2차: 못 찾은 코드 .KQ (KOSDAQ) 재시도
  const missing = toFetch.filter(c => !result[c] || result[c].price === 0);
  if (missing.length > 0) {
    const result2 = await _yahooFetch(missing.map(c => c + '.KQ'));
    Object.assign(result, result2);
  }

  for (const [code, info] of Object.entries(result)) {
    if (info && info.price > 0) {
      priceCache[code] = { ts: now, data: info };
      fresh[code] = info;
    }
  }
  return fresh;
}

async function _yahooFetch(symbols) {
  const result = {};
  try {
    const syms  = symbols.join(',');
    const fields= 'regularMarketPrice,regularMarketChangePercent,shortName,marketCap';
    // allorigins.win: 무료 CORS 프록시 (Yahoo Finance는 브라우저에서 직접 CORS 차단)
    const target = encodeURIComponent(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}&fields=${fields}`
    );
    const proxyUrl = `https://api.allorigins.win/get?url=${target}`;

    const resp = await fetch(proxyUrl);
    if (!resp.ok) throw new Error(`proxy ${resp.status}`);
    const outer = await resp.json();
    const json  = JSON.parse(outer.contents);
    const quotes= json?.quoteResponse?.result ?? [];

    for (const q of quotes) {
      const code = q.symbol.replace(/\.(KS|KQ)$/, '');
      const mcKRW= q.marketCap ?? null;
      result[code] = {
        price:     Math.round(q.regularMarketPrice ?? 0),
        change:    parseFloat((q.regularMarketChangePercent ?? 0).toFixed(2)),
        name:      q.shortName ?? code,
        marketCap: mcKRW ? Math.round(mcKRW / 100_000_000) : null, // 억원
      };
    }
  } catch(e) {
    console.warn('Yahoo 조회 실패:', e.message);
  }
  return result;
}

// ============================================================
// 일정 관리
// ============================================================
async function fetchSchedules() {
  const { data, error } = await sb.from('schedules')
    .select('*').order('event_date', { ascending: true });
  if (error) { console.error(error); return []; }
  return data;
}

async function submitSchedule(payload) {
  const { data, error } = await sb.from('schedules').insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function updateSchedule(id, payload) {
  const { data, error } = await sb.from('schedules').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function deleteSchedule(id) {
  const { error } = await sb.from('schedules').delete().eq('id', id);
  if (error) throw error;
}
