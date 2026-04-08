// ============================================================
// js/db.js  — 최종본
// 변경: 현재가 CORS 프록시 교체 + 일정 함수 포함
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

// ── 탑픽 제출
async function submitPick(payload) {
  const { data, error } = await sb.from('picks').insert(payload).select().single();
  if (error) throw error;
  return data;
}

// ── 매매 등록
async function submitTrade(payload) {
  const { data, error } = await sb.from('trades').insert(payload).select().single();
  if (error) throw error;
  return data;
}

// ── 결산 등록
async function submitSettlement(payload) {
  const { data, error } = await sb.from('settlements').insert(payload).select().single();
  if (error) throw error;
  return data;
}

// ── 참여자 추가/수정
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

// ── 참여자 탈퇴
async function deactivateMember(id) {
  const { error } = await sb.from('members').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

// ── 현재 연월
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

// ── 참여자 통계
async function fetchMemberStats() {
  const members     = await fetchMembers();
  const settlements = await fetchSettlements();
  return members.map((m, i) => {
    const myS       = settlements.filter(s => s.member_id === m.id);
    const netProfit = myS.reduce((sum, s) => sum + (s.net_profit || 0), 0);
    const returnRate= parseFloat(((m.base_amount - 1000000) / 1000000 * 100).toFixed(1));
    return { ...m, net_profit: netProfit, return_rate: returnRate, av_cls: avCls[i % 6] };
  });
}

// ============================================================
// 현재가 조회
// 방법 1: corsproxy.io (주 프록시)
// 방법 2: allorigins.win (백업 프록시)
// 둘 다 실패 시 빈 객체 반환 → UI에서 직접 입력 유도
// 5분 캐시 적용
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

  // 1차: KOSPI (.KS) 시도
  const result = await _yahooFetch(toFetch, 'KS');

  // 2차: 못 찾은 코드 KOSDAQ (.KQ) 재시도
  const missing = toFetch.filter(c => !result[c] || result[c].price === 0);
  if (missing.length > 0) {
    const result2 = await _yahooFetch(missing, 'KQ');
    for (const [k, v] of Object.entries(result2)) {
      if (v && v.price > 0) result[k] = v;
    }
  }

  for (const [code, info] of Object.entries(result)) {
    if (info && info.price > 0) {
      priceCache[code] = { ts: now, data: info };
      fresh[code] = info;
    }
  }
  return fresh;
}

async function _yahooFetch(codes, suffix) {
  const symbols = codes.map(c => `${c}.${suffix}`).join(',');
  const fields  = 'regularMarketPrice,regularMarketChangePercent,shortName,marketCap';
  const yahooUrl= `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=${fields}`;

  // 프록시 목록 (순서대로 시도)
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
    `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`,
  ];

  for (const proxyUrl of proxies) {
    try {
      const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) continue;

      let json;
      const text = await resp.text();

      // allorigins는 { contents: "..." } 형태로 감싸서 반환
      if (proxyUrl.includes('allorigins')) {
        const outer = JSON.parse(text);
        json = JSON.parse(outer.contents);
      } else {
        json = JSON.parse(text);
      }

      const quotes = json?.quoteResponse?.result ?? [];
      if (quotes.length === 0) continue;

      const result = {};
      for (const q of quotes) {
        const code = q.symbol.replace(/\.(KS|KQ)$/, '');
        result[code] = {
          price:     Math.round(q.regularMarketPrice ?? 0),
          change:    parseFloat((q.regularMarketChangePercent ?? 0).toFixed(2)),
          name:      q.shortName ?? code,
          marketCap: q.marketCap ? Math.round(q.marketCap / 100_000_000) : null,
        };
      }
      return result;  // 성공 시 즉시 반환

    } catch(e) {
      console.warn(`프록시 실패 (${proxyUrl.split('?')[0]}):`, e.message);
      // 다음 프록시 시도
    }
  }

  return {}; // 모든 프록시 실패
}

// ============================================================
// 일정 관리 (schedules 테이블)
// ============================================================

async function fetchSchedules() {
  const { data, error } = await sb
    .from('schedules')
    .select('*')
    .order('event_date', { ascending: true });
  if (error) { console.error('fetchSchedules 오류:', error); return []; }
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
