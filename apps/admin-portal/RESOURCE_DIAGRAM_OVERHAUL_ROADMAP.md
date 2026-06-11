# Resource Diagram Overhaul Roadmap

## Goal

Make maths diagrams in the resource generator reliable enough for routine tutor use: no overlapping labels, no labels sitting on lines, consistent textbook-style geometry, predictable graph/table rendering, and clear failures when a requested diagram cannot be rendered safely.

The core direction is to move from one-off SVG coordinate fixes to a small, deterministic diagram system with validation, layout rules, collision checks, and visual regression coverage.

## Current State

- The AI emits optional `diagram` objects in generated maths resources.
- DOCX rendering uses `backend/functions/src/resources/builder/diagrams.js`.
- Most diagrams are rendered as SVG in `backend/functions/src/resources/diagramGenerator.js`, rasterised to PNG with Sharp, then embedded in DOCX.
- `two-way-table` is already rendered as a native Word table instead of an image.
- Shape and measurement diagrams are currently disabled through prompt policy and validation.
- Existing tests check that diagram images are embedded and disabled shape types are rejected, but they do not prove visual correctness.

## Problem

The fragile cases are geometry and measurement diagrams. The current renderer has many per-diagram hard-coded coordinates and label offsets. That makes it easy to fix one visible overlap while creating another in a different shape, label length, angle size, canvas crop, or DOCX scaling scenario.

Reliable diagram generation needs a system-level layout model, not a growing list of coordinate patches.

## Principles

1. The AI should choose educational intent, not drawing coordinates.
2. Diagram specs should be semantic, finite, and validated before rendering.
3. Every renderer must be deterministic.
4. Labels, arcs, leader lines, points, and strokes must participate in collision checks.
5. Unsupported diagrams should fail closed or regenerate without a diagram.
6. Geometry should be rolled out one diagram family at a time, with fixtures and visual checks before enabling it in prompts.
7. DOCX output is the product surface, so tests must verify both rendered assets and document embedding.
8. Prefer proven diagram libraries where they reduce custom layout or geometry work, but keep them behind controlled renderer adapters.

## Target Architecture

### 1. Diagram Contract

Replace broad free-form diagram objects with a versioned contract:

```json
{
  "version": 1,
  "type": "angle-on-line",
  "intent": "find-missing-angle",
  "data": {
    "angles": [50, 70, null],
    "labels": ["50 degrees", "70 degrees", "x"]
  }
}
```

Rules:

- `type` is an allowlisted renderer key.
- `intent` describes the educational purpose.
- `data` contains only semantic values.
- No arbitrary x/y positions from the AI.
- No free-form SVG, paths, dimensions, or layout hints.

### 2. Diagram Registry

Create a registry that defines each diagram family:

- schema validator
- renderer
- renderer backend, such as custom SVG, JSXGraph, Asymptote, D3, or native DOCX table
- prompt example
- fixture specs
- reliability status: `stable`, `needs-layout-checks`, `disabled`
- fallback behaviour

The prompt should be generated from the registry, not maintained separately from validation.

### 2a. Renderer Adapters And Library Reuse

The roadmap should not assume every diagram is hand-written SVG. Each diagram family should be able to choose the most reliable renderer backend through a common adapter interface:

```js
{
  validate(spec),
  buildScene(spec),
  renderToSvgOrPng(scene),
  validateLayout(scene, output),
}
```

Candidate library roles:

- JSXGraph: first candidate for geometry, coordinate planes, angle constructions, circles, and function graphs.
- Asymptote: candidate for high-quality static textbook geometry if the deployment/runtime cost is acceptable.
- D3: candidate for charts and force-based label collision, not as the main geometry engine.
- Native DOCX tables: preferred for tabular diagrams such as two-way tables.
- Custom SVG: acceptable for simple families where a library adds more complexity than reliability.

The AI must never emit library-specific code. It should continue to emit semantic diagram specs, and the registry should route each type to the chosen renderer backend.

### 3. Shared Geometry/Layout Primitives

Introduce reusable primitives:

- `Point`
- `Segment`
- `Ray`
- `Arc`
- `Box`
- `Label`
- `LeaderLine`
- `PlotArea`
- `DiagramScene`

Renderers should build a scene first, then pass it through layout and collision checks before producing SVG.

### 4. Label Placement Engine

Generalise the candidate/scoring approach already used in function plots.

For each label:

- generate candidate positions
- estimate text bounding box
- reject positions outside the safe drawing area
- score distance from strokes, arcs, points, arrowheads, tick labels, and other labels
- place optional leader lines when the best readable position is away from the object
- fail the render if no candidate reaches the minimum clearance threshold

### 5. Validation And Fallbacks

Validation should happen in layers:

1. JSON shape validation
2. diagram-type schema validation
3. semantic validation, such as angle sums and positive dimensions
4. layout validation, such as no collisions and no out-of-bounds content
5. DOCX embedding validation for final dimensions

Fallback policy:

- For non-essential visuals, omit the diagram and keep the question.
- For questions that require the diagram, mark the job as failed with a clear validation error or trigger one controlled regeneration.
- Never silently embed a diagram that fails layout validation.

## Implementation Phases

### Progress Checklist

Last updated: 2026-06-10 on branch `fix/resource-diagram-overhaul-roadmap`.

Completed so far:

- [x] Created this roadmap and recorded the target architecture, rollout phases, renderer-backend options, and safety principles.
- [x] Added the diagram registry source of truth in `backend/functions/src/resources/diagramRegistry.js` (`4058624`).
- [x] Moved prompt examples, disabled diagram policy, status classification, renderer-backend metadata, and fixture specs into the registry (`4058624`).
- [x] Added per-type diagram schema validation for prompt-visible diagrams, including rejection of unknown types, disabled types, unknown fields, and layout-control fields (`4058624`).
- [x] Added the local fixture render command `npm --prefix backend/functions run test:diagrams:render`, which writes PNG fixtures to `/tmp/tenacity-resource-diagram-fixtures` (`4058624`).
- [x] Fixed the `scatter-plot` prompt/renderer mismatch by accepting prompt-style `{ "x": number, "y": number }` point objects as well as legacy `[x, y]` pairs (`4058624`).
- [x] Added renderer-agnostic layout primitives in `backend/functions/src/resources/diagramLayout.js`, including points, segments, boxes, arc approximations, text-box estimation, and candidate scoring (`bdbc55e`).
- [x] Added unit coverage for label/label, label/line, label/point, label/arc, mixed-obstacle scoring, preferred valid candidate selection, and fallback collision ranking (`bdbc55e`, `7cb2d38`).
- [x] Wired `parallel-lines` angle labels into the shared text-candidate selector so labels avoid line segments and previous labels (`7cb2d38`).
- [x] Wired all `angles` subtypes (`single`, `on-line`, `at-point`, `vertically-opposite`) into shared text-candidate selection (`d18a6bc`).
- [x] Added render-smoke coverage for every allowed `angles` subtype (`d18a6bc`).
- [x] Added SVG-level renderer assertions that verify `angles` and `parallel-lines` angle labels clear rendered line/ray segments and other angle labels (`f2867b3`).
- [x] Added arc-specific SVG renderer assertions that verify `angles` and `parallel-lines` angle labels clear rendered angle arcs.
- [x] Added structured label-placement diagnostics to the shared layout selector when all candidates fail clearance.
- [x] Added the local renderer-spike command `npm --prefix backend/functions run test:diagrams:spike-renderers`, which renders representative diagrams through PNG rasterisation and DOCX embedding.
- [x] Ran the renderer-library spike against the local runtime and recorded the backend recommendation: keep custom SVG for now; do not adopt JSXGraph or Asymptote into production yet.
- [x] Decided the initial PNG fixture policy: do not commit golden PNGs yet; generate local or CI artifacts for review while code-level layout assertions remain the source of truth.
- [x] Manually reviewed the generated `parallel-lines`, standard `angles`, and temporary long-label angle subtype PNGs after the label-placement changes.
- [x] Added stress-case renderer assertions for small angles, crowded adjacent angles, at-point angles, vertically opposite long labels, and long-label parallel-line angles.
- [x] Fixed the stress-gate failure by expanding angle label candidate radii so cramped labels can move farther from rays, lines, and arcs.
- [x] Rendered and manually reviewed six promotion stress-case PNGs in `/tmp/tenacity-angle-stress-review`.
- [x] Promoted `angles` and `parallel-lines` from `needs-layout-checks` to `stable` with the `custom-svg-with-layout-engine` backend.
- [x] Updated rendered angle labels to use `°` instead of the word `degrees`, with additive expressions displayed as parenthesised degree measures.
- [x] Reduced the preferred angle-label gap and added a maximum-distance regression check so labels stay visually tied to their angle arcs while collision fallbacks remain available.
- [x] Updated function-plot labels to render numeric powers as mathematical superscripts and removed rounded stroke-cap extensions beyond axis and curve arrowheads.
- [x] Added semantic contracts and validation for `rectangle`, `L-shape`, and `T-shape`, including positive dimensions and composite-shape consistency checks.
- [x] Rebuilt the rectangle family with deterministic dimension lines, rotated vertical measurements, shared collision scoring, out-of-bounds rejection, and clear layout failures.
- [x] Added rectangle-family stress assertions and DOCX embedding/failure propagation coverage.
- [x] Rendered and manually reviewed standard, repeated-dimension, and small-dimension rectangle-family PNGs in `diagram-review-pngs/rectangle-family/`.
- [x] Promoted `rectangle`, `L-shape`, and `T-shape` together to `stable` and prompt-visible.
- [x] Verified the current checkpoint with `git diff --check`, `npm --prefix backend/functions test`, `npm --prefix backend/functions run test:diagrams:render`, and `npm --prefix backend/functions run test:diagrams:spike-renderers`.

Not completed yet:

- [x] Reintroduction of the remaining disabled shape and measurement diagram families, starting with right triangles, through to `annulus`, `elevation`, and `depression`. The disabled diagram list is now empty; every registered type ships on the `custom-svg-with-layout-engine` backend.
- [ ] Optional Asymptote deploy-cost check if 3D solids or nets become a serious near-term target.

### Phase 1: Freeze And Audit

Outcome: know exactly which diagram types are safe today.

Tasks:

- Inventory all supported generator types.
- Classify each type as `stable`, `needs-layout-checks`, or `disabled`.
- Classify each type by preferred renderer backend: custom SVG, JSXGraph candidate, Asymptote candidate, D3/chart candidate, or native DOCX.
- Keep shape/measurement diagrams disabled until their new contracts and tests exist.
- Add a developer-only sample renderer that writes PNGs for all stable fixtures to `/tmp`.
- Document current prompt/validation mismatch risks.
- Run a small no-commit spike for JSXGraph and Asymptote using 2-3 representative diagrams before committing to either.

Acceptance criteria:

- One list controls supported, disabled, and prompt-visible diagram types.
- No disabled type can be requested by prompt or accepted by validation.
- There is a repeatable command to render fixture PNGs locally.
- The roadmap has a concrete renderer-backend recommendation for each major diagram family.

Phase 1 implementation baseline:

- Source of truth: `backend/functions/src/resources/diagramRegistry.js`.
- Prompt examples are generated from the registry through `buildDiagramPromptExamples()`.
- Validation rejects disabled and unknown diagram types through the registry before DOCX rendering.
- Legacy `diagramPolicy.js` now exports the disabled shape list from the registry.
- Local fixture command: `npm --prefix backend/functions run test:diagrams:render`.
- Fixture PNG output defaults to `/tmp/tenacity-resource-diagram-fixtures`, grouped by status.

Current classification:

| Status | Types |
|---|---|
| `stable` | `number-line`, `coordinate-plane`, `function-plot`, `fraction-bar`, `pie-chart`, `array`, `pictograph`, `clock`, `spinner`, `bar-graph`, `histogram`, `dot-plot`, `scatter-plot`, `box-plot`, `stem-and-leaf`, `tree-diagram`, `venn-diagram`, `angles`, `parallel-lines`, `two-way-table` |
| `needs-layout-checks` | None at this checkpoint. |
| `disabled` | `right-triangle`, `triangle`, `rectangle`, `parallelogram`, `trapezium`, `circle`, `circle-sector`, `elevation`, `depression`, `prism-rect`, `prism-tri`, `cylinder`, `L-shape`, `T-shape`, `rect-triangle`, `rect-semicircle`, `annulus`, `cone`, `pyramid`, `sphere`, `net` |

Prompt/validation risk notes:

- Before phase 1, prompt-visible types and disabled validation lived in separate files.
- Unknown diagram types could pass JSON validation and then disappear during rendering.
- `angles` and `parallel-lines` remain prompt-visible and are now marked `stable` after shared layout assertions, stress-case renderer assertions, and manual stress PNG review.
- The first fixture render exposed the `parallel-lines` label-overlap failure: angle labels could sit on the transversal. The shared label engine now places those labels against line, arc, and prior-label obstacles.
- `two-way-table` remains native DOCX and is not emitted by the PNG fixture renderer.

Renderer-backend recommendations recorded in the registry:

| Family | Recommendation |
|---|---|
| Number, fraction, array, clock, spinner | Custom SVG is acceptable for now because the layout is finite and simple. |
| Charts and statistics | D3/chart helpers are the preferred candidate where future label and axis layout needs exceed the current custom SVG. |
| Coordinate planes and function plots | JSXGraph is the first candidate because it fits coordinate systems, axes, plotted points, and function curves. |
| Angles and parallel lines | Custom SVG with the shared layout engine is the current production recommendation; JSXGraph remains deferred until an adapter proves reliable text export, sizing, and cropping in Node. |
| Two-way tables | Native DOCX tables remain preferred. |
| Stem-and-leaf, tree diagrams, Venn diagrams | Keep current SVG path while adding shared layout checks; revisit native DOCX for stem-and-leaf if table fidelity becomes a problem. |
| 2D shape and measurement diagrams | JSXGraph or custom SVG with the shared layout engine, depending on the family. |
| 3D solids and nets | Asymptote candidate, pending runtime and deploy-cost checks. |

### Phase 2: Diagram Schema Registry

Outcome: prompts, validators, and renderers share one source of truth.

Tasks:

- Create a `diagramRegistry` module.
- Move disabled/stable status into the registry.
- Add renderer-backend metadata to registry entries.
- Add per-type validators for existing stable diagrams.
- Generate prompt examples from registry entries.
- Reject unknown fields that could imply layout control.

Acceptance criteria:

- Adding a diagram type requires adding a registry entry.
- Prompt examples cannot drift from validation.
- Renderer selection cannot drift from validation.
- Existing stable diagram tests still pass.

Phase 2 implementation baseline:

- `validateDiagram()` now routes every non-disabled prompt-visible type through an explicit schema validator.
- Unknown diagram types are rejected before rendering.
- Disabled diagram types are rejected before rendering.
- Unknown fields are rejected per diagram type.
- Top-level renderer/layout fields such as `canvasWidth`, `canvasHeight`, `width`, `height`, `svg`, `path`, `viewBox`, `x`, and `y` are rejected because layout must be renderer-controlled.
- Fixture specs from the registry are validated in unit tests, so prompt examples, fixture specs, and validation stay in sync.
- `scatter-plot` now accepts prompt-style point objects `{ "x": number, "y": number }` as well as legacy `[x, y]` pairs. This fixed a prompt/renderer mismatch found during schema validation.

Phase 2 tests:

- Every prompt-visible fixture validates against its diagram schema.
- Unknown fields and layout-control fields are rejected.
- Nested malformed specs, such as angle sums and two-way-table row widths, are rejected.
- Scatter plot fixture rendering is covered with prompt-style point objects.

### Phase 2a: Renderer Library Spikes

Outcome: choose libraries based on actual output in the Tenacity DOCX pipeline, not general appeal.

Tasks:

- Build minimal render spikes for:
  - an angle-on-line diagram
  - a right-triangle measurement diagram
  - a coordinate/function plot
- Compare custom SVG, JSXGraph, and Asymptote where practical.
- Measure output quality after Sharp rasterisation and DOCX embedding.
- Record operational costs: package size, install complexity, runtime support in Firebase Functions, render speed, and failure modes.

Acceptance criteria:

- A short decision note identifies which renderer backend should own each initial diagram family.
- No production prompt-visible behaviour changes during the spike.
- Any chosen library has a local, API-free render path that can run in tests or fixture generation.

Phase 2a decision note:

- Local command: `npm --prefix backend/functions run test:diagrams:spike-renderers`.
- Default output: `/tmp/tenacity-resource-diagram-renderer-spikes`.
- Custom SVG rendered the angle-on-line, right-triangle measurement spike, and function-plot spike through Sharp rasterisation and DOCX embedding. Each generated DOCX contained one PNG media entry.
- JSXGraph is not a repo dependency. A temporary no-save `jsxgraph` probe (~72 MB in `node_modules`) required a jsdom-style browser shim and produced larger untrimmed 1312x952 PNGs. Root cause of the dropped-label finding, confirmed on re-run: JSXGraph renders text as HTML `<div>` overlays positioned over the board by default, so labels live outside the `<svg>` element and vanish when the SVG is serialised headless. Forcing `display: "internal"` per label makes SVG `<text>` render, but then (a) there is no automatic label/obstacle collision avoidance — the hypotenuse `x` label overprints the line at the literal coordinate given, which is exactly the gap the shared layout engine exists to close — and (b) internal text does not parse HTML, so superscript/markup leaks as literal `<sup>` text. Net: JSXGraph would re-introduce, not remove, the manual-placement burden for our static-worksheet use case. Do not adopt it into production unless an interactive (browser-rendered) diagram surface becomes a requirement.
- Asymptote is not installed locally (`asy` executable not found) and would require a non-JS binary/runtime path. Do not adopt Asymptote for current 2D diagrams; revisit only for 3D solids/nets if deployment packaging supports it.
- Recommendation by family for now: keep custom SVG plus the shared layout engine for `angles`, `parallel-lines`, simple geometry, and current coordinate/function plots; keep Asymptote as a future 3D-only candidate; avoid renderer-library dependencies until they outperform the custom path inside the DOCX pipeline.
- PNG fixture policy: do not commit golden PNGs in this PR. Keep semantic fixture specs and SVG/layout assertions in tests, generate PNGs to `/tmp` for local review, and use CI artifacts rather than committed binaries if automated visual review is added later.

### Phase 3: Scene Model And Collision Engine

Outcome: renderers can prove labels are not on top of lines.

Tasks:

- Add geometry primitives and bounding-box helpers.
- Add text-size estimation utilities.
- Add segment-vs-box and box-vs-box checks.
- Add arc bounding approximations for angle markers.
- Add a label candidate/scoring API.
- Return layout diagnostics when placement fails.
- Keep the collision/layout API renderer-agnostic so it can validate both custom SVG output and library-backed output.

Acceptance criteria:

- Unit tests cover label/line, label/label, label/point, and label/arc collisions.
- Collision checks are independent of any single diagram type.
- Function-plot label placement can either reuse or mirror the shared engine.

Phase 3 implementation baseline:

- Added renderer-agnostic layout helpers in `backend/functions/src/resources/diagramLayout.js`.
- Current primitives include `point`, `segment`, `box`, `boxFromCenter`, `expandBox`, text-box estimation, segment-vs-box checks, box-vs-box checks, point-vs-box checks, arc approximation, arc bounds, arc-vs-box checks, label-candidate scoring, and text-candidate selection.
- The helper does not depend on DOCX, Sharp, SVG generation, or a specific diagram type.
- Initial unit tests cover label/label, label/line, label/point, label/arc, text-box estimation, mixed-obstacle label scoring, preferred valid candidate selection, and fallback collision ranking.
- `parallel-lines` now uses the shared text-box estimation and candidate scoring for angle labels, including line and prior-label obstacles.
- Manual fixture review confirmed the rendered `parallel-lines` angle labels clear the transversal and remain visually tied to the intended angle sectors.
- `angles` now uses the shared text-candidate selector across `single`, `on-line`, `at-point`, and `vertically-opposite` subtypes.
- Manual fixture review confirmed the standard `on-line` fixture and temporary long-label renders for the other `angles` subtypes clear the ray, line, and arc strokes.
- SVG-level renderer assertions now verify `angles` and `parallel-lines` red angle labels clear rendered line/ray segments and other angle labels.
- Arc-specific SVG assertions now verify `angles` and `parallel-lines` red angle labels clear rendered angle arcs.
- Stress-case renderer assertions now cover small angles, crowded adjacent angles, at-point angles, vertically opposite long labels, and long-label parallel-line angles.
- Manual stress PNG review confirmed the six promotion fixtures in `/tmp/tenacity-angle-stress-review` remain readable without label/line, label/arc, or label/label collisions.
- `angles` and `parallel-lines` are now promoted to `stable` while continuing to use the custom SVG renderer plus shared layout engine.

### Phase 4: Stabilise Existing Non-Shape Diagrams

Outcome: current allowed diagrams have explicit reliability coverage.

Initial stable set:

- `number-line`
- `coordinate-plane`
- `function-plot`
- `fraction-bar`
- `pie-chart`
- `array`
- `pictograph`
- `clock`
- `spinner`
- `bar-graph`
- `histogram`
- `dot-plot`
- `scatter-plot`
- `box-plot`
- `stem-and-leaf`
- `tree-diagram`
- `venn-diagram`
- `angles`
- `parallel-lines`
- `two-way-table`

Tasks:

- Add fixture specs per type.
- Add layout checks for labels and lines.
- Add PNG snapshot fixtures for representative outputs.
- Add DOCX embedding tests for image dimensions and native tables.

Acceptance criteria:

- Each allowed type has at least one fixture.
- Label collision assertions run in automated tests.
- Snapshot updates are explicit and reviewed.

### Phase 5: Rebuild Angle And Parallel-Line Diagrams

Outcome: angle diagrams are the first geometry-like family to reach stable status.

Tasks:

- Define semantic contracts for:
  - `angle-single`
  - `angle-on-line`
  - `angle-at-point`
  - `vertically-opposite-angles`
  - `parallel-lines-transversal`
- Ensure all angle labels are placed by the shared label engine.
- Add minimum arc spacing rules.
- Add leader lines for cramped labels.
- Validate angle sums before rendering.

Acceptance criteria:

- No label intersects a ray, line, arc, point, or another label in fixture tests.
- Small angles and long labels either render clearly or fail validation.
- These types are safe to expose in prompts.

### Phase 6: Reintroduce Shape Diagrams One Family At A Time

Outcome: shape diagrams return only when each family is demonstrably reliable.

Suggested order:

1. Rectangles and composite rectangles
2. Right triangles
3. General triangles
4. Circles and sectors
5. Prisms and cylinders
6. Cones, pyramids, spheres, and nets

For each family:

- define semantic contract
- implement deterministic canonical layout
- choose direct side labels or construction lines according to the measurement policy below
- add not-to-scale support where educationally appropriate
- add fixtures for standard labels, small dimensions, repeated dimensions, and crowded diagrams
- enable in prompt only after tests pass

Dimension-line policy:

- Place labels directly beside exposed polygon edges when each measurement maps unambiguously to one whole side. This applies to simple right triangles and general triangles.
- Use offset dimension brackets for total lengths, partial lengths, repeated parallel sides, or crowded composite shapes where ownership would otherwise be unclear. This applies to rectangles, L-shapes, T-shapes, and mixed composite shapes.
- Use construction lines for measurements that are not part of the visible perimeter, such as perpendicular heights, internal/shared edges, radii, and diameters.
- Omit a construction or dimension line when it adds no information. Collision checking still applies to direct labels.

Acceptance criteria:

- A family is either fully stable or remains disabled.
- No partial shape family is prompt-visible.
- Each family has layout failure tests, not just successful render tests.

#### Completed Checkpoint: Rectangle Family

Scope:

- `rectangle`
- `L-shape`
- `T-shape`
- Keep `rect-triangle` and `rect-semicircle` disabled for the later mixed-shape pass.

Implementation order:

1. Define explicit semantic schemas and prompt examples for the three scoped types.
2. Replace fixed label offsets with shared layout-engine placement against outlines, dimension lines, and prior labels.
3. Add semantic validation for positive dimensions and internally consistent composite-shape measurements.
4. Add fixtures for standard labels, small dimensions, repeated dimensions, and crowded layouts.
5. Add SVG-level assertions for label/outline, label/dimension-line, label/label, and out-of-bounds failures.
6. Render review PNGs into `diagram-review-pngs/rectangle-family/`.
7. Review the PNGs before changing registry status or prompt visibility.
8. Promote all three scoped types together only when tests and visual review pass; otherwise leave the family disabled.

Status:

- Completed on 2026-06-09.
- All three scoped types are stable and prompt-visible.
- `rect-triangle` and `rect-semicircle` were deferred to the mixed-shape checkpoint below.

#### Completed Checkpoint: Mixed Composite Shapes

Scope:

- `rect-triangle`
- `rect-semicircle`
- Keep standalone triangle and circle families disabled for their dedicated passes.

Implementation order:

1. Replace label-only legacy inputs with explicit semantic dimension schemas.
2. Render shared edges, perpendicular heights, and curved outlines deterministically.
3. Route every measurement label through the shared collision-aware layout engine.
4. Add semantic validation for positive dimensions and shared-edge relationships.
5. Add fixtures for standard, repeated, and small dimensions.
6. Add SVG-level assertions for labels against straight outlines, construction lines, curves, other labels, and canvas bounds.
7. Render review PNGs into `diagram-review-pngs/mixed-shapes/`.
8. Review the PNGs before promoting either type to stable or prompt-visible.

Acceptance criteria:

- Both mixed-shape types pass schema, layout, fixture-render, and DOCX embedding tests.
- Triangle-height construction is unambiguous and does not collide with the composite outline.
- Semicircle diameter ownership is clear without drawing the shared internal edge as part of the outer perimeter.
- Both types are promoted together or remain disabled together.

Status:

- Completed on 2026-06-09.
- Both mixed-shape types are stable and prompt-visible.
- Standard, repeated-dimension, and small-dimension PNGs were reviewed in `diagram-review-pngs/mixed-shapes/`.
- The next shape-family checkpoint is standalone right triangles.

#### Completed Checkpoint: Right Triangles

Scope:

- `right-triangle`
- Keep general `triangle` disabled for its later family pass.

Implementation order:

1. Replace vertex and arbitrary side-label maps with semantic `base`, `height`, and optional `hypotenuse` dimensions.
2. Validate positive perpendicular dimensions and Pythagorean consistency when a hypotenuse is supplied.
3. Render an explicit right-angle marker and collision-aware labels directly beside the three exposed sides.
4. Add standard, repeated-dimension, small-dimension, and layout-failure tests.
5. Add PNG and DOCX embedding coverage.
6. Render review PNGs into `diagram-review-pngs/right-triangles/`.
7. Review the PNGs before promoting the type to stable or prompt-visible.

Acceptance criteria:

- The perpendicular sides and right-angle vertex are unambiguous.
- Optional hypotenuse labels remain visually tied to the sloping side without an unnecessary bracket.
- Invalid Pythagorean dimensions fail validation before rendering.
- Labels clear the outline, right-angle marker, other labels, and canvas bounds.

Status:

- Completed on 2026-06-09.
- `right-triangle` is stable and prompt-visible.
- Standard, repeated-dimension, small-dimension, and two-side PNGs were reviewed in `diagram-review-pngs/right-triangles/`.
- The next shape-family checkpoint is general triangles.

#### Completed Checkpoint: General Triangles

Scope:

- `triangle`
- Support perimeter questions from three side lengths.
- Support area questions from a base and perpendicular height.

Implementation order:

1. Replace arbitrary vertices, side maps, and angle maps with semantic `base`, optional paired `leftSide` and `rightSide`, and optional perpendicular `height` dimensions.
2. Validate positive dimensions, paired side lengths, triangle inequality, and height consistency when both side lengths and height are supplied.
3. Derive the rendered geometry from the supplied dimensions, including acute, isosceles, and obtuse triangles.
4. Label exposed sides directly without construction lines.
5. Draw a dashed perpendicular construction line and right-angle marker only when a height is supplied.
6. Add layout, PNG, validation, and DOCX embedding coverage.
7. Render review PNGs into `diagram-review-pngs/general-triangles/`.
8. Review the PNGs before promoting the type to stable or prompt-visible.

Acceptance criteria:

- Every side label is visually tied to exactly one exposed side.
- Three-side diagrams contain no unnecessary construction lines.
- Area diagrams make the perpendicular height and its base unambiguous.
- Invalid or geometrically inconsistent dimensions fail before rendering.
- Labels clear the outline, construction line, right-angle marker, other labels, and canvas bounds.

Status:

- Completed on 2026-06-09.
- `triangle` is stable and prompt-visible.
- Scalene, isosceles, obtuse, and base-height PNGs were reviewed in `diagram-review-pngs/general-triangles/`.
- The next shape-family checkpoint is circles and sectors.

#### Completed Checkpoint: Circles And Sectors

Scope:

- `circle`
- `circle-sector`

Implementation order:

1. Replace free-form circle labels with semantic radius-or-diameter dimensions.
2. Require a sector radius and central angle.
3. Draw one construction line for a circle radius or diameter because neither measurement is part of the visible circumference.
4. Label a sector radius directly beside its visible radial edge without duplicating that edge.
5. Render the central angle with a collision-aware angle arc and degree label.
6. Add validation, layout, PNG, and DOCX embedding coverage.
7. Render review PNGs into `diagram-review-pngs/circles-sectors/`.
8. Review the PNGs before promoting either type to stable or prompt-visible.

Acceptance criteria:

- Circle radius and diameter ownership is immediately clear.
- Sector radius labels remain tied to one radial edge.
- Central-angle labels clear both radii, the angle arc, the sector arc, and the radius label.
- Invalid dimensions and angles fail before rendering.
- No construction line duplicates a visible sector boundary.

Status:

- Completed on 2026-06-10.
- `circle` and `circle-sector` are stable and prompt-visible.
- Radius, diameter, acute-sector, standard-sector, and reflex-sector PNGs were reviewed in `diagram-review-pngs/circles-sectors/`.
- The next shape-family checkpoint is prisms and cylinders.

#### Completed Checkpoint: Prisms And Cylinders

Scope:

- `prism-rect`
- `prism-tri`
- `cylinder`

Implementation order:

1. Replace free-form solid labels with semantic dimensions.
2. Use `length`, `width`, and `height` for rectangular prisms.
3. Use `triangleBase`, perpendicular `triangleHeight`, and `length` for triangular prisms.
4. Use `height` plus exactly one radius or diameter for cylinders.
5. Label exposed prism edges directly, with no duplicate dimension lines.
6. Draw a construction line only for the triangular-face perpendicular height.
7. Use a cylinder height bracket and one top-face radius or diameter measurement line.
8. Add validation, layout, PNG, and DOCX embedding coverage.
9. Render review PNGs into `diagram-review-pngs/prisms-cylinders/`.
10. Review the PNGs before promoting the family to stable or prompt-visible.

Acceptance criteria:

- Each solid remains recognisable at worksheet scale.
- Labels are clearly tied to distinct dimensions despite the projected 3D edges.
- Hidden edges remain visually secondary.
- The triangular-prism perpendicular height and right-angle marker are unambiguous.
- Cylinder radius or diameter and height ownership is clear.
- Invalid dimensions fail before rendering.

Status:

- Completed on 2026-06-10.
- `prism-rect`, `prism-tri`, and `cylinder` are stable and prompt-visible.
- Standard, repeated-dimension, compact, radius, and diameter PNGs were reviewed in `diagram-review-pngs/prisms-cylinders/`.
- Circle-face radius and diameter labels are required to remain fully inside the face.
- The cones, pyramids, spheres, and nets checkpoint followed this family.

#### Completed Checkpoint: Cones, Pyramids, Spheres, And Nets

Scope:

- `cone`
- `pyramid`
- `sphere`
- `net` for rectangular prisms

Implementation order:

1. Replace free-form solid labels with semantic dimensions.
2. Use `height` plus exactly one radius or diameter for cones.
3. Use `baseLength`, `baseWidth`, and perpendicular `height` for rectangular pyramids.
4. Use exactly one radius or diameter for spheres.
5. Use `length`, `width`, and `height` for rectangular-prism nets.
6. Keep cone and sphere radius or diameter labels fully inside the relevant circular face or silhouette.
7. Draw perpendicular-height construction lines only for cones and pyramids.
8. Label net edges directly without dimension brackets.
9. Add validation, layout, PNG, and DOCX embedding coverage.
10. Render review PNGs into `diagram-review-pngs/cones-pyramids-spheres-nets/`.
11. Review the PNGs before promoting any type to stable or prompt-visible.

Acceptance criteria:

- Each solid remains recognisable at worksheet scale.
- Cone and sphere circular measurements are contained inside the shape.
- Pyramid base length, base width, and height ownership is unambiguous.
- Net labels clearly identify three distinct edge dimensions without construction lines.
- Hidden edges remain visually secondary.
- Invalid or ambiguous dimensions fail validation before rendering.

Status:

- Completed on 2026-06-10.
- `cone`, `pyramid`, `sphere`, and rectangular-prism `net` are stable and prompt-visible.
- Radius, diameter, standard-dimension, and repeated-dimension PNGs were reviewed in `diagram-review-pngs/cones-pyramids-spheres-nets/`.
- Semantic validation, collision checks, circular-label containment, construction-line checks, and DOCX embedding coverage are implemented.
- Phase 6's planned shape-family sequence is complete.

#### Completed Checkpoint: Parallelograms And Trapeziums

Scope:

- `parallelogram`
- `trapezium`

Implementation order:

1. Replace legacy free-form labels with semantic `dimensions` objects.
2. Use direct labels for exposed bases and parallelogram sides.
3. Use a perpendicular construction line only when a height is supplied.
4. Support parallelogram area-only and perimeter-only measurement sets.
5. Support trapeziums with either the top or bottom parallel side longer.
6. Add semantic validation, collision checks, layout-failure coverage, PNG review, and DOCX embedding coverage.
7. Render review PNGs into `diagram-review-pngs/quadrilaterals/`.
8. Review the PNGs before promoting either type to stable or prompt-visible.

Acceptance criteria:

- Both quadrilateral types remain recognisable at worksheet scale.
- Every displayed measurement has unambiguous ownership.
- Perpendicular heights are visibly distinct from perimeter sides.
- Longer-top-base trapeziums extend the baseline correctly for the perpendicular height.
- Invalid or ambiguous dimensions fail validation before rendering.

Status:

- Completed on 2026-06-10.
- `parallelogram` and `trapezium` are stable and prompt-visible.
- Standard, repeated-dimension, side-only, height-only, shallow-height, longer-top-base, compact, and extreme-ratio PNGs were reviewed in `diagram-review-pngs/quadrilaterals/`.
- Semantic validation, collision checks, layout-failure tests, construction-line assertions, and DOCX embedding coverage are implemented.

#### Next Shape Checkpoint: Annulus And Trigonometric Measurement Diagrams

Scope:

- `annulus`
- `elevation`
- `depression`

Next steps:

1. Stabilise `annulus` as a separate circular-measurement checkpoint.
2. Define distinct semantic contracts for `elevation` and `depression`.
3. Reuse the established construction-line, angle-arc, and circular-label containment policies.
4. Add validation, collision, layout-failure, PNG review, and DOCX embedding coverage per family.
5. Keep each family disabled until its PNGs have been inspected and approved.
6. After these remaining diagrams, proceed to Phase 7 AI retry and tutor-facing reliability.

Resume commands:

```bash
git switch fix/resource-diagram-overhaul-roadmap
npm --prefix backend/functions test
npm --prefix backend/functions run test:diagrams:render -- ../../diagram-review-pngs/fixtures
```

Checkpoint commits to date:

- `8dcece0` - stabilise angle and parallel-line layout.
- `750806a` - polish function-plot notation and arrow endpoints.
- `b1b4498` - fix L-shape cutout measurement placement.
- `e873e3d` - refine compact shape dimension labels.
- `09b75a5` - stabilise mixed composite diagrams.
- `349062d` - stabilise right-triangle diagrams.
- `f677a5c` - stabilise general-triangle diagrams.
- `89921c3` - stabilise circle and sector diagrams.
- `5938a49` - stabilise prism and cylinder diagrams.

### Phase 7: AI Retry And Tutor-Facing Reliability

Outcome: poor diagram choices are recovered before tutors see broken resources.

Tasks:

- If a required diagram fails layout validation, retry once with a constrained correction prompt.
- If the retry fails, fail the job with a clear reason.
- Add structured warning metadata to resource jobs for omitted optional diagrams.
- Consider a tutor-facing note only when a diagram was omitted from an otherwise valid resource.

Acceptance criteria:

- Broken diagrams do not silently disappear when they are required for the question.
- Optional diagram omissions are traceable in job metadata.
- Failed jobs have actionable validation messages.

## Testing Strategy

### Unit Tests

- schema validation per type
- semantic validation per type
- collision primitives
- label candidate scoring
- layout failure cases
- renderer diagnostics

### Golden Fixtures

- fixture specs for every stable diagram
- generated SVG or PNG snapshots
- explicit review process for snapshot changes

### DOCX Tests

- images embedded at expected scale
- native tables remain native tables
- diagrams do not exceed page content width
- generated media entries exist for image-backed diagrams

### Manual QA Command

Add a command that renders all fixture diagrams to a temporary folder, grouped by type. This should be fast, local, and API-free.

Example target:

```bash
npm --prefix backend/functions run test:diagrams:render
```

## Rollout Plan

1. Keep disabled shape diagrams disabled.
2. Land the registry and tests without changing prompt-visible behaviour.
3. Run renderer-library spikes against the actual DOCX pipeline.
4. Choose renderer backends per diagram family.
5. Stabilise current allowed diagrams.
6. Enable angle/parallel-line improvements first.
7. Reintroduce shape families one at a time.
8. Deploy only after backend unit tests and representative visual fixtures pass.

## Open Decisions

- Whether future chart/statistics diagrams should move from custom SVG to D3/chart helpers once label density becomes a real issue.
- Whether JSXGraph is worth revisiting after an adapter proves reliable text export, sizing, and cropping in Node.
- Whether Asymptote's output quality justifies its non-JS toolchain and deployment cost for 3D solids or nets.
- Whether layout failures should trigger automatic AI retry for all resources or only for resources where the diagram is essential.
- How much tutor-facing metadata should be shown when optional diagrams are omitted.

## Near-Term First PR

The first implementation PR should not attempt to fix every diagram. It should establish the safety rails:

- create the diagram registry
- move prompt-visible types into the registry
- add per-type status
- add renderer-backend metadata
- add fixture rendering command
- add JSXGraph/Asymptote spike notes or placeholders
- add collision primitive tests
- keep shape diagrams disabled

That creates a stable foundation for the later renderer work.
