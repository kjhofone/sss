// ============================================================
// js/db.js  — 공통 DB 쿼리 함수
// ============================================================

/** 전체 참여자 목록 */
async function fetchMembers() {
  const { data, error } = await sb.from('members').select('*').eq('is_active', true).order('name');
  if (error) { console.error(error); return []; }
  return data;
}

/** 특정 월 탑픽 + 매매 정보 (뷰 사용) */
async function fetchPicksByMonth(month) {
  const { data, error } = await sb
    .from('picks_with_trades')
    .select('*')
    .eq('month', month)
    .order('submitted_at');
  if (error) { console.error(error); return []; }
  return data;
}

/** 전체 히스토리 (최신순) */
async function fetchAllPicks(filters = {}) {
  let q = sb.from('picks_with_trades').select('*');
  if (filters.member_id) q = q.eq('member_id', filters.member_id);
  if (filters.status)    q = q.eq('status', filters.status);
  const { data, error } = await q.order('month', { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}

/** 최근 매매 내역 */
async function fetchTrades(limit = 20) {
  const { data, error } = await sb
    .from('trades')
    .select('*, members(name), picks(stock_name, month)')
    .order('traded_at', { ascending: false })
    .limit(limit);
  if (error) { console.error(error); return []; }
  return data;
}

/** 결산 내역 */
async function fetchSettlements() {
  const { data, error } = await sb
    .from('settlements')
    .select('*, members(name), picks(stock_name, month)')
    .order('settled_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}

/** 탑픽 제출 */
async function submitPick(payload) {
  const { data, error } = await sb.from('picks').insert(payload).select().single();
  if (error) throw error;
  return data;
}

/** 매매 내역 추가 */
async function submitTrade(payload) {
  const { data, error } = await sb.from('trades').insert(payload).select().single();
  if (error) throw error;
  return data;
}

/** 결산 추가 */
async function submitSettlement(payload) {
  const { data, error } = await sb.from('settlements').insert(payload).select().single();
  if (error) throw error;
  return data;
}

/** 현재 연월 반환  예: '2025-04' */
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

/** 참여자별 현재 평가액 계산
 *  매수 후 미매도 종목은 현재가 입력 필요 (별도 현재가 API 미연동이므로 DB 저장값 사용)
 *  여기서는 settlements 기준 누적 기준금액을 반환 */
async function fetchMemberStats() {
  const members = await fetchMembers();
  const settlements = await fetchSettlements();

  return members.map((m, i) => {
    const mySettles = settlements.filter(s => s.member_id === m.id);
    const totalProfit = mySettles.reduce((sum, s) => sum + (s.net_profit || 0), 0);
    const returnRate = m.base_amount > 0
      ? ((totalProfit / 1000000) * 100).toFixed(1)
      : '0.0';
    return {
      ...m,
      total_profit: totalProfit,
      return_rate: parseFloat(returnRate),
      av_cls: avCls[i % 4]
    };
  });
}
