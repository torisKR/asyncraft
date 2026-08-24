# asyncraft

Node.js/TypeScript용 zero-dependency 비동기 제어 흐름 유틸리티입니다. 재시도와 backoff, timeout, circuit breaker, 동시성 제한·맵, single-flight memoize, debounce, deferred, AbortSignal 조합을 제공합니다.

## 제공 기능

| 상황 | API |
| --- | --- |
| 일시적 실패 재시도 | retry |
| 시간 제한·취소 | withTimeout, timeoutSignal |
| 장애 의존성 차단 | circuitBreaker |
| 동시 실행 제한 | createLimit, asyncMap |
| 중복 호출 공유·캐시 | memoize |
| 빠른 이벤트 묶기 | debounceAsync |
| 외부 resolve/reject Promise | deferred |
| 취소 원인 결합 | anySignal |

TypeScript 타입과 AbortSignal을 지원하며 ESM/CJS 패키지 출력을 제공합니다.

## 설치와 사용

    npm install asyncraft
    # 또는 pnpm add asyncraft / yarn add asyncraft / bun add asyncraft

## 개발

Node.js 18 이상에서 실행합니다.

    npm install
    npm test
    npm run typecheck
    npm run lint
    npm run build
    npm run ci

소스는 src/, 테스트는 tests/, 배포 산출물은 dist/에 있습니다. 런타임 환경변수는 필요하지 않습니다.
