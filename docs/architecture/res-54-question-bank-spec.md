# RES-54 — Question bank spec

What the Drive extraction keeps and how each question is tagged. Agreed with
Tom on 2026-11-04, skill lists included.

Background: [`res-54-phase-1-corpus.md`](res-54-phase-1-corpus.md).

## 1. Scope

| Decision | In | Out |
|---|---|---|
| Subject | Maths | English diagrams. English stays searchable through its text |
| Content | Questions, worked examples, and data tables a question uses | Explanations, decoration (mascots, icons, photos that only illustrate) and blank answer frames |
| Sources | NSW textbooks, Victorian textbooks, Mathletics, HSC material, Years 5–6 primary, and school past papers from THSC Online in Resources/Maths/Past Papers (Years 9–10 first; permission from THSC Online's maintainers, November 2026) | Years 3–4, teacher editions that have a student edition, answer and solution files (these are for answer linking later) |

## 2. Diagram types (23)

| Group | id | Covers |
|---|---|---|
| Measurement | `shape_2d` | 2D and composite shapes: area, perimeter, circles and sectors |
| | `solid_3d` | 3D solids, nets, cross-sections: surface area, volume |
| | `scale_drawing` | Scale drawings, floor plans, maps |
| Geometry | `right_triangle` | Pythagoras, trig ratios |
| | `non_right_triangle` | Sine rule, cosine rule, area of a triangle |
| | `elevation_bearings` | Angles of elevation and depression, compass and true bearings |
| | `angle_relationships` | Parallel lines, angles at a point, triangle and polygon angle sums |
| | `congruence_similarity` | Congruent and similar figures, enlargements |
| | `circle_geometry` | Parts of a circle, chord, tangent and angle theorems |
| | `transformations` | Reflections, rotations, translations, symmetry, tessellations |
| Graphs | `number_plane` | Points, distance, midpoint, gradient, shapes on the plane |
| | `straight_line` | Linear graphs, simultaneous equations shown graphically, linear models |
| | `parabola` | Quadratic graphs |
| | `other_curve` | Polynomials, hyperbolas, circles, exponentials, logs, absolute value |
| | `trig_graph` | Trig graphs and the unit circle |
| | `calculus_graph` | Tangents, derivative graphs, areas under curves, motion graphs |
| | `region_inequality` | Inequalities on a number line or the plane, regions |
| Statistics and probability | `data_display` | Column, line, pie and picture graphs, histograms, dot plots, stem-and-leaf, box plots, scatter plots |
| | `normal_curve` | Normal distribution curves |
| | `probability_diagram` | Tree diagrams, Venn diagrams, two-way tables |
| Stage 6 | `network` | Networks, shortest paths, spanning trees, critical paths, flow |
| | `vectors` | Vector diagrams (Extension 1) |
| | `mechanics` | Projectiles, forces, resisted motion, simple harmonic motion (Extension 1 and 2) |

## 3. What each question records

| Field | How it is set | Example |
|---|---|---|
| `diagramType` | Model, from the 23 types (one per diagram) | `right_triangle` |
| `skill` | Model, from that type's fixed list in section 5 | `find_shorter_side` |
| `description` | Model, one line of free text | "Find the shorter side of a right-angled triangle given the hypotenuse and one side" |
| `context` | Model: `abstract` or `real_world` | `real_world` (a ladder against a wall) |
| `steps` | Model: `single` or `multi` | `single` |
| `difficulty` | Model: `easy`, `medium` or `hard` for the year the page is written for. Uses the book's signals first (position in the exercise; Problem solving, Reasoning or Challenge sections; marks in a paper), then the question itself. Added 2026-11-04 so a practice paper can end on hard questions | `hard` |
| `topic` | Model, a few words | "Pythagoras' theorem" |
| `yearLevel` | Model, from the page and the book's folder | `Year 9` / `Stage 5.2` |
| `kind` | Model: `question` or `worked_example` | `question` |
| `stem`, `text` | Model, exactly as printed, with maths in LaTeX. Never a description of the diagram; `text` is empty for a part printed as only its letter and a diagram | |
| `diagram` | Crop from the original page | PNG |
| Source | Pipeline | Book path, page number |

The skill and the type are enforced by the response schema: the model can
only pick from the list. Every list ends with `other`, so a question that
fits none of the skills isn't forced into the wrong one. The `description`
captures the nuance either way.

## 4. Cost

Per page, the sorting call costs about $0.0003 and extraction about $0.002,
both on Haiku 5.5. With 23 types, more pages will match than in the 6-type
test, perhaps 40–50% of Maths pages. That puts the full run at about $50–60,
or $25–30 with the Batch API. The extra tags add a few output tokens per
question.

## 5. Skills by diagram type

**`shape_2d`:** `perimeter_polygon` · `circumference_arc_length` ·
`area_rectangle_triangle` · `area_parallelogram_trapezium_rhombus_kite` ·
`area_circle_sector_annulus` · `area_composite` · `missing_length_from_area_or_perimeter` ·
`name_classify_shapes` · `other`

**`solid_3d`:** `faces_edges_vertices_nets` · `volume_prism_cylinder` ·
`volume_pyramid_cone_sphere` · `surface_area_prism_cylinder` ·
`surface_area_pyramid_cone_sphere` · `composite_solid` ·
`missing_dimension_from_volume_or_area` · `capacity_units` · `other`

**`scale_drawing`:** `actual_length_from_scale` · `find_scale_factor` ·
`area_or_cost_from_plan` · `map_distance_or_grid_reference` · `other`

**`right_triangle`:** `label_sides_write_ratio` · `find_hypotenuse` ·
`find_shorter_side` · `test_right_angled` · `trig_find_side_numerator` ·
`trig_find_side_denominator` · `trig_find_angle` · `exact_values` ·
`two_triangles_multi_step` · `three_dimensional` · `other`

**`non_right_triangle`:** `sine_rule_side` · `sine_rule_angle` (including the
ambiguous case) · `cosine_rule_side` · `cosine_rule_angle` · `area_half_ab_sin_c` ·
`choose_rule_multi_step` · `other`

**`elevation_bearings`:** `elevation_depression` · `read_or_draw_bearing` ·
`bearing_travel_problem` · `bearings_non_right` · `other`

**`angle_relationships`:** `point_line_vertically_opposite` ·
`parallel_lines_transversal` · `triangle_angle_sum_exterior` ·
`isosceles_equilateral` · `polygon_angle_sum` · `geometric_reasoning_proof` · `other`

**`congruence_similarity`:** `identify_congruent` · `congruence_test_proof` ·
`similar_scale_factor_missing_side` · `similar_triangles_proof` ·
`enlargement_area_volume_ratio` · `other`

**`circle_geometry`:** `parts_of_circle` · `angle_centre_circumference` ·
`angles_same_segment_semicircle` · `cyclic_quadrilateral` · `chord_properties` ·
`tangent_properties` · `circle_proof` · `other`

**`transformations`:** `reflect` · `translate` · `rotate` ·
`describe_or_combine_transformations` · `line_rotational_symmetry` ·
`tessellation` · `other`

**`number_plane`:** `plot_read_points` · `distance` · `midpoint` · `gradient` ·
`shapes_on_plane` · `other`

**`straight_line`:** `plot_from_equation_or_table` · `gradient_intercepts_from_graph` ·
`equation_from_graph` · `parallel_perpendicular` · `simultaneous_graphical` ·
`linear_model_real_world` · `travel_graph` · `other`

**`parabola`:** `sketch_from_equation` · `equation_from_graph` ·
`vertex_axis_of_symmetry` · `transformations` · `quadratic_model` ·
`line_parabola_intersection` · `other`

**`other_curve`:** `polynomial_sketch_roots` · `hyperbola_asymptotes` ·
`circle_equation` · `exponential_growth_decay` · `logarithmic` ·
`absolute_value` · `function_transformations` · `inverse_function` ·
`domain_range_from_graph` · `solve_graphically` · `other`

**`trig_graph`:** `sketch_amplitude_period_phase` · `equation_from_graph` ·
`unit_circle_exact_values` · `solve_trig_graphically` · `other`

**`calculus_graph`:** `tangent_gradient_at_point` · `sketch_derivative` ·
`stationary_points_curve_sketch` · `area_under_between_curves` ·
`rates_motion_graphs` · `optimisation` · `other`

**`region_inequality`:** `number_line_inequality` · `linear_region` ·
`curved_region` · `describe_region_from_graph` · `other`

**`data_display`:** `read_interpret_graph` · `construct_graph` ·
`histogram_frequency_polygon` · `dot_plot_stem_leaf_stats` · `box_plot` ·
`scatter_plot_line_of_best_fit` · `cumulative_frequency_quartiles` ·
`misleading_graph` · `other`

**`normal_curve`:** `z_scores` · `empirical_rule` · `compare_distributions` ·
`probability_from_area` · `other`

**`probability_diagram`:** `tree_with_replacement` · `tree_without_replacement` ·
`venn_union_intersection_complement` · `two_way_table_conditional` · `other`

**`network`:** `terminology_degree_paths` · `shortest_path` ·
`minimum_spanning_tree` · `critical_path` · `flow_max_min_cut` · `other`

**`vectors`:** `add_subtract_diagram` · `magnitude_direction_components` ·
`vector_proof` · `projection` · `other`

**`mechanics`:** `projectile` · `forces_resisted_motion` ·
`simple_harmonic_motion` · `other`

## 6. Build decisions

Agreed with Tom on 2026-11-04.

| Decision | Choice |
|---|---|
| How the generator uses the bank | Original questions and diagrams exactly as printed, plus new questions asked about the same diagram (a different unknown, with the answer checked). A tutor setting (none / some / mostly) controls how much of a booklet comes from the bank |
| Answers | The book's own printed answer where one is linked (`bookAnswer`, RES-63, section 13); otherwise the generator solves and checks the question as before |
| Review | Questions go live once the 200-page quality check passes. Tutors flag a bad crop or tag from the portal, and admins fix or hide it |
| Tutor UI in v1 | None new: the generator pulls from the bank behind the scenes. A browse-and-pick screen comes later |
| Search | Filters on type, skill, year, context and steps, plus OpenAI embeddings in Firestore vector search. The OpenAI SDK and key are already in Functions |
| Updates | One-off backfill, then a weekly job extracts new or changed Drive files |
| Duplicates across editions | One copy per question, from the newest edition, with every source recorded on it |
| Spending cap for the full run | $100. The run stops and reports if it gets there |
| Quality gate before the full run | 200 random Maths pages: at least 95% of crops complete and at least 90% of pages with a target diagram found |
| Rollout | Built and tested on staging first; the full extraction then writes to production |
| Drive access | A service account with Viewer access to the Tenacity Tutoring shared drive, read through the Drive API |

## 7. Quality check (RES-58, 2026-11-04)

226 random Maths pages from 60 files were run on staging with
`questionBankExtract.js --pages-per-source=5`, then checked by eye with
`questionBankReview.js`.

| Measure | Result |
|---|---|
| Pages | 226; 1 blank, 78 with a target diagram, 147 without |
| Questions | 195, with 228 diagram crops |
| Crops complete (gate ≥ 95%) | 226 of 228 (99.1%); a cylinder missing its height label was found later by the booklet's answer check |
| Pages with a target diagram found (gate ≥ 90%) | 100%; none of the 147 unmatched pages had one |
| Cost | $0.13 at batch rates, about $0.0006 a page |

Two fixes came out of it, and both were checked again on the pages concerned:

- **Crop clean-up:** it could erase a figure that ran right up to its box
  (a circle and its axes). Large shapes are now never treated as a
  neighbour's fragment.
- **Answer pages:** an answers section inside a book was extracted as 8
  "questions" (completed graphs). Both calls now ignore answer and solution
  pages, so those pages also skip the extraction call.

Known limits, left as they are:

- Blank axes and tables that a question asks the student to complete are
  kept as the question's diagram.
- About 1 in 100 crops picks up a sliver of a neighbouring shape or a word
  fragment.

Estimate for the full run: about 44,700 pages × $0.0006 ≈ **$27**, inside the
$100 cap.

## 8. Search and duplicates (RES-59)

| Piece | How it works |
|---|---|
| Embedding | `text-embedding-3-small` at 512 dimensions, from topic, description, type/skill, stem, text and figure descriptions. Stored as `embedding` with `embeddingHash`, so only changed questions are re-embedded |
| Years | `years`: school years as numbers, from the model's year level, else the file path (Mathletics folders, Stage n, HSC courses as 11–12) |
| Search | `searchQuestions` in `src/questionBank/search.js`. Firestore pre-filters on `status == live` and, when given, `diagramType`; the nearest candidates are then filtered on skill, years, context, steps, difficulty and kind. Narrower filters get more candidates (up to 1,000) |
| Indexes | Two flat vector indexes on `questionBank`: (status, embedding) and (status, diagramType, embedding) |
| Duplicates | `questionBankDedupe.js`. Copies come from different files and match on type, skill, kind and every number, with at least 80% of words shared. Parts that share an instruction must share a label too; numberless questions need at least 40% of diagram-description words shared. The newest copy (latest year in its path, then latest Drive modified time) stays live with `sources` listing every copy; the rest get `status: duplicate` and `duplicateOf`. A hidden copy is always the one kept, so hiding it hides all of them |

## 9. Parts that share a diagram (RES-58)

The extraction prompt gives a diagram shared by several parts to the first of
them, so 2b and 2c came back with no figure of their own and were dropped:
38,711 of the 90,477 parts the backfill returned. About half of those were
parts with no printed diagram at all (a "sketch this line" or a word problem),
which rightly stay out. For the rest, `sharedFigureParents` gives each part the
figures of the nearest earlier part with the same instruction or the same
question number, and the record points at that part's crop (`sharedFrom`)
rather than a second copy. `questionBankSharedFigures.js` re-saved the
backfill's pages from the stored batch results, with no model calls.

## 10. The generator (RES-60, bank-first since RES-71, diagram-first since RES-80)

Every maths diagram comes from the bank first; a drawn diagram is the fallback.
Since RES-80 the textbook diagram decides the question: the generated question
only sets the slot's broad skill, difficulty and marks, and the bank question is
written around the crop. Before, a crop had to test the same skill as the
generated question in the same way, so multi-step questions were nearly always
drawn.

| Piece | How it works |
|---|---|
| Setting | None. Every maths resource is bank-first; an older portal's `questionBank` value is accepted and ignored, and new jobs store `first` |
| When | After the questions are written and before any diagram is drawn. A question the bank fills is never drawn; the rest go on to the diagram fill as before |
| Slots | Every question or part that asks for a diagram (`diagramType` other than `none`, or a drawn diagram on older paths), including multiple choice, practice paper sections and topic booklet sub-topics and quiz sections. A question whose parts share its diagram is replaced by one question worth the same marks, with one answer row. A slot whose answer row cannot be matched safely is drawn, and recorded with the reason |
| Skill | The generator gives every maths question and part a `skill`: for a diagram question, the broad skill it tests, worded like a textbook exercise heading ("area of composite shapes", "volume of cylinders"), with no numbers, scenario or method; otherwise "". A part without one uses its question's. A question written before RES-80 has none and is searched and judged on its own wording |
| Search | Per slot: the bank questions nearest "skill, diagram type, topic", from the student's year and the years either side, ranked by year and difficulty (RES-76); the best 8 with one diagram are kept. Every slot is searched before any is filled, and no search holds back another slot's crops. Searches are saved in `resources/checkpoints/<jobId>/bank-search-*.json`, so a later worker reuses them |
| Choose and write | Hardest slots first, in waves of four. Sonnet 5.5 sees up to four crops no earlier wave kept, picks the one that best carries the skill (complete, taught by the student's year), and restates its textbook question or writes a new one on it at the slot's difficulty and marks: a context, a cost, a unit conversion or working backwards, but no other topic, and nothing on the textbook page except the diagram. A crop two slots in one wave choose goes to the harder one; the other tries again without it (recorded as `crop_taken` if it runs out of tries). A refused call is retried once. A multiple-choice question gets four options |
| Check | A second, independent solve from the crop must agree with the answer. When it disagrees, a text-only call reads the final answer from the check's solution and says whether the solution reached one at all; a definite answer goes to a second independent check, and is used (with the check's solution as its working) only if that agrees. Otherwise the slot is drawn, including when the check finds the question itself broken. With a book answer, see section 13 (RES-82: in 19 of 20 rejected questions reviewed the check was right and the writer's arithmetic wrong, and a fresh third solve repeated the writer's slips). Bank answers skip the later answer check, which cannot see the crop |
| Calls | Each call is saved as it finishes. Bank calls are best effort and run four at a time in one worker (the only calls allowed to run side by side); a failed one is recorded and its slot is drawn. A worker spends at most 150 s on the step; anything unfinished carries on in the next worker |
| Storage | A bank diagram is a `source-image` with its Storage path; its bytes are loaded only to build the DOCX, so `generatedJson` stays small and a revision rebuilds it. The diagram repair pass leaves it alone |
| Record | The job's `questionBankUsage` lists each bank question used (question number, part, section, original or new) and, in `skipped`, every diagram that was drawn and why. The portal shows both in the resource's details |

## 11. Flags (RES-61)

Tutors open a resource's details, show its textbook questions with their
original diagrams, and flag one (diagram cut off, wording wrong, answer wrong,
wrong tags, other) with an optional note. Admins see open flags under
"Flagged questions" and hide the question, correct its skill, difficulty, year
level or wording (the skill must belong to its diagram type), or dismiss the
flag. Resolving closes every open flag on that question. A hidden question is
never searched again; an edited one is re-embedded on the next embed run.
All of this goes through one callable, `manageQuestionBank`.

## 12. Weekly update (RES-62)

`.github/workflows/question-bank-weekly.yml` runs every Sunday at 02:00 Sydney
time, and on demand (a dry run by default). It syncs Drive, retires the
questions of removed files and of changed files about to be re-extracted,
extracts new and changed files under a $10 cap, then embeds and merges copies.
A retired question never comes back from a search, and the merge ignores it.
It runs as `tenacity-prod-question-bank` through Workload Identity; that
account and its grants (Firestore, Storage, the two API key secrets, and
Token Creator on `question-bank-drive`) are a one-time setup.

## 13. Book answers (RES-63)

Each bank question can carry its book's printed answer:
`bookAnswer = { answer, via, key, route, answerSource, runId, linkedAt }`.

| Where the answers are | How they are linked |
|---|---|
| Answer section at the back of a book | Haiku reads each answer page; entries match by exercise and number (`ex:7A\|2\|b`) or printed page (`pg:103\|1\|a`). A scanned book's section is found from page images |
| Separate solutions file | Paired by file name, or as the only solutions file in the book's folder; read the same way |
| Mathletics teacher edition | The teacher page with the same words as the student page; answers matched by label |
| Past paper | Solutions after the questions (typed or scanned), a separate solutions file, or an answered second copy; matched by section, number and part |

Guards: no link on a key two answers share; the exercise is dropped where
numbering restarts with no new heading; exercises must run in book order (a
chapter review question naming the exercise it revises is not linked by it);
a sectioned paper question never takes another section's answer.

When the generator restates a question as printed and it has a book answer,
it solves it once (an adapted question is checked as in section 10). Agreement uses the book answer with that working; else a
second solve; if both solves agree against the book, their answer is used and
the question is flagged; if all three differ, the book answer is used with the
working marked unconfirmed, the question is flagged, and the job warns
`BOOK_ANSWER_UNCONFIRMED`.

**Backfill (2026-11-06):** `scripts/questionBankAnswers.js plan|run|write`
linked 30,100 of 56,763 numbered live questions from 1,820 books for $18.
A random audit of 100 links found about 3% linked to the wrong part. Scanned
books link worst (15%). Books added by the weekly update are not yet linked.
