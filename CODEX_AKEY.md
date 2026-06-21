# CODEX_AKEY.md - Akey Change Notes

This file records important owner-facing changes for DotDay. It is kept separate
from source comments and commit history so future collaborators can quickly see
what changed, why it changed, and which files were touched.

## Purpose

- Keep a concise log of important DotDay updates.
- Record the reason behind product and behavior changes.
- Help future maintainers understand user-facing decisions.

## Change Log

| Date | Operator | Files | Change | Reason |
|------|----------|-------|--------|--------|
| 2026-06-21 | Codex | `.gitignore`, local AppData | Cleared current and legacy local DotDay JSON data and added explicit user-data ignore rules before release. | Gives the owner a clean restart and helps ensure repository clones and release users always begin with an empty local dataset. |
| 2026-06-21 | Codex | `src/shared/types.ts`, `src/main/index.ts`, `src/renderer/src/main.tsx` | Persisted the collapsed widget position across restarts and added a Launch at startup setting backed by Electron login item settings. | Keeps the desktop companion where the user placed it and optionally makes it available immediately after sign-in. |
| 2026-06-21 | Codex | `src/main/index.ts`, `src/renderer/src/main.tsx`, `src/renderer/src/styles.css` | Restored reminder lead time to a 1-180 minute slider and narrowed the expanded window from 420 px to 404 px while keeping the collapsed size unchanged. | Fixes reminder values being clamped to 30 minutes and makes the full view slightly more compact without restructuring its horizontal layout. |
| 2026-06-19 | Codex | `src/renderer/src/main.tsx`, `src/renderer/src/styles.css` | Replaced habit up/down ordering controls with drag-to-reorder handles and changed reminder time inputs to editable draft fields that save on blur/Enter. | Makes habit ordering more natural and prevents hour/minute reminder inputs from snapping back while users type. |
| 2026-06-19 | Codex | `src/renderer/src/main.tsx`, `src/renderer/src/components/InsightsPanel.tsx`, `src/renderer/src/utils/analytics.ts`, `src/renderer/src/styles.css` | Added manual habit ordering, changed reminder lead time settings from a slider to hour/minute inputs, and added selectable per-habit historical completion analytics in Insights. | Gives users more control over daily habit display, more precise reminder timing, and better long-term habit review. |
| 2026-06-18 | Codex | `src/renderer/src/utils/analytics.ts`, `src/renderer/src/components/InsightsPanel.tsx`, `src/renderer/src/main.tsx`, `src/renderer/src/styles.css` | Refined Insights by excluding future dates from habit averages and charts, renamed weekly metric to This week average, redesigned the Insights rail as a left-attached half-pill, and added streak prompts to compact and home views. | Keeps analytics accurate in the current week/month and makes streak motivation visible without opening Insights. |
| 2026-06-18 | Codex | `src/renderer/src/components/InsightsPanel.tsx`, `src/renderer/src/utils/analytics.ts`, `src/renderer/src/main.tsx`, `src/renderer/src/styles.css`, `package.json`, `package-lock.json` | Added a Calendar Insights drawer with weekly habit bars, monthly completion trend, metric cards, and isolated analytics calculations powered by Recharts. | Gives DotDay a lightweight personal progress review without disrupting the existing month calendar and daily detail layout. |
| 2026-06-17 | Codex | `src/main/index.ts`, `src/preload/index.ts`, `src/shared/types.ts`, `src/renderer/src/main.tsx`, `src/renderer/src/styles.css`, `package.json`, `resources/icon.*` | Added event editing, note editing, a compact settings panel, and a custom DotDay application icon; removed the JSON backup buttons/API. | Keeps the top bar focused while giving users control over widget opacity, reminder lead time, and blur-to-collapse behavior. |
| 2026-06-17 | Codex | `src/renderer/src/styles.css`, `CODEX_AKEY.md` | Reworked the collapsed reminder animation from a subtle shadow change into a visible breathing-light effect with an internal orange glow layer and pulsing progress ring. | Makes pre-event reminders visually obvious in translucent widget mode. |
| 2026-06-17 | Codex | `src/renderer/src/main.tsx`, `src/renderer/src/styles.css`, `CODEX_AKEY.md` | Strengthened event reminders by refreshing system time every 5 seconds, adding a clearer collapsed-widget reminder state, and showing the upcoming event more visibly. | Makes the 5-minute pre-event reminder reliable and noticeable without using disruptive system notifications. |
| 2026-06-17 | Codex | `src/renderer/src/main.tsx`, `src/renderer/src/styles.css` | Added event form validation for past dates, past same-day start times, missing start times before end times, and end times that are not later than start times. | Prevents invalid or already-expired events from being created accidentally. |
| 2026-06-17 | Codex | `src/renderer/src/main.tsx`, `src/renderer/src/styles.css` | Changed calendar event indicators from date dots to a short underline beneath the date number while preserving habit markers below. | Keeps event and habit status visually distinct in the monthly calendar. |
| 2026-06-17 | Codex | `.github/workflows/release.yml`, `package.json`, `README.md` | Added cross-platform release workflow and macOS packaging configuration. | Enables GitHub Actions to build Windows and macOS release artifacts from version tags. |
| 2026-06-16 | Codex | `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/main.tsx`, `src/renderer/src/styles.css` | Converted DotDay into a draggable translucent desktop widget with collapsed and expanded modes, automatic blur-to-collapse behavior, and remembered collapsed position. | Makes DotDay behave more like a lightweight desktop companion instead of a normal app window. |

## Reminder Behavior

- DotDay checks the current system time every 5 seconds while running.
- If a today's event starts within 5 minutes and has not already been acknowledged,
  the collapsed widget enters a visible reminder state.
- Opening DotDay acknowledges the active reminder and stops the pulse for that event.
- Current design intentionally avoids native system notifications to keep reminders
  quiet and widget-like.

## Packaging Notes

- Windows packages are built with `npm run dist:win`.
- macOS packages are built with `npm run dist:mac` on macOS runners.
- GitHub Actions builds release artifacts automatically when a `v*` tag is pushed.
