# Seoul Book Route OS Design System

## Intent

This page is a decision surface for readers, not a catalog card stack. The first viewport must answer one question loudly: can this book be read, borrowed, or reserved now? Detailed records exist only as evidence after the route verdict.

The current design follows the UI UX Pro Max recommendation for an accessible public-service interface: high contrast, Korean-readable typography, keyboard navigation, visible focus states, and 375/768/1280px responsive verification.

## Information Flow

The route verdict is always evaluated in this order:

1. 밀리의서재에서 바로 보기
2. 대출형 전자도서관에서 빌리기
3. 구독형 도서관에서 열람하기
4. 은평구 공공도서관 직접 대출
5. 은평구 공공도서관 직접 예약
6. 어느 도서관이든 예약하기

## Visual Model

- `availability-os`: page shell.
- `query-strip`: search command and system status.
- `signal-stage`: the main result region.
- `route-panel`: the route verdict surface.
- `primary-signal`: the dominant answer, with large status text.
- `path-grid` and `path-cell`: the six-step route matrix.
- `evidence-feed`, `source-block`, and `copy-line`: supporting provider and book evidence.
- `source-index`: compact provider inventory.

## Palette

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| App background | `--bg` | `#f5f7fb` | Page canvas |
| Surface | `--surface` | `#ffffff` | Main UI surfaces |
| Strong surface | `--surface-strong` | `#0f172a` | Primary signal |
| Primary text | `--ink` | `#020617` | Main copy |
| Muted text | `--ink-soft` | `#475569` | Metadata |
| Action | `--blue` | `#0369a1` | Search and links |
| Read/borrow | `--green` | `#166534` | Immediate availability |
| Reserve | `--amber` | `#a16207` | Reservation/waiting |
| Unavailable/error | `--red` | `#b42318` | Unavailable and errors |

Color is never the only status indicator. Every state has explicit Korean text.

## Typography

- Font stack: `"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif`.
- No negative letter spacing.
- No viewport-scaling body text.
- Primary verdict text is large, but uses normal Korean line breaking and must not wrap into one-character vertical columns.

## Layout Rules

- The page starts with the usable search experience, not a marketing hero.
- The primary answer occupies a large dark signal block inside `route-panel`.
- The six decision steps are a 3x2 matrix on desktop, 2 columns on tablet, and 1 column on mobile.
- Detailed book records are rows, not nested decorative cards.
- The provider inventory can sit beside the main result on desktop but moves after the route verdict on narrower screens.
- No colored left rails, no Bootstrap-style card decks, no beige paper theme, no nested card stacks.

## Accessibility Rules

- Dynamic result regions use polite live updates.
- The search input has an explicit label and visible focus ring.
- A skip link jumps directly to the route verdict.
- Touch targets are at least 40px high, with the primary search button at least 52px.
- Motion is limited to color and shadow transitions and respects `prefers-reduced-motion`.

## Regression Expectations

The UI regression test must verify:

- The new shell classes are visible: `availability-os`, `query-strip`, `route-panel`, `primary-signal`, `path-cell`, `evidence-feed`.
- The old UI vocabulary is absent from the rendered page.
- Millie unavailable links are displayed as not viewable.
- Seoul subscription details are displayed as directly readable.
- Eunpyeong New Town `상호대차진행자료` with zero reservations is displayed as reservable.
