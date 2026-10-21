# Minhas Finanças — visual rebuild

User request: the previous interface looked generic; make the financial organization app beautiful, drawing from the Taste website references. Existing Supabase project and financial data must survive. Audience: individuals on desktop and mobile. Scope assumed: existing application, not a separate public marketing site.

MODE: Operate. Code-led application design; the user's image-first default applies to presentation sites, not app screens.

WORLD: Taste's pastel-consumer direction, selected for individual monthly finances. Light #f3f5f7 ground, white list surfaces, self-hosted Manrope, blue primary action, pale blue balance, pale sage income and pale sand spending. No gradients, glows or decorative raster images. Design reference: https://www.tasteskill.dev/ and its Aven finance presentation; the presentation's landscape treatment is not copied into working screens. Local reference `.taste-skill/references/aven.webp` is for research only and excluded from production.

FIRST VIEWPORT: desktop sidebar with product mark/name and labeled navigation; heading and month control; balance and financial summary; distribution card and monthly bills on the left, transaction history on the right. Mobile becomes a full-width stack with bottom navigation and reachable entry action. The first screen must clearly differ from the old dark blue Fluent layout.

SIGNATURE: "Cada real, um destino" is a horizontal allocation of actual recurring commitments, variable spending and unreserved income. Values reconcile to monthly income; a deficit is named rather than drawing negative or fictional segments. No invented KPIs, account balances, growth percentages, reviews or customer claims.

STATES: pending, overdue, due today, paid/undo, empty transactions, filtered-empty history, password recovery and expired links; dialog focus, keyboard, short visual viewport, long names and large amounts remain functional.

REACH: entry, signup/recovery, onboarding, dashboard, reports, settings, entry modal, install theme, local font, offline assets. Preserve user IDs, auth flow, account-scoped data, synchronization, validation and financial calculations.

FINISH: visually inspect desktop/tablet/mobile, security and browser tests, independent finish review, document actual tokens in DESIGN.md and .impeccable/design.json, rebuild the public artifact. No deployment or push is authorized in this task.
