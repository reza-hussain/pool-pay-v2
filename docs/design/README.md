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
| 02 Entry | Onboarding, empty Home, Home (pools by role) | Ticket #1 (account) surrounding context; welcome carousel/phone-OTP/profile-setup built (see Known drift); Home dashboard (not yet ticketed) |
| 03 Create | Name + type (Equal Split/Open), set share & goal | Ticket #2 (Create a Pool) |
| 04 Contributing | Pool detail, deposit QR (locked amount), keypad contribute (Open), success, transaction detail | Ticket #4 (Deposit) |
| 05 Ongoing | Open Pool detail, Members list | Ticket #4 (Open Pool variant), general Pool detail |
| 06 Organizer | Invite/Pool Code, organizer action sheet (Lock/Transfer out/Close), destructive confirm | Ticket #3 (Join), #5 (Lock), #6 (Spend, as "Transfer out"), #9 (Closure) |
| 07 Wind-down | Closed receipt, Activity feed, Alerts | Ticket #8 (Ledger), #9 (Closure), #22 (Activity tab), #23 (Alerts tab) |
| 08 Profile | Account & settings | Ticket #24 (Profile tab) |

**Gaps — not designed yet, will need new screens when these tickets are built:** merchant QR-scan-to-pay (ticket #6 — the kit's "Transfer out" is a menu entry, not the scan flow itself), and a full app-wide design system overhaul (deferred, not yet built). Design these in the kit's established visual language when they're picked up, rather than improvising a different style. (The bottom nav bar and its Activity/Alerts/Profile tabs are no longer a gap — the kit's tab bar and all four tab screens are fully mocked in sections 02/07/08, and tickets #21–#24 have since built them.) Also still missing: `CreatePoolScreen` has no "Custom Split Pool" option and no "pay your own share" step — ticket #58's own AC, but PR #65 only shipped the backend. A Custom Split Pool can currently only be created via direct API call, not through the running mobile app; the rest of the Custom Split flow (invite, pay-to-join) was built for ticket #60 assuming a pool already exists.

## Known drift

Ticket #1's login screen was re-skinned to the kit's tokens as part of ticket #2 (with explicit permission to touch ticket #1's UI).

**Onboarding (welcome carousel, phone/OTP, profile setup — 2026-07-10):** built via Stitch rather than added directly to `poolpay-ui-kit.html`. The Stitch design system was derived from this README (same hex ramps, radii, spacing, and the one-pumpkin rule), so the tokens match — but Stitch's own font enum doesn't include Onest, so its preview canvas rendered these screens in Hanken Grotesk. The shipped React Native screens (`WelcomeCarouselScreen`, `SignupLoginScreen`, `ProfileSetupScreen`) use the real `mobile/src/theme/tokens.ts` (true Onest, exact hex values), not the Stitch preview — but `poolpay-ui-kit.html` itself still doesn't include these 3 screens in its rendered set. For exact layout/spacing questions about this flow, treat the shipped RN code as the source of truth, not the HTML kit. If someone adds these to the HTML kit later, this note can be removed.

**Invite by phone / Invitations / Invitation detail (ticket #60, 2026-08-24):** built via Stitch project "Complete App User Experience" (`projects/3891501608534528478`, screens "Invite - Custom Split Pool", "Invitations - Custom Split Pool", "Invitation - Custom Split Pool") rather than added to `poolpay-ui-kit.html`. Same story as Onboarding above: tokens match this README, but the Stitch preview isn't the source of truth — the shipped `InviteByPhoneScreen`, `InvitationsScreen`, and `InvitationScreen` use the real `mobile/src/theme/tokens.ts`. `DepositScreen`, `PoolDetailScreen`, and `OrganizerControlsSheet` were also touched to add `CUSTOM_SPLIT` support (existing screens, not new Stitch-sourced ones). Treat the shipped RN code as the source of truth for this flow, not the HTML kit or the Stitch preview.

**Leave Pool / Remove Member / Transfer Organizer / Spend Approvals (ticket #106, 2026-08-29):** built directly in React Native, not via Stitch or added to `poolpay-ui-kit.html`, unlike the two entries above. These four screens (`LeaveConfirmScreen`, `RemoveMemberScreen`, `TransferOrganizerScreen`, `SpendApprovalsScreen`) are structural analogs of existing screens already in the kit's visual language (`CloseConfirmScreen`'s warn-ring/destructive-confirm pattern, `VoteScreen`'s tally display, `MembersScreen`'s list+row-action, `SpendScreen`'s step-state), not novel layouts — so they were built straight from `mobile/src/theme/tokens.ts` against those existing screens as reference, the same way any other new screen composed from existing patterns would be. Neither the HTML kit nor a Stitch project has a rendering of these four; treat the shipped RN code as the source of truth.
