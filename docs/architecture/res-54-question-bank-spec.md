# RES-54 — Question bank spec

What the Drive extraction keeps and how each question is tagged. Agreed with
Tom on 2026-11-04, skill lists included.

Background: [`res-54-phase-1-corpus.md`](res-54-phase-1-corpus.md).

## 1. Scope

| Decision | In | Out |
|---|---|---|
| Subject | Maths | English diagrams. English stays searchable through its text |
| Content | Questions, worked examples, and data tables a question uses | Explanations, decoration (mascots, icons, photos that only illustrate) and blank answer frames |
| Sources | NSW textbooks, Victorian textbooks, Mathletics, HSC material, Years 5–6 primary | Years 3–4, teacher editions that have a student edition, answer and solution files (these are for answer linking later) |

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
| `topic` | Model, a few words | "Pythagoras' theorem" |
| `yearLevel` | Model, from the page and the book's folder | `Year 9` / `Stage 5.2` |
| `kind` | Model: `question` or `worked_example` | `question` |
| `stem`, `text` | Model, verbatim, with maths in LaTeX | |
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
| Answers until answer linking exists | The generator solves and checks each bank question, as it does for generated ones. Phase 2 replaces these with the book's own answers |
| Review | Questions go live once the 200-page quality check passes. Tutors flag a bad crop or tag from the portal, and admins fix or hide it |
| Tutor UI in v1 | None new: the generator pulls from the bank behind the scenes. A browse-and-pick screen comes later |
| Search | Filters on type, skill, year, context and steps, plus OpenAI embeddings in Firestore vector search. The OpenAI SDK and key are already in Functions |
| Updates | One-off backfill, then a weekly job extracts new or changed Drive files |
| Duplicates across editions | One copy per question, from the newest edition, with every source recorded on it |
| Spending cap for the full run | $100. The run stops and reports if it gets there |
| Quality gate before the full run | 200 random Maths pages: at least 95% of crops complete and at least 90% of pages with a target diagram found |
| Rollout | Built and tested on staging first; the full extraction then writes to production |
| Drive access | A service account with Viewer access to the Tenacity Tutoring shared drive, read through the Drive API |
