# Seoul eBook Finder Design System

## 1. Atmosphere & Identity

Seoul eBook Finder is a quiet decision console for readers who want the fastest path to a book. It should feel calm, trustworthy, and operational: first answer whether the book can be read now, then show the supporting evidence. The signature is the book routing page: a search command surface, a provider dock, one dominant decision runway, and a supporting library ledger.

The linked Anthropic frontend-design guidance is interpreted here as a product rule: the page should be subject-specific, not templated. Structure is information, so numbering is justified because the reader evaluates availability in this exact sequence. The aesthetic risk is a restrained catalog drawer / circulation desk / hold-slip treatment: paper-white surfaces, ink-stamp labels, and docket-style hierarchy. Do not use a colored left rail or generic dashboard cards; availability must be communicated by answer text, hierarchy, and supporting evidence, not color alone.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|------|-------|-------|------|-------|
| Surface/primary | `--surface` | `#ffffff` | n/a | Main panels and provider cards |
| Surface/app | `--bg` | `#f5f8fd` | n/a | Page background |
| Surface/soft | `--surface-soft` | `#f7faff` | n/a | Inputs, low-emphasis sections |
| Surface/info | `--blue-soft` | `#eef5ff` | n/a | Loan and information emphasis |
| Surface/decision | `--paper` | `#fffaf0` | n/a | Decision runway and ledger panels |
| Surface/ink stamp | n/a | `#10233d` | n/a | Docket action and stamp labels |
| Text/primary | `--ink` | `#12151b` | n/a | Primary text |
| Text/secondary | `--ink-sub` | `#56667a` | n/a | Metadata and explanations |
| Text/muted | `--muted` | `#7f8ea6` | n/a | Secondary labels |
| Border/default | `--line` | `#deebfa` | n/a | Panel outlines |
| Border/subtle | `--line-soft` | `#e7effa` | n/a | Softer nested boundaries |
| Accent/primary | `--blue` | `#2f7ce8` | n/a | Links and focus |
| Accent/strong | `--blue-strong` | `#1d5cb6` | n/a | Strong blue labels |
| Accent/action | `--orange` | `#ff7a1a` | n/a | Primary search action |
| Accent/action-hover | `--orange-hover` | `#eb6d0d` | n/a | Search hover |
| Status/success | `--ok` | `#255f9c` | n/a | Direct read or borrow availability |
| Status/warning | `--warn` | `#9a6b2f` | n/a | Reservation and waiting states |
| Status/error | `--danger` | `#c94a4a` | n/a | Errors and unavailable states |

### Rules

- Blue means the user can read or borrow now.
- Amber means the next action is reservation or waiting.
- Gray means no actionable result or still analyzing.
- Orange is reserved for the search button only.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| H1 | `clamp(1.5rem, 2.75vw, 2.15rem)` | 800 | 1.18 | 0 | Command headline |
| H2 | `1.3rem` | 800 | 1.25 | 0 | Decision runway title |
| H3 | `1rem` | 800 | 1.3 | 0 | Provider headings |
| Body | `0.96rem` | 400 | 1.5 | 0 | Main helper text |
| Body/sm | `0.84rem` | 500 | 1.45 | 0 | Metadata and details |
| Caption | `0.72rem` | 700 | 1.3 | 0 | Pills and labels |

### Font Stack

- Primary: `"Pretendard Variable", "Pretendard", "SUIT", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`
- Mono: system monospace only for future numeric tables if needed.

### Rules

- Body text stays at or above 14px equivalent.
- Decision outcomes use larger type than provider metadata.
- Korean text uses normal letter spacing.

## 4. Spacing & Layout

### Base Unit

All spacing derives from a 4px base.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | `4px` | Tight inline gaps |
| `--space-2` | `8px` | Compact card gaps |
| `--space-3` | `12px` | Control padding |
| `--space-4` | `16px` | Standard card padding |
| `--space-5` | `20px` | Section padding |
| `--space-6` | `24px` | Generous panel padding |
| `--space-8` | `32px` | Major group separation |

### Grid

- Max content width: 1440px.
- Results layout: one primary work surface plus one provider dock; no right-side guide rail in the visible result area.
- Book routing app: `main.book-routing-app[data-no-left-rails="true"]` contains `header.routing-command`, `aside.provider-dock`, and `section.decision-workspace`.
- Decision runway: one dominant answer ticket plus a single ledger route list on desktop/tablet, collapsing each route row into a stacked card on mobile.

### Rules

- The decision workspace appears before the provider dock in the DOM, so mobile readers see the answer before setup details.
- The library ledger supports the runway; detailed records should not carry the only important status.
- On mobile, route steps remain full-width and readable without horizontal scroll.

## 5. Components

### Book Routing App

- **Structure**: `main.book-routing-app[data-no-left-rails="true"]`, `header.routing-command`, `aside.provider-dock`, `section.decision-workspace`, `section.decision-runway`, and `section.library-ledger`.
- **Command anatomy**: `.routing-command__brand`, `.routing-command__search`, `.routing-command__field`, and `.routing-command__meta`.
- **Provider anatomy**: `.provider-dock`, `.supported-list`, `.library-chip`, `.ledger-provider`, `.ledger-provider__tags`, and `.ledger-provider__signal`.
- **Workspace anatomy**: `.decision-workspace` owns the route verdict and detailed records.
- **Accessibility**: search is keyboard-first; dynamic regions use polite live updates and visible focus states.
- **Signature**: the page reads like a circulation command table, not a marketing splash and not a stack of tiny cards.

### Decision Runway

- **Structure**: `section.decision-runway`, `header.decision-runway__header`, `p.decision-runway__eyebrow`, `h4#decision-runway-title.decision-runway__title`, `p.decision-runway__summary`, one `article.answer-ticket`, and six `li.decision-route` route decisions.
- **Answer anatomy**: `.answer-ticket__label`, `.answer-ticket__route`, `.answer-ticket__answer`, `.answer-ticket__sentence`, `.answer-ticket__evidence`, `.answer-ticket__action`.
- **Route anatomy**: `.decision-route__number`, `.decision-route__title`, `.decision-route__answer`, `.decision-route__copy`, `.decision-route__evidence`, `.decision-route__action`.
- **Variants**: `good`, `warn`, `bad`, `pending`, `neutral`.
- **Spacing**: `--space-5` runway padding, `--space-4` docket padding, `--space-3` inter-route gaps.
- **States**: pending while provider search is incomplete; final when all providers complete.
- **Accessibility**: `aria-live="polite"` on the runway container; text labels do not rely on color alone.
- **Motion**: no layout animation; links use focus rings and border emphasis only.
- **Signature**: the top answer ticket owns the answer; the six decision routes are a compact evidence map. Numbering is allowed here because the user must make the decisions in this order.

### Provider Card

- **Structure**: provider header, model tags, action links, grouped book cards.
- **Variants**: connected, failed, has candidate, no candidate.
- **Spacing**: `--space-4` card padding, `--space-3` book gaps.
- **States**: search links have hover and focus-visible states.
- **Accessibility**: provider and book links remain keyboard-focusable.
- **Motion**: hover color shifts only.

### Library Ledger

- **Structure**: `section.library-ledger`, provider-level `.library-ledger__provider`, repeated `.catalog-record`, and `.catalog-record__status`.
- **Role**: proves why the decision runway reached its answer. It is supporting evidence after the verdict, not a competing dashboard.
- **Bans**: no `border-left-width`, no `border-left-color`, no colored left rail, no status rail, and no color-alone status encoding.

### Book Result Card

- **Structure**: cover, title link, large action status, source, evidence text, optional preview.
- **Variants**: borrow, reserve, unavailable, unknown.
- **Spacing**: `--space-3` inner padding, `--space-2` gaps.
- **States**: focus-visible ring on title and preview links.
- **Accessibility**: cover alt text includes the title.
- **Motion**: no motion beyond link hover.
- **Role**: detailed cards are supporting evidence. They should never be the only place where a user can discover the primary action, and they must not use colored left rails as the main status cue.

## 6. Motion & Interaction

### Timing

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150ms | ease-out | Button and link hover |
| Standard | 200ms | ease-in-out | Input focus and card hover |

### Rules

- Animate only color, opacity, and transform.
- Every interactive element has hover and focus-visible feedback.
- Respect reduced motion by keeping essential UI static.

## 7. Depth & Surface

### Strategy

Mixed: soft borders plus very light tinted shadows for page-level panels; nested result cards use tonal background shifts.

| Level | Value | Usage |
|-------|-------|-------|
| Subtle | `0 10px 24px rgba(24, 45, 78, 0.04)` | Provider and guide cards |
| Default | `0 14px 34px rgba(23, 47, 84, 0.06)` | Command and dock panels |
| Decision | `0 16px 32px rgba(31, 63, 105, 0.07)` | Decision runway panels |

### Rules

- Book cards use background tone to show state, not heavy borders.
- Avoid nested card stacks where possible; the decision runway is the primary framed tool.
