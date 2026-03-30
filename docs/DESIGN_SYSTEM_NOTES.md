# CampusWay Design System Notes

## Source of Truth

The current design source of truth is the existing theme/token and shared component system inside `frontend/`.

Do not introduce a second design system during bootstrap.

## Tooling Decisions

- Keep Tailwind CSS as the styling foundation.
- Keep lucide-react as the active icon set.
- Keep Playwright screenshot baselines for visual regression readiness.
- Defer Storybook until component isolation is stable enough to justify it.
- Defer Chromatic until Storybook actually exists.
- Keep Figma MCP optional and documented, not hard-wired into the repo.

## Reusable UI Inventory To Keep Consistent

- university cards
- subscription plan cards
- admin dashboard widgets
- contact/support cards
- campaign forms
- status chips
- tables
- drawers
- filters/search bars

## Responsive Acceptance Rules

Every critical surface should remain usable at:
- 320
- 360
- 375
- 390
- 414
- 768
- 820
- 1024
- 1280
- 1440

## Theme Acceptance Rules

Every critical surface should work in:
- light
- dark

Watch for:
- unreadable text
- wrong icon contrast
- broken borders/shadows
- hidden content in one theme only
- horizontal overflow

## Practical UI Rules

- Prefer semantic token usage over hardcoded raw colors.
- Preserve the current visual language instead of adding a second styling framework.
- Avoid decorative complexity that harms admin or student usability.
- Keep tables and dense admin views readable before making them flashy.
- Use a small number of meaningful screenshot baselines rather than a noisy visual test sprawl.
