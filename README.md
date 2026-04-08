# 투자 스터디 펀드 v2 — 세팅 가이드

## 변경사항
- 참여자 6명 × 10개월 샘플 데이터
- 손실 시 100만원 복구 로직 제거 (순수 누적 방식)
- 현재가 자동 조회 (Yahoo Finance → Edge Function)
- 사용자 관리 페이지 추가 (admin.html)

---

## STEP 1. DB 초기화 및 샘플 데이터

Supabase SQL Editor에 `supabase_schema_v2.sql` 전체 붙여넣고 Run  
→ 테이블 재생성 + 6명 × 10개월 데이터 자동 입력

---

## STEP 2. 현재가 API (Edge Function) 배포

**2-1. Supabase CLI 설치**
```bash
# macOS
brew install supabase/tap/supabase

# Windows (PowerShell)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**2-2. 로그인 및 프로젝트 연결**
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_ID
```

**2-3. Edge Function 배포**
```bash
supabase functions deploy stock-price
```

**2-4. 배포 확인**  
Supabase 대시보드 → Edge Functions → `stock-price` 활성화 확인

---

## STEP 3. config.js 수정

`js/config.js`에서:
```js
const SUPABASE_URL  = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON = 'YOUR_ANON_PUBLIC_KEY';
```

---

## STEP 4. GitHub Pages 배포

파일 전체를 GitHub 저장소에 올리고  
Settings → Pages → Branch: main → Save

---

## 현재가 동작 방식

```
브라우저 → Supabase Edge Function (stock-price)
                ↓
         Yahoo Finance API
         005930.KS (KOSPI)
         035720.KQ (KOSDAQ)
                ↓
         { price: 81300, change: 1.2 }
                ↓
브라우저 ← 현재가 표시 (5분 캐시)
```

**Edge Function이 없어도:** 현재가 칸이 `-`로 표시되고 나머지 기능은 정상 동작합니다.

---

## 사용자 관리 (admin.html)

| 기능 | 설명 |
|---|---|
| 참여자 추가 | 이름, 이메일, 기준금액, 참여일 입력 |
| 정보 수정 | 이름, 이메일, 메모 등 수정 가능 |
| 탈퇴 처리 | `is_active = false` 처리 (데이터 보존) |
| 수익률 요약 | 최고/평균/최저 수익률 카드 표시 |

---

## 결산 방식 변경 (v2)

- **이전:** 손실 시 100만원으로 강제 복구  
- **v2:** 손실/수익 그대로 기준금액에 누적  
  예) 1,000,000 → -70,000 손실 → 기준금액 930,000원으로 다음 달 운용
