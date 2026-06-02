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
- reliability status: `stable`, `preview`, `disabled`
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

Last updated: 2026-06-02 on branch `fix/resource-diagram-overhaul-roadmap`.

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
- [x] Manually reviewed the generated `parallel-lines`, standard `angles`, and temporary long-label angle subtype PNGs after the label-placement changes.
- [x] Verified the current checkpoint with `git diff --check`, `npm --prefix backend/functions test`, and `npm --prefix backend/functions run test:diagrams:render`.

Not completed yet:

- [ ] Renderer-library spikes for JSXGraph and Asymptote against the actual DOCX pipeline.
- [ ] Arc-specific SVG renderer assertions for `angles` and `parallel-lines`.
- [ ] Structured layout diagnostics when label placement fails.
- [ ] Promotion of `angles` or `parallel-lines` from `needs-layout-checks` to `stable`.
- [ ] PNG snapshot/golden fixture policy for CI or artifact review.
- [ ] Reintroduction of any disabled shape or measurement diagram family.

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
| `stable` | `number-line`, `coordinate-plane`, `function-plot`, `fraction-bar`, `pie-chart`, `array`, `pictograph`, `clock`, `spinner`, `bar-graph`, `histogram`, `dot-plot`, `scatter-plot`, `box-plot`, `stem-and-leaf`, `tree-diagram`, `venn-diagram`, `two-way-table` |
| `needs-layout-checks` | `angles`, `parallel-lines` |
| `disabled` | `right-triangle`, `triangle`, `rectangle`, `parallelogram`, `trapezium`, `circle`, `circle-sector`, `elevation`, `depression`, `prism-rect`, `prism-tri`, `cylinder`, `L-shape`, `T-shape`, `rect-triangle`, `rect-semicircle`, `annulus`, `cone`, `pyramid`, `sphere`, `net` |

Prompt/validation risk notes:

- Before phase 1, prompt-visible types and disabled validation lived in separate files.
- Unknown diagram types could pass JSON validation and then disappear during rendering.
- `angles` and `parallel-lines` remain prompt-visible for this first phase to avoid changing production prompt behaviour, but they are marked `needs-layout-checks`.
- The first fixture render confirmed the `parallel-lines` label-overlap failure: angle labels can sit on the transversal.
- `two-way-table` remains native DOCX and is not emitted by the PNG fixture renderer.

Renderer-backend recommendations recorded in the registry:

| Family | Recommendation |
|---|---|
| Number, fraction, array, clock, spinner | Custom SVG is acceptable for now because the layout is finite and simple. |
| Charts and statistics | D3/chart helpers are the preferred candidate where future label and axis layout needs exceed the current custom SVG. |
| Coordinate planes and function plots | JSXGraph is the first candidate because it fits coordinate systems, axes, plotted points, and function curves. |
| Angles and parallel lines | JSXGraph is the first candidate; these stay `needs-layout-checks` until a semantic contract and collision tests exist. |
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
- The next implementation step should add arc-specific renderer assertions and failure diagnostics before moving `angles` or `parallel-lines` out of `needs-layout-checks`.

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

Outcome: angle diagrams become the first geometry-like family to reach stable status.

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
- use leader lines for dimensions by default
- add not-to-scale support where educationally appropriate
- add fixtures for short labels, long labels, small dimensions, and crowded diagrams
- enable in prompt only after tests pass

Acceptance criteria:

- A family is either fully stable or remains disabled.
- No partial shape family is prompt-visible.
- Each family has layout failure tests, not just successful render tests.

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

- Which renderer backend should own each family: custom SVG, JSXGraph, Asymptote, D3/chart helpers, or native DOCX.
- Whether JSXGraph can run cleanly in the backend rendering environment without a brittle browser dependency.
- Whether Asymptote's output quality justifies its non-JS toolchain and deployment cost.
- Whether PNG snapshots should be committed, generated in CI, or stored as test artifacts.
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
