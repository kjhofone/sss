// ============================================================
// js/db.js  v4 최종본
// 현재가: Supabase Edge Function 우선 → 실패 시 수동입력 안내
// 일정: submitSchedule / updateSchedule / deleteSchedule 포함
// ============================================================

// ── 참여자
async function fetchMembers() {
  const { data, error } = await sb.from('members').select('*').eq('is_active', true).order('joined_at');
  if (error) { console.error(error); return []; }
  return data;
}

// ── 탑픽 (월별)
async function fetchPicksByMonth(month) {
  const { data, error } = await sb.from('picks_with_trades').select('*').eq('month', month).order('submitted_at');
  if (error) { console.error(error); return []; }
  return data;
}

// ── 탑픽 (전체)
async function fetchAllPicks(filters = {}) {
  let q = sb.from('picks_with_trades').select('*');
  if (filters.member_id) q = q.eq('member_id', filters.member_id);
  if (filters.status)    q = q.eq('status', filters.status);
  const { data, error } = await q.order('month', { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}

// ── 매매 내역
async function fetchTrades(limit = 30) {
  const { data, error } = await sb.from('trades')
    .select('*, members(name), picks(stock_name, month)')
    .order('traded_at', { ascending: false }).limit(limit);
  if (error) { console.error(error); return []; }
  return data;
}

// ── 결산
async function fetchSettlements() {
  const { data, error } = await sb.from('settlements')
    .select('*, members(name), picks(stock_name, month)')
    .order('settled_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}

// ── CRUD
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
  }
  const { data, error } = await sb.from('members').insert(payload).select().single();
  if (error) throw error;
  return data;
}
async function deactivateMember(id) {
  const { error } = await sb.from('members').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

// ── 유틸
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

async function fetchMemberStats() {
  const [members, settlements] = await Promise.all([fetchMembers(), fetchSettlements()]);
  return members.map((m, i) => {
    const myS        = settlements.filter(s => s.member_id === m.id);
    const netProfit  = myS.reduce((sum, s) => sum + (s.net_profit || 0), 0);
    const returnRate = parseFloat(((m.base_amount - 1000000) / 1000000 * 100).toFixed(1));
    return { ...m, net_profit: netProfit, return_rate: returnRate, av_cls: avCls[i % 6] };
  });
}

// ============================================================
// 현재가 조회
// 1순위: Supabase Edge Function (stock-price)
//        → 배포되어 있으면 서버에서 실행되므로 CORS 문제 없음
// 2순위: 실패 시 null 반환 → UI에서 직접 입력 안내
// 5분 캐시
// ============================================================
const priceCache = {};

async function fetchCurrentPrices(codes) {
  if (!codes || codes.length === 0) return {};

  const now     = Date.now();
  const fresh   = {};
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
    // Edge Function 호출 (Supabase 대시보드에서 배포한 stock-price 함수)
    const { data, error } = await sb.functions.invoke('stock-price', {
      body: { codes: toFetch }
    });
    if (error) throw new Error(error.message);
    if (!data)  throw new Error('응답 없음');

    for (const [code, info] of Object.entries(data)) {
      if (info && info.price > 0) {
        priceCache[code] = { ts: now, data: info };
        fresh[code] = info;
      }
    }
  } catch (e) {
    console.warn('Edge Function 현재가 조회 실패:', e.message);
    // 실패 시 빈 객체 반환 → picks.html에서 "직접 입력" 모드로 전환
  }

  return fresh;
}

// ============================================================
// 일정 관리
// ============================================================
async function fetchSchedules() {
  const { data, error } = await sb
    .from('schedules')
    .select('*')
    .order('event_date', { ascending: true });
  if (error) { console.error('fetchSchedules 오류:', error.message); return []; }
  return data ?? [];
}

async function submitSchedule(payload) {
  const { data, error } = await sb.from('schedules').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function updateSchedule(id, payload) {
  const { data, error } = await sb.from('schedules').update(payload).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function deleteSchedule(id) {
  const { error } = await sb.from('schedules').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
