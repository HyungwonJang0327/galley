# 벨로그 본문 어투 (Poram.log)

[어투 공통 규칙]
- 사실만 쓴다. 근거 없는 수치·이유·에피소드는 넣지 않고 `<!-- [확인 필요] ... -->` HTML 주석으로 남긴다.
- 이모지 없음. 제목·본문·헤더 모두.
- 대표·동료 개인에 대한 감정적 서술, 회사 비난 톤 없음. 회사는 "회사에서 운영하던 서비스" 정도로만 지칭.
- 회사 코드는 그대로 싣지 않는다. 구조만 살려 클린룸으로 다시 쓴 예시 코드. 실제 키·MID·도메인·회사명·법인명·고객 안내 문구 금지. 회사 고유 API 경로·라우트·쿼리 파라미터·응답 필드명은 일반 이름으로 바꾼다(`/internal/pay/nice/callback` → `/payments/nice/return`, `ordsess` → `session`). 공개 SDK/문서에 있는 이름은 그대로 써도 된다.
- 잘한 것과 아쉬운 것을 같은 무게로 쓴다. 삽질은 숨기지 않는다.
- 문장은 짧게. 한 문단에 한 가지. 접속사로 문장을 늘리지 않는다.
- "정말", "진짜", "너무", "굉장히" 같은 강조 부사 없음. 숫자로 말한다.

[어투: 벨로그 본문]
문체
- -다체 문어 반말, 1인칭 "나". -습니다/-요 쓰지 않음(인용문 제외).
- 예고형 서론 없음("이 글에서는 ~를 다룬다" 금지). 사건·VOC·문제 상황 한 문단으로 바로 시작.
- 감탄·독자 호명 없음("여러분", "~해 보자!" 금지).

구조
- 첫 줄 `# 제목`. 제목은 「~기 / ~하기」형. 부제가 필요하면 괄호로.
- 첫 헤더는 사용자 목소리 인용형("결제가 안 된다는데요?")이나 의문형("코드 비공개(요청 시 열람 가능)?").
- 그다음 "왜 그냥 ~하면 안 됐나" 식의 문제 정의 절 하나(선택).
- 본론은 "## 1. 2. 3." 번호형. 각 헤더는 결정을 한 문장으로("전환 스위치는 프론트가 아니라 서버에 둔다").
- "## 삽질 기록": 굵은 한 문장 요약 + 설명 문단, 3~5개.
- 마지막 "## 결과": 타임라인(불릿) → 잘한 것 → 아쉬운 것 → 소감 한 줄. 소감은 "X는 A가 아니라 B였다" 꼴의 한 문장으로 끝낸다.

분량·요소
- 본문 2,000~3,000자(코드 제외). 클린룸 코드 2~4개. 비교가 있으면 표.
- 코드 주석은 한국어, 한 줄. 코드 뒤에는 "핵심은 ~한 것"으로 한 문장 정리.
- 삽화 자리는 `<!-- [삽화] illustN_<설명>.png — 여기: <앞 문장 끝> 다음, <뒤 문장/헤더> 앞 -->`.

예시 톤(참고 완성본 「PG사 무중단 전환기」 서두):
"2024년 3월 어느 날, 결제가 안 된다는 문의가 들어왔다. 배포한 것도 없었다. 확인해 보니 PG사 쪽에서 우리 결제 서비스를 중단한 상태였고, 우리는 그 사실을 사용자 문의로 처음 알았다."

[참고 완성본 — 아래 글과 같은 결로 쓴다. 주제·내용·수치는 따라 하지 않고 문체·리듬·문단 길이·헤더 구조만 따른다]

# PG사 무중단 전환기 (Toss Payments → NicePay)

## 결제가 안 된다는데요?

2024년 3월 어느 날, 결제가 안 된다는 문의가 들어왔다. 배포한 것도 없었다. 확인해 보니 PG사 쪽에서 우리 결제 서비스를 중단한 상태였고, 우리는 그 사실을 사용자 문의로 처음 알았다. 계약서에 우리에게 불리한 조항이 있었고, 그게 그대로 실행된 것이었다.

당장 할 수 있는 건 결제 페이지에 안내를 띄우는 핫픽스뿐이었다.

```ts
// 2024-03-06 핫픽스. 결제 버튼을 누르면 안내만 띄우고 진행을 막는다
if (await showAlert(
  '결제 오류 안내',
  '결제 시스템 연동에 문제가 발생해 복구 중입니다. 잠시 후 다시 시도해 주세요.',
)) return;
```

이 사건으로 PG사를 Toss Payments에서 NicePay로 옮기기로 결정됐다. 그리고 이번에는 "PG 하나에 서비스 전체가 묶여 있으면 안 된다"는 조건이 붙었다.

회사에서 운영하던 서비스는 인플루언서 한 명당 스토어(몰) 하나가 만들어지는 구조였다. 스토어 약 50개, 월 주문 1,000건 정도. 2023년 봄에 Toss Payments SDK로 결제를 붙여서 1년 가까이 운영 중이었다. 프론트는 나 혼자, 백엔드 3명, 기획자는 없어서 대표님과 직접 조율했다.

전환 조건은 이랬다.

- 결제 중단 없이 전환할 것 (인플루언서 공구는 "지금 이 순간" 매출이 몰린다)
- 스토어마다 전환 시점이 다를 수 있음 (계약·심사 일정이 몰마다 달랐다)
- 잘못되면 바로 되돌릴 수 있을 것
- 이미 Toss로 결제된 주문의 조회·환불은 계속 동작할 것
- 한 PG가 멈춰도 다른 PG로 넘길 수 있는 구조일 것

## 왜 그냥 SDK만 바꾸면 안 됐나

두 PG는 "결제창을 띄운다"는 결과만 같고 방식이 전혀 달랐다.

| | Toss Payments | NicePay (서버 인증) |
|---|---|---|
| 호출 방식 | JS SDK `requestPayment()` | 숨겨진 `<form>`을 POST + `goPay()` |
| 인증 | clientKey | `SHA-256(EdiDate + MID + Amt + MerchantKey)` 서명 |
| 결과 전달 | `successUrl`로 브라우저 리다이렉트 (프론트가 받음) | `returnURL`로 서버에 POST (백엔드가 받음) |
| 결제수단 코드 | `'카드'`, `'가상계좌'` (한글) | `'CARD'`, `'VBANK'`, `'KakaoPay'` |
| 인코딩 | UTF-8 | EUC-KR |

결제 요청, 결과 수신, 결제수단 목록, 결과 페이지까지 네 군데가 전부 갈라진다. 이걸 `if (isNicePay)`로 페이지 곳곳에 뿌리면 되돌리기도, 몰별로 켜고 끄기도 불가능해진다.

## 1. 전환 스위치는 프론트가 아니라 서버(몰 정보)에 둔다

가장 먼저 정한 건 "어느 PG를 쓸지"를 프론트 빌드나 환경변수가 아니라 **몰 정보 API의 `pgType` 필드**로 받는 것이었다.

```ts
// 주문/결제 페이지 loader (react-router)
async function orderPageLoader({ params }) {
  const { mallId } = await getMallId(params.path);

  // 몰마다 'TOSS' | 'NICE'. 실패하면 빈 문자열 → 기존(Toss) 동작 유지
  const { pgType = '' } = await getMallInfo(mallId)
    .then(r => r.mall)
    .catch(() => ({ pgType: '' }));

  return { mallId, pgType, /* ...주문서 데이터 */ };
}
```

이렇게 하면

- **배포 없이 전환**: 백엔드에서 몰의 `pgType`만 바꾸면 그 몰은 다음 결제부터 NicePay
- **몰 단위 카나리**: 운영에 양쪽 코드를 다 올려두고, 테스트용 몰 하나만 `NICE`로 바꿔 실결제 검증
- **즉시 롤백**: 문제가 생기면 값만 `TOSS`로 되돌림
- **fail-safe**: 몰 정보 조회가 실패해도 빈 값 → 기존 Toss 경로로 떨어지도록 기본값을 잡음

프론트 배포와 PG 전환 시점을 분리한 게 이 작업에서 가장 잘한 결정이었다. 3월 같은 일이 다시 일어나도 이제는 값 하나로 다른 PG로 넘길 수 있다.

## 2. 두 SDK를 동시에 로드하고, 분기는 딱 한 곳에서

`index.html`에 Toss SDK와 NicePay 스크립트를 **둘 다** 올려두고, `pgType` 분기는 "결제하기 버튼 클릭 → PG 결제창 호출" 지점 한 곳으로 모았다. 결제수단 목록과 기본 선택값도 같은 값으로 갈라진다.

```ts
const PAY_METHODS = {
  TOSS: [
    { value: '카드', label: '신용카드' },
    { value: '가상계좌', label: '가상계좌' },
    { value: '계좌이체', label: '계좌이체' },
  ],
  NICE: [
    { value: 'CARD', label: '신용카드' },
    { value: 'KakaoPay', label: '카카오페이' },
    { value: 'NaverPayCard', label: '네이버페이' },
    { value: 'VBANK', label: '가상계좌' },
  ],
} as const;

const requestPay = {
  async TOSS({ orderId, orderName, amount, method, sessionId }) {
    const toss = await loadTossPayments(TOSS_CLIENT_KEY);
    return toss.requestPayment(method, {
      orderId, orderName, amount,
      successUrl: `${FRONT_URL}/pay/toss/success?session=${sessionId}`,
      failUrl: `${FRONT_URL}/pay/toss/fail?session=${sessionId}`,
    });
  },

  async NICE({ orderId, orderName, amount, method, sessionId, buyer }) {
    const ediDate = dayjs().format('YYYYMMDDHHmmss');
    const signData = await sha256Hex(ediDate + MID + amount + MERCHANT_KEY);

    const form = buildHiddenForm({
      action: `${API_URL}/payments/nice/return?session=${sessionId}`,
      charset: 'euc-kr',
      fields: {
        MID, Amt: amount, Moid: orderId, GoodsName: orderName,
        EdiDate: ediDate, SignData: signData, PayMethod: method,
        ReturnURL: `${API_URL}/payments/nice/return?session=${sessionId}`,
        BuyerName: buyer.name, BuyerTel: buyer.tel, BuyerEmail: buyer.email,
        // 가상계좌 입금기한: 21시 이후 요청은 PG 기본값, 그 외 3시간
        VbankExpDate: dayjs().hour() >= 21 ? '' : dayjs().add(3, 'hour').format('YYYYMMDDHHmmss'),
      },
    });

    window.nicepaySubmit = () => form.submit();   // 인증 완료 시 PG가 호출
    window.nicepayClose  = () => resetLoading();   // 사용자가 창을 닫았을 때
    window.goPay(form);
  },
};

// 버튼 핸들러 — 여기 한 줄만 pgType을 본다
await requestPay[pgType || 'TOSS'](payload);
```

실제 코드는 2,000줄짜리 페이지 컴포넌트 안에 인라인으로 들어가 있었지만(이건 뒤에서 반성한다), 구조는 위와 같았다. 핵심은 **PG별 차이를 "결제 요청" 함수 안에 가두고, 그 바깥(주문서·배송지·포인트·약관)은 PG를 모르게** 한 것.

## 3. 결과 페이지는 PG를 모르게, 서버가 파라미터를 통일

결과 수신 경로도 두 PG가 완전히 달랐다.

- **Toss**: PG → 프론트 성공 라우트 → (프론트가 `orderId`, `paymentKey`, `amount`를 붙여) 백엔드 승인 API로 리다이렉트
- **NicePay**: PG → 백엔드 `returnURL`로 직접 POST

그래서 백엔드와 합의한 건 "어느 PG든 승인이 끝나면 **똑같은 쿼리 파라미터**로 프론트 결과 페이지에 보내달라"는 것이었다.

```
/pay/result?session=...&orderId=...&orderNumber=...
  &bank=...&accountNumber=...&depositor=...&dueDate=...   // 가상계좌일 때
  &failMessage=...                                        // 실패일 때
```

프론트의 결과 페이지는 이 파라미터만 읽는다. `pgType`이 남긴 분기는 가상계좌 예금주 표시 한 줄뿐이었다(Toss는 법인명 고정, NicePay는 서버가 내려준 값). Toss 시절의 성공 라우트도 그대로 살려둬서, `TOSS`인 몰은 예전 경로로 아무 변화 없이 흘러간다.

## 삽질 기록

**NicePay JS SDK로 먼저 붙였다가 폼 방식으로 갈아탐.** 처음엔 최신 JS SDK(`AUTHNICE.requestPay`)로 붙였다. 코드도 짧고 Toss와 비슷해서 좋았다. 그런데 계약상 써야 하는 연동 모듈이 서버 인증(폼 POST + `SignData` 서명) 방식으로 정해져 있었고, 가상계좌 입금기한도 신형 SDK는 시간 단위 정수(`vbankValidHours`)만 받아서 21시 마감 규칙을 정확히 맞출 수 없었다. 결국 `pg-web` 폼 방식으로 갈아탔고, 그 과정에서 `test nicepay` 커밋이 열 개 넘게 쌓였다. 계약서와 백엔드 승인 방식을 먼저 확인하고 SDK를 골랐어야 했다.

**MerchantKey 하드코딩.** 개발 서버에서 급하게 테스트하느라 서명용 키를 코드에 박아놓고 커밋했다가, 뒤늦게 `.env`로 옮기고 키를 바꿨다. 결제 키는 처음부터 환경변수로.

**EUC-KR.** NicePay 폼은 `acceptCharset`을 `euc-kr`로 줘야 상품명(`GoodsName`)이 깨지지 않는다. 상품명 100자 제한은 Toss 때부터 그대로 가져갔다.

**가상계좌 입금기한.** 기본은 "요청 시각 + 3시간"으로 넣었는데, NicePay 가상계좌는 21시까지만 받는다. 21시 이후 요청에 +3시간을 넣으면 그날 마감을 넘겨버려서, 21시 이후엔 값을 비워 PG 기본값에 맡기는 규칙을 넣었다.

**`crypto.subtle`은 어디서나 되는 게 아니다.** `SignData`용 SHA-256을 처음엔 Web Crypto API(`crypto.subtle.digest`)로 만들었다. 나중에 쇼핑몰을 앱 웹뷰에 넣는 작업을 하다가 결제가 막혀서 `crypto-js`로 바꾸는 핫픽스를 냈다. `crypto.subtle`은 secure context(HTTPS/localhost)에서만 존재하기 때문에, 그 조건을 못 타는 환경에서는 서명 생성부터 터진다. 결제 경로는 E2E 테스트 한 줄이라도 있었어야 했다.

## 결과

- **4월 초**: `pgType` 필드 추가, NicePay 스크립트 로드, 분기 골격 (Toss 몰은 영향 없음)
- **5~6월**: 개발 서버에서 NicePay 결제 반복 테스트, 폼 방식으로 전환
- **6월 중순**: 분기 정리 후 양쪽 SDK를 모두 활성화한 상태로 운영 배포
- **6월 말**: 운영에서 테스트 몰 실결제 확인 → 몰별로 `pgType` 순차 전환

양쪽이 켜진 상태로 배포한 뒤로는 몰의 전환은 전부 백엔드 값 변경으로 끝났다. 프론트 재배포도, 결제 중단도 없었다.

잘한 건 세 가지다. 전환 스위치를 데이터로 뺀 것, PG별 차이를 결제 요청 함수 하나에 가둔 것, 결과 페이지 파라미터를 서버와 통일해서 프론트가 PG를 모르게 한 것. 이 덕분에 "배포 = 전환"이 아니라 "배포 후 몰별 전환"이 가능했다.

아쉬운 건 분기 로직이 페이지 컴포넌트 안에 인라인으로 들어가 있었다는 것. 지금 다시 한다면 `payments/toss.ts`, `payments/nice.ts`로 어댑터를 파일 단위로 분리하고, 결제수단 값도 내부 표준 코드(`CARD`)로 통일한 뒤 PG별 매핑을 어댑터 안에서 하겠다. 그리고 결제 성공 경로만이라도 E2E 테스트를 걸어뒀을 것이다.

PG 전환은 SDK 교체가 아니라, "결제 요청 / 결과 수신 / 결제수단 / 결과 화면" 네 경계를 어디에 세울지 정하는 일이었다.
