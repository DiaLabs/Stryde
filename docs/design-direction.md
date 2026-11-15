# Stryde visual direction

The look is defined by the reference board in `docs/reference-assets/UI.jpeg` (and the overlay
references `team_track.jpeg` and `ball_traj.jpeg`). This file records how we execute it, so every
screen stays consistent. Product scope, flows and states are in `design.md`.

## The look, in one line

A broadcast analyst's workstation: navy chrome, a calm light workspace of white panels, one
green accent, and football footage dressed with broadcast-style tracking graphics.

## Brand

- Logo: `src/app/logo.png` with the tracked `STRYDE` wordmark (`components/brand/Logo.tsx`).
  On dark surfaces the logo is blended with `mix-blend-mode: screen` (its black background drops
  out); on light surfaces it sits in a small navy tile.
- Accent: `brand` `#20C785` for primary actions, active nav, progress and "our team" emphasis.
  Primary buttons are green with navy text; the dashboard "Upload match" may use `brand-deep`.

## Tokens (Tailwind theme in `globals.css`)

| Token | Value | Use |
|---|---|---|
| `navy-950` / `900` / `800` | `#07131D` / `#0D1D2A` / `#162B3B` | Sidebar, landing, video chrome, tooltips |
| `page` | `#F5F7F8` | Workspace background |
| `card` | `#FFFFFF` | Panels |
| `line` / `line-soft` | `#DDE3E7` / `#EAEEF1` | Borders, dividers, empty bar tracks |
| `ink` / `ink-2` | `#17232D` / `#5B6874` | Text / secondary text |
| `brand`, `brand-hover`, `brand-deep`, `brand-soft` | greens | Actions, success, highlights |
| `ok`, `warn`, `danger`, `info` (+ `-bg`) | status | Badges and notices |
| `pitch`, `pitch-2` | `#1D8F55` / `#1A834E` | Pitch drawings |
| `hud` | `#FFD400` | Ball and highlight in overlays |

Type: **Inter** for everything, with **Barlow Condensed** (`font-hud`) only for the broadcast voice
(scorebug, overlay tags, large stat figures). Titles 22–24 px bold, panel titles 15 px semibold,
body 14 px, labels 12–13 px.

Panels: `rounded-xl`, 1 px `line` border, a barely-there shadow (`--shadow-card`), 20 px padding.
Popovers and dialogs use `--shadow-pop`.

## Layout

- App: fixed navy sidebar (240 px) on desktop; on phones a white top bar with a native-dialog
  drawer. Workspace content max 1400 px wide.
- Screens follow the reference panels: dashboard (greeting, KPI tiles, recent matches, team
  overview donut, key insights), upload (drop zone, file row, three trust tiles), processing
  (numbered step list with states + live preview), match overview (video left, match stats right,
  underline tabs), team analysis (possession timeline area chart, possession by third pitches).
- Player analysis and downloadable reports from the reference are out of scope (PRD).

## Broadcast overlays

As in `team_track.jpeg` / `ball_traj.jpeg`: an ellipse ring on the ground under each player in the
team colour, a small number pill above, the ball in `hud` yellow with a dashed trail, a mini-map
inset, and a translucent navy possession panel. Dashed = estimated.

## Rules we keep

- Team identity is never colour alone: a dot plus the team name.
- Estimates are labelled (badge, dashed underline, hatched bar or dashed stroke).
- Visible keyboard focus (green ring), 360 px phone width without horizontal scroll,
  `prefers-reduced-motion` respected.
- Motion: one orchestrated landing hero (scroll-driven); in the app only motion that answers an
  action (thumbnail → video morph, tab crossfade, popovers).
