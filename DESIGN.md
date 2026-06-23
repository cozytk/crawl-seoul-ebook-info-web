# Seoul eBook Finder Design System

## 1. Atmosphere & Identity

Seoul eBook Finder is a quiet decision console for readers who want the fastest path to a book. It should feel calm, trustworthy, and operational: first answer whether the book can be read now, then show the supporting evidence. The signature is the availability flow, a six-step catalog slip that turns scattered provider data into clear next actions.

The linked Anthropic frontend-design guidance is interpreted here as a product rule: the page should be subject-specific, not templated. Structure is information, so numbering is justified because the reader evaluates availability in this exact sequence. The aesthetic risk is a restrained library circulation ledger / hold-slip treatment: paper-white surfaces, ink-stamp labels, and a visible status spine on each decision component.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|------|-------|-------|------|-------|
| Surface/primary | `--surface` | `#ffffff` | n/a | Main panels and provider cards |
| Surface/app | `--bg` | `#f5f8fd` | n/a | Page background |
| Surface/soft | `--surface-soft` | `#f7faff` | n/a | Inputs, low-emphasis sections |
| Surface/info | `--blue-soft` | `#eef5ff` | n/a | Loan and information emphasis |
| Surface/flow | n/a | `#fbfdff` | n/a | Six-step judgment board |
| Surface/ink stamp | n/a | `#10233d` | n/a | Decision board mark |
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
| H1 | `clamp(1.5rem, 2.75vw, 2.15rem)` | 800 | 1.18 | 0 | Hero headline |
| H2 | `1.3rem` | 800 | 1.25 | 0 | Decision board title |
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

- Max content width: 1280px.
- Results layout: main content with a 320px side rail on desktop, one column below 1060px.
- Availability flow: 12-column catalog-slip grid on desktop, single-column sequence on mobile.

### Rules

- The six-step decision board appears before detailed provider cards.
- Detailed cards support the board; they should not carry the only important status.
- On mobile, decision cards remain full-width and readable without horizontal scroll.

## 5. Components

### Availability Flow

- **Structure**: `section.availability-flow`, `header.availability-flow__header`, `p.availability-flow__summary`, `ol.availability-flow__list`, and six `li.flow-decision-card` components.
- **Decision anatomy**: `.flow-decision-card__step`, `.flow-decision-card__title`, `.flow-decision-card__answer`, `.flow-decision-card__copy`, `.flow-decision-card__supporting-results`, `.flow-decision-card__action`.
- **Variants**: `good`, `warn`, `bad`, `pending`, `neutral`.
- **Spacing**: `--space-5` board padding, `--space-4` component padding, `--space-3` inter-component gaps.
- **States**: pending while provider search is incomplete; final when all providers complete.
- **Accessibility**: `aria-live="polite"` on the board container; text labels do not rely on color alone.
- **Motion**: no layout animation; links use focus rings and border emphasis only.
- **Signature**: each step is a large catalog slip with a left status spine. Numbering is allowed here because the user must make the decisions in this order.

### Provider Card

- **Structure**: provider header, model tags, action links, grouped book cards.
- **Variants**: connected, failed, has candidate, no candidate.
- **Spacing**: `--space-4` card padding, `--space-3` book gaps.
- **States**: search links have hover and focus-visible states.
- **Accessibility**: provider and book links remain keyboard-focusable.
- **Motion**: hover color shifts only.

### Book Result Card

- **Structure**: cover, title link, large action status, source, evidence text, optional preview.
- **Variants**: borrow, reserve, unavailable, unknown.
- **Spacing**: `--space-3` inner padding, `--space-2` gaps.
- **States**: focus-visible ring on title and preview links.
- **Accessibility**: cover alt text includes the title.
- **Motion**: no motion beyond link hover.
- **Role**: detailed cards are supporting evidence. They should never be the only place where a user can discover the primary action.

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
| Default | `0 14px 34px rgba(23, 47, 84, 0.06)` | Topbar and hero |
| Decision | `0 16px 32px rgba(31, 63, 105, 0.07)` | Decision board cards |

### Rules

- Book cards use background tone to show state, not heavy borders.
- Avoid nested card stacks where possible; the decision board is the primary framed tool.
