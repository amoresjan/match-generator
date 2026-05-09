---
name: Rally
description: Match generator for casual group sports
colors:
  court-green: "#16a34a"
  court-green-vivid: "#22c55e"
  streak-orange: "#f97316"
  court-navy: "#020817"
  court-dark-card: "#0b111e"
  slate-secondary: "#1e293b"
  clean-slate: "#f1f5f9"
  muted-ink: "#64748b"
  cool-border: "#e2e8f0"
  alert-red: "#ef4444"
typography:
  display:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.01em"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.court-green}"
    textColor: "#fef2f2"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "#15803d"
    textColor: "#fef2f2"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-destructive:
    backgroundColor: "{colors.alert-red}"
    textColor: "#fef2f2"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  chip-you:
    backgroundColor: "#dcfce7"
    textColor: "{colors.court-green}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  chip-neutral:
    backgroundColor: "{colors.clean-slate}"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  card-default:
    backgroundColor: "#ffffff"
    textColor: "{colors.court-navy}"
    rounded: "{rounded.lg}"
    padding: "16px"
---

# Design System: Rally

## 1. Overview

**Creative North Star: "The Group Game Organizer"**

Rally is designed for the moment a player pulls out their phone between points. Two seconds, courtside, with one question: am I up next, and who am I playing? Everything in the interface earns its place by answering that question faster. The design is not here to be admired; it serves one primary act: getting people on the court.

The system's personality is playful, casual, and celebratory — but discipline keeps it from becoming loud. Personality is earned. A streak lands with orange glow and a flame icon. A win pops with a trophy. A new court card slides in. These moments feel good because the rest of the interface stays calm. The Group Game Organizer handles the logistics; the people handle the fun.

What this system rejects: fantasy sports and gambling interfaces with dark-mode neon and aggressive stat density; enterprise SaaS dashboards with cold navy palettes and corporate spacing; fitness tracking apps with progress rings and motivational copy; social media feeds with algorithmic sequencing and reaction mechanics. Rally is a shared tool used together, not a personal performance tracker.

**Key Characteristics:**
- Mobile-first, dense but legible; designed for a 375px phone in direct sunlight
- Sport-adaptive: one CSS variable (`--primary`) makes the whole UI feel native to the chosen sport
- System font stack for instant native feel on every device, zero FOUT
- Restrained animation vocabulary that activates only for meaningful moments
- Flat elevation by default; shadows reserved for floating and blocking surfaces

## 2. Colors: The Court Palette

One saturated color at a time. The primary accent is the only hue on any screen at rest. Orange enters only when someone earns it.

### Primary

- **Court Green** (`#16a34a`, oklch(55% 0.17 145)): The default sport color for pickleball. Applied to primary buttons, the "You" personalization pill, focus rings, and active navigation states. It is the only saturated color on a typical screen.
- **Court Green Vivid** (`#22c55e`, oklch(63% 0.17 145)): Dark-mode variant of court-green, lightened to maintain WCAG AA contrast on dark surfaces.

### Secondary

- **Streak Orange** (`#f97316`, oklch(70% 0.20 42)): Celebratory state color. Appears only on hot-streak indicators — the flame icon, glow animation, and streak-section border. Never used for navigation or primary actions.

### Neutral

- **Court Navy** (`#020817`, oklch(9% 0.02 264)): Darkest surface. Light mode foreground; dark mode page background.
- **Court Dark Card** (`#0b111e`, oklch(13% 0.03 264)): Dark mode card background, one step lighter than Court Navy — the tonal separation that replaces border shadows in dark mode.
- **Slate Secondary** (`#1e293b`, oklch(22% 0.04 264)): Dark mode muted surfaces, secondary UI regions, input backgrounds.
- **Clean Slate** (`#f1f5f9`, oklch(96% 0.008 225)): Light mode muted surface. Secondary UI background behind cards. Slightly blue-cooled to prevent warmth that would fight the green primary.
- **Muted Ink** (`#64748b`, oklch(50% 0.04 240)): Secondary text: labels, metadata, placeholder text, helper text. Never for primary content.
- **Cool Border** (`#e2e8f0`, oklch(93% 0.01 225)): 1px borders on cards, inputs, dividers. Structural, not decorative.
- **Alert Red** (`#ef4444`, oklch(60% 0.23 25)): Destructive actions and error states only.

### Named Rules

**The Sport Skin Rule.** The `--primary` CSS variable is the only color that changes with sport theme. Switch the sport class and the entire interface adapts. Never hardcode a sport hex in component logic; always reference `--primary` so the skin stays coherent.

**The Orange Embargo.** Streak orange is reserved for hot-streak states. It never appears on buttons, navigation, forms, or decorative elements. When you see orange, it means someone has won multiple consecutive matches. That signal is only meaningful because it is rare.

## 3. Typography

**Body/Display Font:** system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif

**Character:** No web fonts. Rally renders in the device's native typeface: SF Pro on iOS and macOS, Roboto on Android, Segoe UI on Windows. The interface feels at home on every platform and loads instantly. Hierarchy is built from weight and size alone — the same face from 12px/medium labels to 20px/bold court numbers.

### Hierarchy

- **Display** (700, 1.25rem/20px, lh 1.2): Round number headers, major court labels, milestone moments. Rarely used.
- **Title** (600, 1rem/16px, lh 1.3): Section headers, prominent player names, tab labels.
- **Body** (400, 0.875rem/14px, lh 1.5): Player lists, match details, the default for most readable content. Primary reading size.
- **Label** (500, 0.75rem/12px, lh 1.2, ls 0.01em): Badges, round metadata, secondary info, timestamps.

### Named Rules

**The System Stack Rule.** Never load a web font for Rally. The native system font is the feature: instant render, no FOUT, culturally native feel on every device. Hierarchy comes from weight contrast, not typeface contrast.

**The Glance Test.** Any screen must communicate its primary piece of information within 2 seconds at arm's length. If it requires reading, the type hierarchy has failed. Increase weight or size of the primary element before adding more text.

## 4. Elevation

Rally is flat by default. Depth is conveyed through two mechanisms: tonal contrast between surface layers (cards slightly lighter than page background in both modes) and 1px Cool Border borders. No ambient shadows rest on cards at their default state.

### Shadow Vocabulary

- **FAB Lift** (`box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)`): Floating Add Player button. The only surface with a persistent resting shadow. It floats above the page and the shadow confirms it.
- **Dialog Lift** (`box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)`): Override Match dialog and any blocking modal. Signals that the surface prevents interaction with everything behind it.
- **Streak Glow** (orange, `box-shadow: 0 0 20px 4px rgba(249,115,22,0.45)`, 2s infinite pulse): Ambient celebratory glow on the hot-streak section border. Not elevation — personality.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Elevation is earned by state change (dialog blocks interaction) or physical separation (FAB floats above page). A shadow on every card collapses the signal value of the real ones.

## 5. Components

### Buttons

Tactile and snappy. Every button responds to press with `transform: scale(0.95)` (150ms ease-out). The interface has physical weight.

- **Shape:** Gently curved (10px radius)
- **Primary:** Court Green fill (`#16a34a`), near-white text (`#fef2f2`), 10px/16px padding
- **Hover:** Darkened green (`#15803d`); no scale change on hover, only on active/press
- **Ghost:** Transparent background, Cool Border border (`#e2e8f0`), Muted Ink text; hover fills with Clean Slate
- **Destructive:** Alert Red fill, same shape and padding as primary

### Chips and Badges

- **"You" pill:** Court Green/15% background tint (`#dcfce7`), Court Green text, 8px radius. The primary personalization marker. Appears inline next to the current player's name wherever it appears.
- **Round badge / count chips:** Clean Slate background, Muted Ink text, 8px radius. Metadata context: court count, round number.
- **Sport badge:** Primary-tinted background reflecting the active sport theme.

### Cards

- **Corner Style:** Gently curved (12px radius, lg)
- **Background:** White (`#ffffff`) in light mode; Court Dark Card (`#0b111e`) in dark mode
- **Shadow Strategy:** None at rest. Tonal separation from page background is sufficient.
- **Border:** 1px Cool Border (`#e2e8f0`) in light; 1px Slate Secondary (`#1e293b`) in dark
- **Internal Padding:** 16px standard; 12px for compact content regions

### CourtCard (Signature Component)

The most distinctive component in the system. Two teams displayed head-to-head with a "vs" divider; the entire card is glanceable from across the room.

- **Current player's team:** Highlighted with a 2px primary-color ring (`ring-2 ring-primary`) and a primary-tinted border. Personal relevance is visible without reading.
- **Winner state:** Green-100 background, Trophy icon in court-green. Confirmed by icon and color together.
- **Streak player:** Orange Flame icon with 2s infinite streak-glow (orange box-shadow pulse). Never just color alone.
- **Interactive:** Edit button (pencil icon) appears for admin users. `active:scale-95` on team buttons for tactile feedback.

### Inputs

Standard stroke-bordered fields. Border: Cool Border (`#e2e8f0`) at rest, darkened on hover. Focus: 2px primary ring (`ring-2 ring-primary`), no background change. Background: white (light) or Slate Secondary (dark). Radius: 10px (md). Disabled: reduced opacity (50%), no pointer events.

### Navigation

Sticky header: white (light) / Court Dark Card (dark) background, 1px Cool Border bottom edge. Contains app title and admin action zone. Tab bar beneath: four tabs (Round, Players, History, Settings). Active tab uses primary color label and underline indicator. Tab transitions use `tab-slide-left` / `tab-slide-right` (0.22s ease-out) so the direction of navigation is physically legible.

### FAB (Floating Action Button)

Fixed at bottom-right (bottom: 24px, right: 16px). Primary fill (Court Green), white icon (plus or relevant action icon), 16px radius. FAB Lift shadow at rest. The only always-floating control; reserved for the most frequent host action (add player).

## 6. Do's and Don'ts

### Do

- **Do** reference `--primary` for all sport-branded colors. Never hardcode a sport hex in component logic; the Sport Skin Rule depends on this.
- **Do** animate only on meaningful state changes: round commits (`card-enter`, 0.35s), win confirmation (`winner-pop`, 0.25s), streak detection (`streak-glow`, 2s infinite), partner formation (`duo-form`, 0.4s). Ambient effects run slow; feedback runs fast.
- **Do** pair every color state with an icon or label. Streak orange with the Flame icon. Winner green with the Trophy icon. Color is never the sole signal.
- **Do** apply `active:scale-95` to every interactive button and court card team. The tactile press idiom is system-wide.
- **Do** treat the "You" pill as the primary personalization signal. It appears wherever the current player's name appears, in every tab.
- **Do** use tonal contrast (card background vs. page background) as the primary elevation signal before reaching for borders or shadows.
- **Do** ensure every sport theme variant (tennis, badminton, ping pong, padel) maintains WCAG AA contrast on both light and dark backgrounds before shipping.

### Don't

- **Don't** use dark-mode neon accents, aggressive stat-density layouts, or high-pressure visual patterns. Rally is not a fantasy sports or gambling product.
- **Don't** use cold navy as a brand palette, corporate typefaces, or data-table-first layouts. Enterprise SaaS dashboard aesthetics are explicitly out of scope.
- **Don't** add progress rings, metric overload, or motivational copy. Fitness tracking app patterns conflict with Rally's casual personality.
- **Don't** introduce social feed mechanics: no infinite scroll, algorithmic ordering, reaction counts, or notification badges on content.
- **Don't** add resting shadows to cards. The Flat-By-Default Rule protects the signal value of the two real shadow levels (FAB, Dialog). Every extra shadow is debt.
- **Don't** use `border-left` or `border-right` greater than 1px as colored accent stripes on list items, callouts, or cards.
- **Don't** use gradient text (`background-clip: text`). Use weight or size for emphasis. Streak orange on the Flame icon is sufficient; no gradient needed.
- **Don't** introduce a new color for a one-off state. Every new visual state must map to an existing role (court-green, streak-orange, alert-red) or the role must be formally added here.
