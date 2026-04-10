// ============================================================
// js/db.js v5
// 현재가: Supabase DB의 stock_prices 테이블에서 읽기
// Edge Function 불필요 — 네이버 금융에서 확인 후 홈페이지에서 직접 입력
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
  }
  const { data, error } = await sb.from('members').insert(payload).select().single();
  if (error) throw error;
  return data;
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
  const [members, settlements] = await Promise.all([fetchMembers(), fetchSettlements()]);
  return members.map((m, i) => {
    const myS        = settlements.filter(s => s.member_id === m.id);
    const netProfit  = myS.reduce((sum, s) => sum + (s.net_profit || 0), 0);
    const returnRate = parseFloat(((m.base_amount - 1000000) / 1000000 * 100).toFixed(1));
    return { ...m, net_profit: netProfit, return_rate: returnRate, av_cls: avCls[i % 6] };
  });
}

// ============================================================
// ============================================================
// 현재가 조회
// 1순위: DB stock_prices (GitHub Actions 자동 업데이트, 빠름)
// 2순위: DB에 없는 종목 → Edge Function 실시간 조회 (네이버 금융)
// 5분 캐시
// ============================================================
const _priceCache = {};

async function fetchCurrentPrices(codes) {
  if (!codes || codes.length === 0) return {};

  const now     = Date.now();
  const result  = {};
  const noCache = [];

  // 캐시 확인
  for (const c of codes) {
    if (_priceCache[c] && (now - _priceCache[c].ts) < 5 * 60 * 1000) {
      result[c] = _priceCache[c].data;
    } else {
      noCache.push(c);
    }
  }
  if (noCache.length === 0) return result;

  // 1순위: DB에서 조회
  try {
    const { data, error } = await sb
      .from('stock_prices')
      .select('stock_code, price, change_rate, market_cap, updated_at')
      .in('stock_code', noCache);

    if (!error && data) {
      for (const row of data) {
        if (row.price && row.price > 0) {
          const info = {
            price:     row.price,
            change:    row.change_rate || 0,
            marketCap: row.market_cap  || null,
            updatedAt: row.updated_at,
          };
          result[row.stock_code] = info;
          _priceCache[row.stock_code] = { ts: now, data: info };
        }
      }
    }
  } catch(e) {
    console.warn('DB 현재가 조회 실패:', e.message);
  }

  // 2순위: DB에 없는 종목 → Edge Function (네이버 금융) 실시간 조회
  const missing = noCache.filter(c => !result[c]);
  if (missing.length > 0) {
    try {
      const { data, error } = await sb.functions.invoke('stock-price', {
        body: { codes: missing }
      });
      if (!error && data) {
        for (const [code, info] of Object.entries(data)) {
          if (info && info.price > 0) {
            const enriched = { ...info, updatedAt: new Date().toISOString() };
            result[code] = enriched;
            _priceCache[code] = { ts: now, data: enriched };

            // DB에도 저장 (다음에는 DB에서 바로 읽힘)
            try {
              await sb.from('stock_prices').upsert({
                stock_code:  code,
                stock_name:  info.name || code,
                market:      'KOSPI',
                price:       info.price,
                change_rate: info.change || 0,
                market_cap:  info.marketCap || null,
                updated_at:  new Date().toISOString(),
              }, { onConflict: 'stock_code' });
            } catch(e) {
              console.warn('DB 자동 저장 실패:', e.message);
            }
          }
        }
      }
    } catch(e) {
      console.warn('Edge Function 조회 실패:', e.message);
    }
  }

  return result;
}

// 현재가 저장 (주식 현황 페이지에서 호출)
async function upsertStockPrice(payload) {
  const { data, error } = await sb
    .from('stock_prices')
    .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: 'stock_code' })
    .select().single();
  if (error) throw error;
  return data;
}

// stock_prices 전체 목록
async function fetchStockPrices() {
  const { data, error } = await sb
    .from('stock_prices')
    .select('*')
    .order('stock_name');
  if (error) { console.error(error); return []; }
  return data || [];
}

// ============================================================
// 일정 관리
// ============================================================
async function fetchSchedules() {
  const { data, error } = await sb
    .from('schedules').select('*').order('event_date', { ascending: true });
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
