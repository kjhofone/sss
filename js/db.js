// ============================================================
// js/db.js v2
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
  const members    = await fetchMembers();
  const settlements= await fetchSettlements();
  return members.map((m, i) => {
    const myS      = settlements.filter(s => s.member_id === m.id);
    const netProfit= myS.reduce((sum, s) => sum + (s.net_profit || 0), 0);
    const initBase = 1000000;
    const returnRate = parseFloat(((m.base_amount - initBase) / initBase * 100).toFixed(1));
    return { ...m, net_profit: netProfit, return_rate: returnRate, av_cls: avCls[i % 4] };
  });
}

// ============================================================
// 현재가 조회 — Supabase Edge Function 경유 (Yahoo Finance)
// ============================================================
// 캐시: 5분
const priceCache = {};

async function fetchCurrentPrices(codes) {
  if (!codes || codes.length === 0) return {};

  const now = Date.now();
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

  try {
    // Edge Function 호출
    const { data, error } = await sb.functions.invoke('stock-price', {
      body: { codes: toFetch }
    });

    if (error) throw error;

    for (const [code, info] of Object.entries(data || {})) {
      priceCache[code] = { ts: now, data: info };
      fresh[code] = info;
    }
  } catch (e) {
    console.warn('현재가 조회 실패:', e.message);
    // 실패 시 빈 객체 반환 (UI에서 '-' 표시)
  }

  return fresh;
}
