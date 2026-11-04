"use strict";

// RES-57. The diagram types and skills the question bank tags questions with,
// as agreed in docs/architecture/res-54-question-bank-spec.md (sections 2 and
// 5). The response schemas are built from these lists, so the model can only
// return a type and skill that exist here. Every skill list ends with "other"
// so a question that fits none of them isn't forced into the wrong one.

const DIAGRAM_TYPES = Object.freeze({
  shape_2d: {
    covers: "2D and composite shapes: area, perimeter, circles and sectors",
    skills: ["perimeter_polygon", "circumference_arc_length", "area_rectangle_triangle", "area_parallelogram_trapezium_rhombus_kite",
      "area_circle_sector_annulus", "area_composite", "missing_length_from_area_or_perimeter", "name_classify_shapes"],
  },
  solid_3d: {
    covers: "3D solids, nets and cross-sections: surface area and volume",
    skills: ["faces_edges_vertices_nets", "volume_prism_cylinder", "volume_pyramid_cone_sphere", "surface_area_prism_cylinder",
      "surface_area_pyramid_cone_sphere", "composite_solid", "missing_dimension_from_volume_or_area", "capacity_units"],
  },
  scale_drawing: {
    covers: "scale drawings, floor plans and maps",
    skills: ["actual_length_from_scale", "find_scale_factor", "area_or_cost_from_plan", "map_distance_or_grid_reference"],
  },
  right_triangle: {
    covers: "right-angled triangles for Pythagoras' theorem and trigonometric ratios",
    skills: ["label_sides_write_ratio", "find_hypotenuse", "find_shorter_side", "test_right_angled", "trig_find_side_numerator",
      "trig_find_side_denominator", "trig_find_angle", "exact_values", "two_triangles_multi_step", "three_dimensional"],
  },
  non_right_triangle: {
    covers: "non-right-angled triangles: sine rule, cosine rule, area of a triangle",
    skills: ["sine_rule_side", "sine_rule_angle", "cosine_rule_side", "cosine_rule_angle", "area_half_ab_sin_c", "choose_rule_multi_step"],
  },
  elevation_bearings: {
    covers: "angles of elevation and depression, compass and true bearings",
    skills: ["elevation_depression", "read_or_draw_bearing", "bearing_travel_problem", "bearings_non_right"],
  },
  angle_relationships: {
    covers: "parallel lines, angles at a point, triangle and polygon angle sums",
    skills: ["point_line_vertically_opposite", "parallel_lines_transversal", "triangle_angle_sum_exterior", "isosceles_equilateral",
      "polygon_angle_sum", "geometric_reasoning_proof"],
  },
  congruence_similarity: {
    covers: "congruent and similar figures, enlargements",
    skills: ["identify_congruent", "congruence_test_proof", "similar_scale_factor_missing_side", "similar_triangles_proof",
      "enlargement_area_volume_ratio"],
  },
  circle_geometry: {
    covers: "parts of a circle and the chord, tangent and angle theorems",
    skills: ["parts_of_circle", "angle_centre_circumference", "angles_same_segment_semicircle", "cyclic_quadrilateral",
      "chord_properties", "tangent_properties", "circle_proof"],
  },
  transformations: {
    covers: "reflections, rotations, translations, symmetry and tessellations",
    skills: ["reflect", "translate", "rotate", "describe_or_combine_transformations", "line_rotational_symmetry", "tessellation"],
  },
  number_plane: {
    covers: "points, segments or shapes on the number plane: distance, midpoint, gradient",
    skills: ["plot_read_points", "distance", "midpoint", "gradient", "shapes_on_plane"],
  },
  straight_line: {
    covers: "straight-line graphs, simultaneous equations shown graphically, linear models",
    skills: ["plot_from_equation_or_table", "gradient_intercepts_from_graph", "equation_from_graph", "parallel_perpendicular",
      "simultaneous_graphical", "linear_model_real_world", "travel_graph"],
  },
  parabola: {
    covers: "quadratic graphs (parabolas)",
    skills: ["sketch_from_equation", "equation_from_graph", "vertex_axis_of_symmetry", "transformations", "quadratic_model",
      "line_parabola_intersection"],
  },
  other_curve: {
    covers: "polynomial, hyperbola, circle, exponential, logarithmic and absolute value graphs",
    skills: ["polynomial_sketch_roots", "hyperbola_asymptotes", "circle_equation", "exponential_growth_decay", "logarithmic",
      "absolute_value", "function_transformations", "inverse_function", "domain_range_from_graph", "solve_graphically"],
  },
  trig_graph: {
    covers: "trigonometric graphs and the unit circle",
    skills: ["sketch_amplitude_period_phase", "equation_from_graph", "unit_circle_exact_values", "solve_trig_graphically"],
  },
  calculus_graph: {
    covers: "tangents, derivative graphs, areas under curves and motion graphs",
    skills: ["tangent_gradient_at_point", "sketch_derivative", "stationary_points_curve_sketch", "area_under_between_curves",
      "rates_motion_graphs", "optimisation"],
  },
  region_inequality: {
    covers: "inequalities on a number line or the number plane, and regions",
    skills: ["number_line_inequality", "linear_region", "curved_region", "describe_region_from_graph"],
  },
  data_display: {
    covers: "column, line, pie and picture graphs, histograms, dot plots, stem-and-leaf plots, box plots, scatter plots",
    skills: ["read_interpret_graph", "construct_graph", "histogram_frequency_polygon", "dot_plot_stem_leaf_stats", "box_plot",
      "scatter_plot_line_of_best_fit", "cumulative_frequency_quartiles", "misleading_graph"],
  },
  normal_curve: {
    covers: "normal distribution curves",
    skills: ["z_scores", "empirical_rule", "compare_distributions", "probability_from_area"],
  },
  probability_diagram: {
    covers: "tree diagrams, Venn diagrams and two-way tables",
    skills: ["tree_with_replacement", "tree_without_replacement", "venn_union_intersection_complement", "two_way_table_conditional"],
  },
  network: {
    covers: "networks: paths, shortest paths, spanning trees, critical paths and flow",
    skills: ["terminology_degree_paths", "shortest_path", "minimum_spanning_tree", "critical_path", "flow_max_min_cut"],
  },
  vectors: {
    covers: "vector diagrams (Extension 1)",
    skills: ["add_subtract_diagram", "magnitude_direction_components", "vector_proof", "projection"],
  },
  mechanics: {
    covers: "projectile, force, resisted motion and simple harmonic motion diagrams (Extension 1 and 2)",
    skills: ["projectile", "forces_resisted_motion", "simple_harmonic_motion"],
  },
});

const TYPE_IDS = Object.freeze(Object.keys(DIAGRAM_TYPES));

function skillsFor(type) {
  const entry = DIAGRAM_TYPES[type];
  if (!entry) throw new Error(`Unknown diagram type: ${type}`);
  return [...entry.skills, "other"];
}

// Skills are returned as "type/skill" so one enum covers every type, and a
// skill can be checked against the figure's type afterwards.
function skillIds(types = TYPE_IDS) {
  return types.flatMap((type) => skillsFor(type).map((skill) => `${type}/${skill}`));
}

function splitSkillId(id) {
  const [type, skill] = String(id).split("/");
  return { type, skill };
}

module.exports = { DIAGRAM_TYPES, TYPE_IDS, skillIds, skillsFor, splitSkillId };
