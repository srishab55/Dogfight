# TASK: COMPLETE UI/UX REDESIGN — 3D MULTIPLAYER AERIAL COMBAT GAME

## ROLE

Act as a Senior Game UI/UX Designer, Design Systems Architect, and Frontend Game Developer.

I have an existing, partially implemented 3D multiplayer aerial combat game built using Babylon.js, TypeScript, and web technologies.

The core game functionality is already under development.

Your task is to comprehensively redesign and polish the entire user interface to give it a premium, modern, realistic military aviation aesthetic.

This is NOT a request to rebuild the game.

This is a UI/UX improvement project.

You must inspect the existing project before making changes.

---

# 1. DESIGN VISION

The game should feel like a modern military aviation combat simulator.

Take visual inspiration from:
- Modern military flight simulators.
- Tactical command and control interfaces.
- Premium aviation instrumentation.
- Modern AAA multiplayer game menus.
- Futuristic but believable military dashboards.

The interface should look sophisticated, immersive, clean, and professional.

Avoid:
- Generic gaming templates.
- Excessively rounded cards.
- Cartoonish buttons.
- Oversized text.
- Excessive gradients.
- Rainbow colors.
- Unnecessary glowing borders.
- Excessive glassmorphism.
- Cluttered dashboards.
- Random decorative elements.

The interface should feel functional, not merely decorative.

# 2. DESIGN SYSTEM

Establish a consistent design system and use it across every screen.

### Color palette

Use CSS variables.

Primary background: #101820
Secondary background: #16212B
Panel background: #1B2935
Elevated panel: #243442
Primary accent: #42D9F5
Secondary accent: #F5A623
Friendly team: #428BFF
Enemy team: #F05252
Primary text: #E8EDF2
Secondary text: #91A1AF
Muted text: #647584
Border: rgba(255,255,255,0.10)

Use cyan for active selections, interactive elements, and important instrumentation.

Use amber for warnings, ammunition alerts, and caution states.

Use red for damage, danger, enemy indicators, and critical alerts.

Use blue for friendly team elements.

Do not apply these colors indiscriminately.

### Typography

Use a consistent typography system.

Recommended:
- Headings: Rajdhani or similar condensed technical typography.
- Body: Inter.
- Numerical instrumentation: JetBrains Mono.

Use typography to establish hierarchy.

Large numerical values should be visually distinct from labels.

Examples:
- AIRSPEED
- ALTITUDE
- HULL INTEGRITY
- GUN HEAT
- THROTTLE
- TARGET DISTANCE

### UI components

Standardize:
- Buttons.
- Navigation.
- Tabs.
- Cards.
- Modal windows.
- Progress bars.
- Gauges.
- Tooltips.
- Notifications.
- Dropdowns.
- Toggle switches.
- Selection indicators.

Use consistent spacing, borders, typography, and hover states.

Create reusable components instead of styling every screen independently.

# 3. REDESIGN EVERY GAME SCREEN

Inspect the existing application and identify all screens and UI elements.

Redesign each existing screen while preserving its functionality.

## A. Main menu

Create a cinematic main menu.

Design:
- Full-screen 3D aircraft background.
- Dark gradient overlay for readability.
- Game logo and title.
- Navigation on the left.
- Player profile on the top-right.
- Prominent PLAY button.
- Settings and controls.
- Server status.

The aircraft background should remain visually prominent.

Avoid making the menu look like a generic website.

The primary Play button should be visually dominant.

## B. Multiplayer lobby

Design a modern military matchmaking interface.

Include:
- Create match.
- Join match.
- Room code.
- Player count.
- Team selection.
- Server status.
- Match readiness.
- Player list.

Use a two-column Red vs Blue team layout.

Clearly distinguish friendly and enemy teams.

Show connection status and player readiness.

## C. Aircraft selection screen

This screen should feel like a premium aircraft hangar.

Include:
- Large aircraft 3D preview.
- Aircraft name and class.
- Performance statistics.
- Speed.
- Maneuverability.
- Armor.
- Weapon loadout.
- Bomb capacity.
- Selection indicator.

Use a clear aircraft comparison layout.

When selecting an aircraft, smoothly transition the displayed model and specifications.

Avoid clutter around the aircraft model.

## D. In-game HUD

This is one of the most important screens.

The HUD must be immersive, readable, and professionally designed.

Do not cover the aircraft or unnecessarily obstruct the 3D environment.

Organize the interface into zones.

### Top-left
- Team score.
- Match timer.
- Kill count.
- Team status.

### Top-center
- Radar / minimap.
- Friendly aircraft.
- Enemy aircraft.
- Base positions.
- Base ownership.

### Bottom-left
- Aircraft health.
- Hull integrity percentage.
- Damage warnings.
- Aircraft status.

### Bottom-center
- Airspeed.
- Altitude.
- Throttle.
- Heading.
- Vertical speed.

Use clear numerical values and subtle gauge visualizations.

### Bottom-right
- Machine gun status.
- Gun heat.
- Bomb count.
- Weapon selection.
- Reload status.

### General HUD requirements

- Use translucent dark panels.
- Keep the central screen mostly unobstructed.
- Use cyan instrumentation.
- Use amber caution indicators.
- Use red only for critical warnings.
- Add smooth gauge transitions.
- Use consistent technical labels.
- Make numerical values highly readable.

The HUD should resemble a modern combat aircraft interface without sacrificing gameplay visibility.

## E. Pause menu

Create a compact, premium pause overlay.

Include:
- Resume.
- Settings.
- Controls.
- Audio.
- Return to lobby.
- Exit match.

Use a subtle blurred or darkened game background.

## F. Respawn screen

Include:
- Aircraft selection.
- Spawn base selection.
- Health and damage status.
- Available aircraft.
- Respawn countdown.
- Loadout selection.

Clearly indicate which bases are friendly and available for spawning.

## G. Match results screen

Create a professional after-action report.

Include:
- Victory or defeat.
- Team scores.
- Player kills.
- Deaths.
- Assists.
- Damage dealt.
- Bombing damage.
- Aircraft destroyed.
- Match duration.
- Continue button.

Use a structured military after-action report aesthetic.

## H. Settings screen

Create settings categories:

- Graphics.
- Audio.
- Controls.
- Gameplay.
- Accessibility.

Include:
- Resolution.
- Graphics quality.
- Shadow quality.
- Sound volume.
- Music volume.
- Mouse sensitivity.
- Camera sensitivity.
- Key bindings.
- HUD scale.

Settings must actually update the game where corresponding functionality exists.

Do not create decorative controls that do nothing.

# 4. ANIMATIONS AND INTERACTIONS

Use subtle, purposeful animations.

Examples:
- Smooth screen transitions.
- Button hover transitions.
- Aircraft selection transitions.
- Gauge animations.
- Radar sweep.
- Notification appearance.
- Matchmaking status updates.
- Damage warning pulses.
- Smooth panel opening and closing.

Animations must not affect game performance.

Avoid excessive motion.

Respect reduced-motion preferences.

# 5. RESPONSIVE DESIGN

The interface should work across:
- Desktop.
- Laptop.
- Different aspect ratios.
- Different browser window sizes.

Prioritize desktop gaming.

Ensure HUD elements remain properly positioned when the viewport changes.

Avoid overlapping HUD elements.

The game should remain usable at 1366x768 and 1920x1080.

Do not unnecessarily scale all HUD elements using percentages.

Use sensible constraints and responsive positioning.

# 6. TECHNICAL IMPLEMENTATION REQUIREMENTS

Before editing anything:

1. Inspect the repository.
2. Identify the existing framework and architecture.
3. Locate every existing screen and UI component.
4. Understand how game state is connected to the UI.
5. Identify reusable components.
6. Identify existing CSS and styling conventions.

Then propose an implementation plan.

### Important constraints

- Do not rewrite the game engine.
- Do not modify working aircraft physics.
- Do not modify multiplayer networking.
- Do not break existing game state management.
- Do not replace real game data with dummy data.
- Do not remove working features.
- Do not introduce paid dependencies.
- Do not create duplicate UI components.
- Preserve existing API contracts.
- Use TypeScript types correctly.
- Avoid unnecessary dependencies.

If the current architecture uses Babylon.js GUI, HTML/CSS overlays, or another rendering approach, inspect it and choose the most suitable approach.

Keep complex interface elements in HTML/CSS when appropriate.

Keep 3D world rendering inside Babylon.js.

Use a centralized design token system.

Separate styling from game logic.

Use reusable components.

# 7. CODE QUALITY

Every redesigned component must:
- Have clear responsibilities.
- Use consistent naming.
- Be maintainable.
- Support existing functionality.
- Handle loading states.
- Handle error states.
- Have appropriate hover, active, disabled, and focus states.

Use accessible semantic HTML where possible.

Use keyboard navigation for menus.

Ensure sufficient text contrast.

Avoid hardcoded styling repeated across components.

# 8. PERFORMANCE

The game must remain smooth while the aircraft and environment are being rendered.

Avoid:
- Excessive CSS animations.
- Large blur filters covering the entire screen.
- Excessive DOM updates.
- Unnecessary React or framework re-renders.
- Heavy image backgrounds.
- Expensive effects on every HUD element.

HUD updates should be efficient and should not trigger unnecessary game scene updates.

# 9. IMPLEMENTATION PROCESS

Work in stages.

### Stage 1: Audit