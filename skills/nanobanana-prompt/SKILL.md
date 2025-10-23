---
name: nanobanana-prompt
description: A skill that enables Claude to generate direct command-style design prompts by combining Intent, Theme, and Style with layout reference images and asset-agnostic placement patterns.
license: Complete terms in LICENSE.txt
---

# Design Prompt Generation Skill

## Overview
This skill enables Claude to create sophisticated design prompts using direct command style. The prompts blend Intent, Theme, and Style with strategic asset-agnostic placement patterns based on template whitespace structure.

## Core Concepts

### Three Key Parameters

1. **Style** = Overall aesthetic tone and mood
   - Role: Defines overall tone, texture, color logic, typography system, effects
   - Controls: Typography, color system, texture, effects, overall feel
   - Weight: Constant foundation across all designs

2. **Theme** = Seasonal/event-based content and decorations
   - Role: Provides ALL decorative elements, motifs, and visual content
   - Controls: Decorative elements, seasonal accents, event-specific visuals, icons, objects
   - Weight: Variable based on Intent

3. **Intent** = Layout density and information hierarchy
   - Role: Determines information structure and decorative density level
   - Controls: Overall design weight, decorative element quantity, emphasis level
   - Weight: Dictates Theme application intensity

### Dynamic Weight Adjustment

Claude must adjust Theme application density based on Intent:

- **Intent: "CV Letter"** → Theme density ↓↓ (sparse - decorations occupy <15% of available whitespace)
- **Intent: "Coupon Promo"** → Theme density ↔ (moderate - decorations occupy 25-40% of available whitespace)
- **Intent: "Social Countdown"** → Theme density ↑↑ (rich - decorations occupy 45-65% of available whitespace)

**Density Calculation Logic:**
- Measure total available whitespace (areas without text or structural elements)
- Calculate cumulative visual footprint of all decorative elements
- Adjust element quantity and scale to achieve target density percentage
- Density includes both element count AND individual element scale/opacity


## Asset-Agnostic Placement Pattern System

**CRITICAL PRINCIPLE**: Placement patterns describe WHERE and HOW to distribute decorative elements based on whitespace structure, NOT WHAT specific objects to place. Theme determines content; patterns determine spatial distribution logic.

Claude must analyze the template's whitespace structure and apply appropriate spatial distribution rules. This ensures decorations complement the layout naturally regardless of what Theme-specific objects are used.

### Whitespace Structure Categories

#### 🧭 ① Top Space Heavy
**Characteristics**: Header area is wide, bottom information is dense
**Goal**: Visually balance the top without overwhelming lower content

**Spatial Distribution Rules:**

**1. Diagonal Flow Placement**
- Primary zone: Top-left to mid-right diagonal corridor
- Distribution: 2-4 elements flowing along diagonal axis
- Spacing: Progressive diminishing (larger → smaller as flow descends)
- Rotation variance: 5-15° aligned with flow direction

**2. Corner Halo Positioning**
- Primary zone: Top-left and top-right corners (outer 15-20% of width)
- Distribution: 1-2 subtle accent elements per corner
- Scale: 60-80% of standard element size
- Opacity: 70-90% for softness

**3. Top Edge Distribution**
- Primary zone: Upper 20% horizontal band across full width
- Distribution: 3-5 elements evenly spaced along horizontal axis
- Alignment: Float above or along top frame edge
- Scale variance: Alternate between 80-100%

**4. Header Framing**
- Primary zone: Immediate periphery of title/header area
- Distribution: 2-3 elements bracketing text on left and right
- Clearance: Minimum 12-15px from text
- Purpose: Create visual emphasis without crowding

**5. Gradient Zone Accent**
- Primary zone: Top 30% with concentration fade toward middle
- Distribution: 4-6 elements with decreasing density downward
- Opacity gradient: 90% at top → 40% at transition zone

---

#### 🏔 ② Bottom Space Heavy
**Characteristics**: Main info is centered-to-top, bottom area is empty
**Goal**: Ground the composition and add visual weight below

**Spatial Distribution Rules:**

**1. Stacked Base Positioning**
- Primary zone: Bottom 25% in horizontal layers
- Distribution: 3-5 elements in 2-3 horizontal rows
- Layer logic: Larger elements in lowest layer, progressively smaller above
- Alignment: Center-weighted with slight asymmetric offset

**2. Foundation Line Distribution**
- Primary zone: Along bottom edge (lower 10% margin)
- Distribution: 4-6 elements evenly spaced horizontally
- Scale: Uniform 70-90% size
- Purpose: Create visual baseline/grounding

**3. Lower Corner Anchors**
- Primary zone: Bottom-left and bottom-right corners (outer 15-20%)
- Distribution: 1-2 accent elements per corner
- Scale: 85-100% (larger than top anchors for weight)
- Rotation: ±8-12° for dynamic stability

**4. Shadow Zone Placement**
- Primary zone: Bottom 30% with upward fade
- Distribution: 5-8 elements with opacity decrease toward middle
- Opacity gradient: 85% at bottom → 30% at transition
- Purpose: Simulate grounded depth

**5. Structural Base Clusters**
- Primary zone: Bottom third, clustered in 2-3 groups
- Distribution: 6-9 elements total in asymmetric clusters
- Cluster spacing: Approximately 30-40% width intervals
- Scale variance: 60-100% within each cluster

---

#### ⬅️➡️ ③ Side Space Heavy
**Characteristics**: Central information is vertically long, left/right sides are empty
**Goal**: Frame the center with lateral visual interest

**Spatial Distribution Rules:**

**1. Vertical Edge Flow**
- Primary zone: Left and right outer margins (outer 15% on each side)
- Distribution: 4-6 elements per side along vertical axis
- Spacing: Even intervals with slight rhythmic variation
- Rotation: ±10-20° alternating direction for flow

**2. Side Anchor Positioning**
- Primary zone: Four corner regions (top-left, top-right, bottom-left, bottom-right)
- Distribution: 1 element per corner (4 total)
- Scale: 70-85%
- Purpose: Frame stability without center interference

**3. Orbital Side Scatter**
- Primary zone: Left and right margins in curved/orbital pattern
- Distribution: 5-8 elements following arc trajectories
- Path: Gentle curves from top-outer to bottom-outer
- Scale variance: 50-80% with smallest at arc extremes

**4. Lateral Bracketing**
- Primary zone: Horizontal center line, left and right extremes
- Distribution: 2-3 elements mirrored on each side
- Symmetry: Loose mirroring (±5-10px offset for natural feel)
- Purpose: Create visual corridor guiding to center

**5. Side Gradient Clusters**
- Primary zone: Left and right margins, concentrated in thirds
- Distribution: 3-4 elements per side in upper, middle, lower zones
- Density: Higher in upper and lower thirds, sparse in middle
- Opacity: 80-100% varying by depth layer

---

#### ⚖️ ④ Balanced / Centered Layout
**Characteristics**: Even whitespace on all sides, centered focal content
**Goal**: Maintain equilibrium while adding peripheral interest

**Spatial Distribution Rules:**

**1. Radial Scatter Distribution**
- Primary zone: Full periphery at 60-90% radial distance from center
- Distribution: 8-12 elements evenly scattered in circular pattern
- Angular spacing: Approximately 30-45° intervals
- Scale variance: 50-90% creating depth through size

**2. Corner-to-Corner Balance**
- Primary zone: All four corners plus four midpoints (8 positions)
- Distribution: 1 element per position (8 total)
- Scale: Corners 80-100%, midpoints 60-75%
- Rotation: ±5-15° all varying for organic feel

**3. Concentric Ring Placement**
- Primary zone: Two circular zones at 70% and 85% radius from center
- Distribution: Inner ring 6-8 elements, outer ring 8-10 elements
- Alignment: Elements oriented toward center
- Purpose: Create focal pull without crowding

**4. Grid Peripheral Distribution**
- Primary zone: Imaginary 3×3 grid, using only outer 8 cells
- Distribution: 1-2 elements per outer cell (8-16 total)
- Spacing: Even grid intervals with micro-randomization (±5px)
- Purpose: Structured balance with natural variation

**5. Confetti Scatter Logic**
- Primary zone: Full background with center avoidance (40% center radius clear)
- Distribution: 10-15 elements randomly scattered
- Clustering avoidance: Minimum 8-10% canvas distance between elements
- Scale: 40-80% highly variable for confetti effect
- Opacity: 60-100% varied for depth

---

#### 🌀 ⑤ Full Surround / Wide Margin
**Characteristics**: Core info clustered at center, wide outer margins
**Goal**: Envelop the center with comprehensive peripheral decoration

**Spatial Distribution Rules:**

**1. Frame Border Distribution**
- Primary zone: All four edges following frame perimeter
- Distribution: 12-20 elements evenly spaced along entire border
- Spacing: Approximately equal intervals (5-8% of perimeter length)
- Scale: Uniform 60-80% for consistency
- Orientation: Perpendicular to frame edge

**2. Corner Emphasis Clusters**
- Primary zone: Four corners with extended reach (outer 25% of width/height)
- Distribution: 3-4 elements per corner (12-16 total)
- Cluster shape: L-shaped distribution hugging corner
- Scale: Largest at corner apex (100%), diminishing outward (70%)

**3. Layered Surround Rings**
- Primary zone: Three concentric zones at 75%, 85%, 95% radius from center
- Distribution: Inner ring 8 elements, middle ring 12 elements, outer ring 16 elements
- Alignment: All elements radially oriented
- Purpose: Create depth through layering

**4. Diagonal Cross Placement**
- Primary zone: Four diagonal corridors from corners toward center
- Distribution: 4-6 elements per diagonal (16-24 total)
- Flow: Larger elements at corners, smaller toward center
- Rotation: Aligned with diagonal axis ±5°

**5. Full Peripheral Texture**
- Primary zone: Entire outer 20-25% margin band
- Distribution: 15-25 elements densely scattered
- Density gradient: Highest at edges (100%), decreasing inward (40%)
- Scale variance: 35-75% highly varied
- Purpose: Create rich enveloping texture

---

### Placement Pattern Selection Logic

1. **Analyze Template Whitespace**: Identify which category (①-⑤) matches layout
2. **Select 2-3 Distribution Rules**: Choose compatible rules from that category
3. **Adapt to Theme Content**: Apply spatial logic to Theme-generated decorative elements
4. **Calculate Target Density**: Determine appropriate whitespace occupation percentage based on Intent
5. **Adjust Element Parameters**: Scale quantity, sizes, and opacity to achieve target density
6. **Maintain Text Clearance**: All spatial zones must respect minimum 12-15px text buffer

### Universal Placement Principles

**Spacing Logic:**
- Minimum inter-element distance: 8-12% of canvas width
- Text clearance buffer: 12-15px minimum from all text
- Edge margin: 3-5% of canvas dimension from absolute edges

**Scale Variance:**
- Primary elements: 80-100% of base size
- Secondary elements: 60-80% of base size
- Accent elements: 40-60% of base size
- Never use uniform scaling—variance creates depth

**Rotation Guidelines:**
- Subtle energy: ±5-10° rotation
- Moderate dynamism: ±10-20° rotation
- High energy: ±20-45° rotation
- Avoid perfect horizontal/vertical alignment

**Opacity Strategy:**
- Foreground elements: 85-100% opacity
- Mid-ground elements: 70-85% opacity
- Background elements: 40-70% opacity
- Layering through opacity creates depth

**Distribution Balance:**
- Visual weight should feel evenly distributed across designated zones
- Avoid perfect symmetry—use asymmetric balance for natural feel
- Create rhythm through alternating scales, rotations, and densities


## Typography Transformation Guidelines

**CRITICAL**: Typography should undergo dramatic transformations, not just style changes. Go beyond font selection and weight adjustments.

### Size & Scale Transformations
- **Extreme Scale Contrast**: Main discount text 3-5x larger than secondary elements
- **Progressive Scaling**: Each text hierarchy level should have 150-200% size difference
- **Breakout Sizing**: Key elements can exceed standard frame boundaries for impact
- **Micro-Macro Mix**: Combine oversized hero text with tiny supporting details

### Shape & Form Alterations
- **Warp Effects**: Apply arch, wave, bulge, or flag warp to titles and key phrases
- **Perspective Distortion**: Angle text in 3D space for depth and dynamism
- **Curved Baseline**: Text following circular, wave, or custom path alignments
- **Stacked vs. Stretched**: Vertical stacking for compact impact or horizontal stretching for elegance
- **Letter Manipulation**: Individual letter rotation, offset, or scale variation within words

### Dimensional Changes
- **3D Extrusion**: Add depth through bevel, extrude, or layer effects (especially for discounts)
- **Shadow Projection**: Long cast shadows, multiple shadows, or distorted shadow shapes
- **Outline Variety**: Thick outlines, double outlines, or gradient stroke effects
- **Layer Separation**: Text broken into foreground/background layers with different treatments

### Positional Dynamics
- **Rotation**: 5-45° angles for energy and breaking grid monotony
- **Overlap & Intersection**: Text elements layering over each other or design elements
- **Off-Center Placement**: Asymmetric positioning for modern editorial feel
- **Diagonal Alignment**: Text following diagonal axes across the composition

### Decorative Typography Integration
- **Inline Graphics**: Icons, shapes, or industry elements embedded within letterforms
- **Text as Container**: Letters functioning as frames for imagery or patterns
- **Ornamental Additions**: Underlines, flourishes, brackets, or decorative caps
- **Texture Overlays**: Halftone, grain, gradient, or pattern fills within text

### Style-Specific Typography Rules
- Must align with Style parameter but push boundaries
- Vintage styles: more warp, texture, imperfection
- Modern styles: more geometric transformation, clean distortion
- Neon styles: more dimensional extrusion, glow variation
- Always maintain readability despite transformation


## Critical Guidelines

### 1. Theme as Sole Content Source
**IMPORTANT**: All decorative elements, motifs, icons, and visual objects come ONLY from Theme.

**Examples**:
- Christmas theme → Santa, snowflakes, ornaments, wreaths, gifts, pine trees, stars
- Black Friday theme → Shopping bags, price tags, percentage symbols, ribbons, sale stickers
- Summer theme → Sun, palm trees, beach balls, waves, fruits, ice cream, sunglasses

**NOT from Industry anymore**: Industry context has been removed. Theme provides all visual content.

### 2. Spatial Distribution Over Object Specification
Use asset-agnostic placement patterns to describe WHERE and HOW decorations are distributed, not WHAT they are.

- ✅ "Using Radial Scatter Distribution: place 8-10 Theme elements evenly around periphery at 70-85% radius, scale variance 60-90%, rotation ±10-15°"
- ✅ "Apply Corner Emphasis Clusters: position 3-4 Theme decorations in each corner with L-shaped distribution"
- ❌ "Put sparkles in corners and ribbons on sides" (too object-specific)
- ❌ "Place shopping cart top-right" (should use spatial rule instead)

### 3. Design Modification Specificity
Design instructions must be extremely specific about spatial relationships and transformations:
- ✅ "Apply Diagonal Flow Placement: distribute 4 Theme elements along top-left to mid-right corridor, progressive size decrease 100% → 60%, rotation aligned with flow axis 8-12°"
- ✅ "Background with vertical gradient from warm cream (#F9F3E7) to soft peach (#FFDCC8) spanning full canvas"
- ❌ "Make it look better" (too vague)
- ❌ "Add some decorations around the edges" (not specific enough)

### 4. Role Distribution
- **Style**: Handles color, tone, texture, typography transformations, effects, overall aesthetic
- **Theme**: Provides ALL decorative content (objects, motifs, icons, seasonal elements)
- **Intent**: Adjusts decorative quantity and information hierarchy
- **Placement Patterns**: Determines spatial distribution logic based on whitespace structure

### 5. Parameter Integration Logic
Each parameter must be clearly present in the final prompt:
- **Style** → Typography system, color palette, texture treatment, effects style
- **Theme** → Specific decorative objects/motifs that match the theme
- **Intent** → Appropriate quantity of decorations (minimal for CV, rich for social posts)
- **Whitespace Analysis** → Selected spatial distribution rules


## Direct Command Prompt Structure

Claude provides ONLY direct command-style prompts. No structured template sections.

### Command Prompt Format

**Opening Statement:**
"Transform the imported layout into a ${Theme} ${Intent} using ${Style} aesthetic."

**Whitespace Analysis Declaration:**
"Whitespace structure: ${Category} (brief characteristic description). Selected spatial distribution rules: ${Rule 1}, ${Rule 2}, ${Rule 3}."

**Background Treatment:**
[Specific background colors, gradients, textures aligned with Style]

**Typography Transformations:**
[Each text element with dramatic SIZE, WARP, ROTATION, 3D, POSITIONING changes aligned with Style]
- Main title/headline
- Subheadings
- Body text / codes
- Fine print
[Include specific Style-appropriate typography characteristics]

**Frame & Structural Elements:**
[Ticket frames, badges, containers, borders with Style-specific treatments]

**Decorative Element Distribution (Asset-Agnostic):**
"Theme content: ${Theme} provides decorative elements including [list 5-8 theme-appropriate objects/motifs].

Using ${Distribution Rule 1}: [Detailed spatial instructions without naming specific objects]
- Primary zone: [specific area]
- Distribution: [quantity] Theme elements [spatial pattern]
- Spacing: [specific measurements/percentages]
- Scale variance: [range]
- Rotation: [range]
- [Additional spatial specifications]

Using ${Distribution Rule 2}: [Detailed spatial instructions]
- [Same detailed breakdown]

Using ${Distribution Rule 3}: [Detailed spatial instructions]
- [Same detailed breakdown]"

**Effects & Finishing:**
[Shadows, glows, depth, transparency - all aligned with Style]

**Color Application Logic:**
[How Style color palette is distributed across elements]

**Preservation Requirements:**
[Layout maintenance, text content preservation, readability priorities]

---

### Key Prompt Requirements:

1. **Begin with whitespace analysis** - identify structure category and selected rules
2. **List Theme content separately** - enumerate what decorative objects Theme provides
3. **Apply spatial rules asset-agnostically** - describe distribution patterns without object-specific placement
4. **Include dramatic typography transformations** - size, warp, rotation, 3D, position (Style-driven)
5. **Maintain Style consistency** - all aesthetic decisions reflect Style parameter
6. **Respect Intent density** - decorative quantity matches Intent level
7. **Use imperative command language** - direct, specific, actionable instructions
8. **Extreme specificity** - percentages, pixel values, degree measurements, color codes



## Implementation Process

When user provides Intent, Theme, Style, and reference image:

1. **Analyze Whitespace Structure** → Identify which of the 5 categories applies (Top/Bottom/Side/Balanced/Full Surround)
2. **Select 2-3 Spatial Distribution Rules** → Choose specific rules from the appropriate category
3. **Determine Target Density** → Based on Intent, calculate appropriate whitespace occupation percentage
4. **Generate Theme Content List** → Enumerate decorative objects/motifs appropriate for the Theme
5. **Design Typography Transformations** → Plan dramatic size, warp, rotation, 3D, positioning changes based on Style
6. **Apply Style Logic** → Define color palette, texture treatment, effects style aligned with Style parameter
7. **Integrate Spatial Patterns with Theme Content** → Apply distribution rules to Theme-generated decorations
8. **Adjust for Intent Density** → Scale element quantity, sizes, and opacity to achieve target density percentage
9. **Generate Direct Command Prompt** → Write imperative-style instructions with extreme specificity

---

## Example Workflow

**User Input:**
- Intent: Coupon Promo
- Theme: Christmas
- Style: Vintage 90s hip-hop aesthetic with burnt monochrome color scheme, bold typography, paper texture
- Reference Image: [coupon with centered ticket, even margins on all sides]

---

**Claude Analysis:**

**Step 1 - Whitespace Structure:**
Category identified: **④ Balanced / Centered Layout**
- Reasoning: Centered ticket with even margins on all sides, whitespace relatively uniform

**Step 2 - Spatial Distribution Rules Selected:**
1. Radial Scatter Distribution (for peripheral balance)
2. Corner-to-Corner Balance (for structural anchors)
3. Confetti Scatter Logic (for background texture)

**Step 3 - Theme Content Generation:**
Christmas Theme provides: Santa hat, snowflakes, ornament balls, gift boxes, pine branches, candy canes, stars, holly leaves

**Step 4 - Typography Transformation Plan:**
- Title: 220% scale, arch warp, 3° rotation
- Discount: 450% scale, 3D extrusion, perspective warp
- Code: Horizontal stretch, typewriter style
- Date: 75% scale, wide tracking

**Step 5 - Style Application:**
Burnt monochrome palette (#D4491F, #A0522D, #F9F3E7), heavy paper grain, halftone dots, rough edges, offset shadows

**Step 6 - Intent Density:**
Coupon Promo = Moderate density → Target 30-35% whitespace occupation appropriate

---

**Claude Output (Direct Command Prompt):**

Transform the imported layout into a Christmas Coupon Promo using vintage 90s hip-hop editorial aesthetic with burnt monochrome color scheme and bold typography.

**Whitespace Analysis:**
Whitespace structure: Balanced / Centered Layout (even margins on all sides, centered ticket dominates). Selected spatial distribution rules: Radial Scatter Distribution, Corner-to-Corner Balance, Confetti Scatter Logic.

**Background Treatment:**
Apply vertical gradient from cream to warm beige (#F9F3E7 to #E8DCC8) across full canvas. Add heavy paper grain texture overlay (3-4% opacity) using analog noise pattern. Include subtle halftone dot pattern (1.5px dots, 10% opacity, burnt sienna #A0522D) concentrated in outer 30% margin zones for vintage depth.

**Typography Transformations:**

Main title "Flash Sale Promotion Selected Items": Bold condensed display font (Cooper Black style), burnt orange (#D4491F). Apply 220% scale increase, break into asymmetric two-line composition with arch warp (12% upward curve on baseline). Rotate entire title block 3 degrees counterclockwise. Add rough ink edges (2-3px irregular outline). Letter spacing 0.05em for breathing room. Apply halftone dot overlay (60% opacity) on letterforms.

Brand badge "YOUR BRAND": Scale down to 65%, create rounded rectangle container with charcoal brown fill (#3D2817) and burnt sienna offset border (3px). Rotate 4 degrees clockwise. Add cream text with slight texture.

"50% OFF" hero text: Extra bold sans-serif, apply extreme 450% scale transformation. Create 3D extrusion effect with 10px depth in deep rust (#8B3A1F). Apply perspective warp (top edge compressed to 85% width). Fill with burnt orange to burnt sienna gradient. Position off-center right (+12px), rotate 5 degrees clockwise. Add double outline: inner cream 3px, outer burnt sienna 5px. Halftone texture overlay at 70% opacity.

Coupon code "COUPON CODE 000000": Monospace typewriter font, charcoal brown (#3D2817). Apply horizontal stretch to 110% width. Scale to 90% height. Add subtle paper texture within letters.

Validity date "VALID UNTIL DECEMBER 2ND, 2030": Clean sans-serif, burnt sienna (#A0522D). Scale down to 75%, apply wide letter spacing (0.08em) for elegance.

Bottom brand "YOUR BRAND": Bold sans-serif, burnt orange (#D4491F). Scale to 110%, all caps, letter spacing 0.12em for authority.

**Frame & Structural Elements:**
Central ticket frame with hand-drawn imperfect perforated edges. Background: cream with visible paper grain and subtle halftone pattern. Border: burnt sienna rough stroke (2-3px irregular width). Apply offset drop shadow (4px, 4px, burnt sienna at 25% opacity, 6px blur).

**Decorative Element Distribution (Asset-Agnostic):**

Theme content: Christmas provides decorative elements including Santa hats, snowflakes, ornament balls, gift boxes, pine branches, candy canes, stars, holly leaves.

Using Radial Scatter Distribution:
- Primary zone: Full periphery at 65-85% radial distance from center
- Distribution: Theme elements (from Christmas list above) scattered in circular pattern around ticket
- Angular spacing: Approximately 45-degree intervals with ±10-degree randomization
- Scale variance: 55-85% (smaller elements at greater radius, larger closer)
- Rotation: Each element ±12-18 degrees, all varied
- Opacity: 85-100% at closer radius, 70-85% at outer radius
- Clearance: Minimum 15px from ticket frame edge, 18px from any text

Using Corner-to-Corner Balance:
- Primary zone: Four corners (outer 18-22% of canvas dimensions)
- Distribution: Theme elements per corner (from Christmas list)
- Scale: Corner elements 80-90% of base size
- Rotation: ±8-15 degrees varying per corner
- Alignment: Elements oriented slightly toward center (rotation tilted 5-7° inward)
- Purpose: Create structural anchors framing composition

Using Confetti Scatter Logic (Background layer):
- Primary zone: Full background with center exclusion (45% center radius clear for ticket)
- Distribution: Small Theme accent elements randomly scattered
- Clustering avoidance: Minimum 10% canvas distance between any two elements
- Scale: Highly variable 35-65% creating depth variance
- Rotation: Full random ±0-90 degrees
- Opacity: 40-75% varied (lighter elements further back, more opaque forward)
- Purpose: Create background texture enriching peripheral space

All Theme decorative elements rendered in burnt monochrome palette (burnt orange, burnt sienna, deep rust) with paper grain texture overlay and rough edges consistent with Style. Decorations distributed to achieve approximately 32% whitespace occupation, appropriate for moderate Coupon Promo density—creating balanced visual interest without overwhelming ticket clarity.

**Effects & Finishing:**
Apply offset drop shadows to major elements (ticket frame, hero discount text) using burnt sienna at 20-30% opacity, 3-5px offset, 6-8px blur. Add two-tone overlays on decorative elements (darker burnt tone on shadow side, lighter on highlight side) for subtle depth. Maintain predominantly flat graphic energy with minimal gradients. Embrace handcrafted imperfection: introduce 1-2px micro-misalignments, slightly worn edges on all elements.

**Color Application Logic:**
70% cream and beige tones (backgrounds, negative space), 25% burnt orange and sienna (typography, primary decorations), 5% deep rust and charcoal brown (shadows, depth accents). Never use pure black—always warm dark browns. Maintain high contrast between burnt tones and cream background for optimal readability.

**Preservation Requirements:**
Keep exact layout proportions. Maintain all original text content verbatim: "Flash Sale Promotion Selected Items," "YOUR BRAND" (appears in badge and at bottom), "50% OFF," "COUPON CODE 000000," "VALID UNTIL DECEMBER 2ND, 2030." Preserve centered ticket structure with perforated edges. Ensure minimum 15-18px clearance between all decorative elements and text areas. Maintain moderate density (approximately 32% whitespace occupation) to balance vintage aesthetic warmth with high readability through intentional contrast and spatial distribution discipline.

---

**This example demonstrates:**
- Clear whitespace category identification (Balanced / Centered Layout)
- Three specific spatial distribution rules selected and applied
- Theme content listed separately (Christmas decorative objects)
- Dramatic typography transformations with Style alignment (vintage, burnt palette, paper texture)
- Asset-agnostic distribution descriptions (no "put snowflake here" - instead spatial logic)
- Appropriate Intent density (32% whitespace occupation for moderate Coupon Promo)
- Imperative command style with extreme specificity throughout
- Complete Style, Theme, Intent integration without Industry


## Style Framework Reference

### Typography Guidelines
- Bold, condensed display fonts (Cooper Black, Blenny)
- Paired with rounded grotesques or casual hand-lettering
- Heavy weight, tight spacing, curved terminals, dynamic alignment
- **CRITICAL**: Apply transformations - warp, rotation, 3D, extreme scale variation
- Grain, halftone, or subtle outline effects for tactile charm

### Color System Structure
Built on tonal structure (one warm, one cool, one neutral):
- **Default**: Retro Red (#D44B42), Mint Green (#8EC7B5), Cream (#F9F3E7), Charcoal (#2A201D)
- **Themed Swaps**: Maintain tone contrast while changing hues
  - Warm → Gold, Coral, Burgundy
  - Cool → Navy, Teal, Electric Blue
  - Neutral → Light Gray, Off-White

### Shape & Structure
- Rounded, geometric, playful
- Imperfect symmetry
- Sticker-like frames
- Bold icons (stars, badges, lightning bolts)
- Checkerboard or bordered layouts
- **Apply placement patterns based on whitespace analysis**

### Texture & Material
- Always tangible: paper grain, halftone dots, rough ink edges
- Analog depth in digital environments

### Effects & Depth
- Keep flat, graphic energy
- Offset shadows, mild glow, two-tone overlays
- Avoid realism
- Embrace handcrafted imperfection

## Theme Application Rules

1. **Minimal & Balanced**: Use decorative elements as occasional highlights, not repeating patterns
2. **Pattern-Based Placement**: Follow whitespace structure analysis - use appropriate pattern category
3. **Text Clarity**: Text area must remain clean, uncluttered, highly readable
4. **No Overlap**: No theme graphics behind or overlapping text
5. **Strategic Integration**: Use placement patterns to guide decoration positioning


## Quality Checklist

Before finalizing a prompt, verify:
- ✅ Whitespace structure analyzed and category identified (①-⑤)
- ✅ 2-3 appropriate spatial distribution rules selected from correct category
- ✅ Theme content list generated (5-8 decorative objects/motifs from Theme)
- ✅ Typography transformations are dramatic (size, warp, rotation, 3D, position) and Style-aligned
- ✅ All three parameters (Intent, Theme, Style) are clearly incorporated
- ✅ Spatial distribution rules applied asset-agnostically (WHERE/HOW, not WHAT specifically)
- ✅ Design modifications are specific and actionable (percentages, pixels, degrees, color codes)
- ✅ Layout preservation is emphasized
- ✅ Text readability is protected (minimum clearance specified)
- ✅ Decorative density matches Intent level (sparse <15% / moderate 25-40% / rich 45-65% whitespace occupation)
- ✅ Direct command style used (no structured template sections)
- ✅ Style guidelines fully integrated (typography, color, texture, effects)
- ✅ No Industry references present (removed parameter)
- ✅ Theme is sole source of decorative content
- ✅ Spatial patterns naturally accommodate Theme-generated decorations

---

## Notes for Claude

**Critical Principles:**
- **Always start with whitespace structure analysis** - this determines applicable spatial distribution rules
- **Three parameters only**: Intent, Theme, Style (Industry removed completely)
- **Theme = Content Source**: All decorative objects, motifs, icons come exclusively from Theme
- **Patterns = Spatial Logic**: Distribution rules describe WHERE and HOW, never WHAT specific objects
- **Push typography boundaries**: Extreme transformations create visual impact and hierarchy
- **Style drives aesthetics**: All color, texture, effects decisions reflect Style parameter
- **Intent controls density**: Adjust decoration density to achieve target whitespace occupation percentage

**Density Guidelines:**
- CV Letter / Professional docs: <15% whitespace occupation (sparse)
- Coupon Promo / Marketing materials: 25-40% whitespace occupation (moderate)
- Social Countdown / Event announcements: 45-65% whitespace occupation (rich)
- Density = cumulative visual footprint of all decorations relative to available whitespace
- Adjust through element quantity, scale, and opacity to hit target percentage

**Asset-Agnostic Mindset:**
- Never write "place snowflake in top-right corner" → Instead: "Using Corner Halo Positioning, place Theme elements in top-right outer 15-20% zone"
- Never write "scatter stars around frame" → Instead: "Using Frame Border Distribution, place Theme elements evenly spaced along perimeter"
- Spatial rules work with ANY Theme content - they're distribution systems, not object catalogs

**Integration Logic:**
1. Identify whitespace structure
2. Select compatible spatial rules
3. Determine target density percentage based on Intent
4. List Theme-appropriate decorative content separately
5. Apply spatial rules to distribute that Theme content
6. Ensure Style consistency across all aesthetic decisions
7. Adjust element quantity, scale, and opacity to achieve target density

**Prompt Quality Standards:**
- Imperative command language throughout
- Extreme specificity (measurements, percentages, angles, color codes)
- Clear parameter integration (Style aesthetic + Theme content + Intent density + Spatial logic)
- Density expressed as whitespace occupation percentage, not element count
- Practical implementation guidance
- Readability and layout preservation prioritized
- Balance creative vision with practical constraints

**Common Mistakes to Avoid:**
- ❌ Mentioning Industry or creating Industry × Theme fusions
- ❌ Object-specific placement ("put ribbon here, sparkle there")
- ❌ Vague distribution instructions ("add some decorations around")
- ❌ Specifying exact element counts ("place 8 snowflakes") instead of density percentages
- ❌ Uniform spacing/scaling (always use variance for depth)
- ❌ Forgetting typography transformations or making them too subtle
- ❌ Inconsistent Style application across elements
- ❌ Wrong Intent density (too many decorations for CV, too few for social)

---

**Remember**: This skill creates prompts for AI image generation tools. Prompts must be clear, detailed, and balanced between creative vision and practical constraints. The asset-agnostic placement system ensures spatial distribution rules work universally with any Theme content, while the three-parameter structure (Intent, Theme, Style) provides clear, non-overlapping roles for each design driver.
