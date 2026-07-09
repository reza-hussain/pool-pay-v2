# Pool Pay UI Kit — quick reference

The full design system, with live tokens and 21 rendered screens, is [`poolpay-ui-kit.html`](./poolpay-ui-kit.html) — open it in a browser. This file is a lookup-friendly summary of it, kept short on purpose. **Before building or touching any screen, check this file; open the full HTML kit when you need exact values or to see a screen rendered.**

## The one governing rule

**A screen gets at most one pumpkin (orange) action — the thing that moves money.** Everything else on the screen is ink (near-black), outline, or plain text. Selection/active states are also ink, never pumpkin — pumpkin means "money is about to move," so reusing it for selection would be misleading.

## Tokens

**Color** (CSS custom properties in the kit, translate to RN `StyleSheet`/theme constants):
- Ink ramp (text, custody surfaces): `ink-900 #17140C`, `ink-600 #4A4536`, `ink-400 #948E7A`, `ink-200 #D8D4C6`, `ink-100 #EFECE1`
- Pumpkin ramp (the one money-moving action): `pumpkin-600 #CB5622`, `pumpkin-500 #E8692F`, `pumpkin-100 #FAE3D6`
- Flax ramp (ambient warmth, first-run/celebratory moments): `flax-500 #EFD874`, `flax-300 #F6E7A3`, `flax-100 #FBF3D9`
- Semantic: `green-600 #2C8F52` / `green-100 #E3F3E8` (money **in**: deposits, refunds received), `danger-600 #B23A2E` / `danger-100 #F9E3DE` (scoped to the two destructive verbs only, never decoration)
- Surfaces: `cream #FBF7EC` (app canvas), `paper #FFFFFF` (cards lift off cream)

**Typography**: Onest (400/500/600/700/800) for all UI text. Instrument Serif italic exists only in the "Poolpay" wordmark — never anywhere else. Numerals are tabular throughout so amounts align in columns.
- Scale: `figure 32/800` (hero amounts) · `balance 29/800` (balance cards) · `hero 25/800` (marketing moments) · `title 17/800` (screen titles) · `body 13/600–700` (rows, copy, buttons) · `caption 11.5/600` (metadata) · `label 10.5/700 uppercase` (section labels)

**Spacing**: 4pt base — `s1 4, s2 8, s3 12, s4 16, s5 20, s6 24, s7 32, s8 40`. Screen gutter is fixed at 22. Cards pad s4–s5. Gap between cards is s3.

**Alpha/fill tokens** (from the kit's `--line`/`--line-strong` and component-level rules — easy to mistake for ad hoc values if you only check hex colors): `line rgba(23,20,12,0.10)` (hairline dividers), `line-strong rgba(23,20,12,0.20)` (stronger borders, e.g. unselected type-cards), `field-fill rgba(23,20,12,0.045)` (resting input background), `selected-fill rgba(23,20,12,0.03)` (selected type-card background). In `mobile/src/theme/tokens.ts` these are `colors.line`, `colors.lineStrong`, `colors.fieldFill`, `colors.selectedFill` — use the named token, not the raw rgba string.

**Radius**: `sm 10` (small controls) · `md 14` (buttons, fields) · `lg 18` (cards) · `xl 24` (balance card, sheets).

**Shadows**: quiet — `shadow-sm` on cards, `shadow-lg` reserved for sheets/toasts only.

**Icons**: 24 grid, 2pt stroke, round caps/joins, no sharp corners — matches the hand-drawn mascot geometry.

## Component inventory (see kit section 01 for exact states)

Buttons (primary/dark/outline/ghost/danger × lg/default/sm, default/pressed/disabled), fields (rest/focus/error, label stays inside the field), segment control, chips, toggle, type-select cards, status pills, toasts, transaction/member/notification/key-value list rows, pool cards (with progress bar or plain balance), balance card, QR box, 6-digit code display, bottom sheet, keypad, check-ring / warn-ring (success / destructive confirm), avatar (+ stacked avatars for member groups).

## Screen inventory & domain mapping

The kit's 21 screens map closely to our tickets — use them as the target, not just inspiration:

| Kit section | Screens | Maps to |
|---|---|---|
| 02 Entry | Onboarding, empty Home, Home (pools by role) | Ticket #1 (account) surrounding context, Home dashboard (not yet ticketed) |
| 03 Create | Name + type (Equal Split/Open), set share & goal | Ticket #2 (Create a Pool) |
| 04 Contributing | Pool detail, deposit QR (locked amount), keypad contribute (Open), success, transaction detail | Ticket #4 (Deposit) |
| 05 Ongoing | Open Pool detail, Members list | Ticket #4 (Open Pool variant), general Pool detail |
| 06 Organizer | Invite/Pool Code, organizer action sheet (Lock/Transfer out/Close), destructive confirm | Ticket #3 (Join), #5 (Lock), #6 (Spend, as "Transfer out"), #9 (Closure) |
| 07 Wind-down | Closed receipt, Activity feed, Alerts | Ticket #8 (Ledger), #9 (Closure) |
| 08 Profile | Account & settings | Not yet ticketed |

**Gaps — not designed yet, will need new screens when these tickets are built:** the phone/OTP signup-login flow (ticket #1's actual screens), merchant QR-scan-to-pay (ticket #6 — the kit's "Transfer out" is a menu entry, not the scan flow itself), Reimburse-a-Member (ticket #7), the majority-vote emergency refund (ticket #10), Remove-a-Member (ticket #11), tiered KYC/identity verification (ticket #12), and the subscription tier (ticket #13). Design these in the kit's established visual language when their tickets come up, rather than improvising a different style.

## Known drift

None currently. Ticket #1's login screen was re-skinned to the kit's tokens as part of ticket #2 (with explicit permission to touch ticket #1's UI). If a screen drifts from the kit again, note it here with which screen and why, rather than leaving it undocumented.
