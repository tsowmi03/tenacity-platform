#!/usr/bin/env ruby
# Adds prod/staging flavors to Runner.xcodeproj.
#
# Flutter's iOS --flavor support requires, for a flavor named X:
#   - build configurations Debug-X / Release-X / Profile-X
#   - a shared scheme named X
#
# The original Debug/Release/Profile configurations are left in place so an
# unflavored `flutter run` still works.
#
# Idempotent: re-running makes no further changes.

require "xcodeproj"

PROJECT = File.join(__dir__, "Runner.xcodeproj")
BASES = %w[Debug Release Profile].freeze
FLAVORS = {
  "prod"    => { bundle_id: "com.tenacityTutoring.tenacity",         name: "Tenacity" },
  "staging" => { bundle_id: "com.tenacityTutoring.tenacity.staging", name: "Tenacity STG" },
}.freeze

# Profile has no Profile.xcconfig of its own; it builds on Release.
POD_XCCONFIG = { "Debug" => "debug", "Release" => "release", "Profile" => "profile" }.freeze

project = Xcodeproj::Project.open(PROJECT)
runner = project.targets.find { |t| t.name == "Runner" }
tests  = project.targets.find { |t| t.name == "RunnerTests" }
raise "Runner target not found" unless runner

flutter_group = project.main_group.find_subpath("Flutter", true)

def file_ref(group, project, path)
  existing = group.files.find { |f| f.path == path }
  return existing if existing

  group.new_reference(path).tap { |ref| ref.source_tree = "<group>" }
end

# ---------------------------------------------------------------- configurations
BASES.each do |base|
  FLAVORS.each do |flavor, meta|
    name = "#{base}-#{flavor}"

    # Project level
    unless project.build_configurations.any? { |c| c.name == name }
      source = project.build_configurations.find { |c| c.name == base }
      cfg = project.add_build_configuration(name, source.type)
      cfg.build_settings = source.build_settings.dup
      cfg.base_configuration_reference = source.base_configuration_reference
    end

    # Runner target
    unless runner.build_configurations.any? { |c| c.name == name }
      source = runner.build_configurations.find { |c| c.name == base }
      cfg = runner.add_build_configuration(name, source.type)
      cfg.build_settings = source.build_settings.dup
      xcconfig = "Flutter/#{base}-#{flavor}.xcconfig"
      cfg.base_configuration_reference = file_ref(flutter_group, project, xcconfig)
    end

    runner_cfg = runner.build_configurations.find { |c| c.name == name }
    runner_cfg.build_settings["PRODUCT_BUNDLE_IDENTIFIER"] = meta[:bundle_id]
    runner_cfg.build_settings["INFOPLIST_KEY_CFBundleDisplayName"] = meta[:name]
    runner_cfg.build_settings["FLAVOR"] = flavor

    # RunnerTests target: keep it buildable under the new configurations.
    next unless tests

    unless tests.build_configurations.any? { |c| c.name == name }
      source = tests.build_configurations.find { |c| c.name == base }
      cfg = tests.add_build_configuration(name, source.type)
      cfg.build_settings = source.build_settings.dup
      pods = "Target Support Files/Pods-RunnerTests/Pods-RunnerTests.#{POD_XCCONFIG[base]}.xcconfig"
      existing_ref = source.base_configuration_reference
      cfg.base_configuration_reference =
        existing_ref && existing_ref.path == pods ? existing_ref : existing_ref
    end

    tests_cfg = tests.build_configurations.find { |c| c.name == name }
    tests_cfg.build_settings["PRODUCT_BUNDLE_IDENTIFIER"] =
      "#{meta[:bundle_id]}.RunnerTests"
  end
end

# ------------------------------------------------------- copy the right plist
PHASE_NAME = "Copy Firebase config for flavor"
unless runner.build_phases.any? { |p| p.respond_to?(:name) && p.name == PHASE_NAME }
  phase = runner.new_shell_script_build_phase(PHASE_NAME)
  phase.shell_script = <<~SH
    # Bundles the GoogleService-Info.plist matching the active flavor.
    #
    # This has to happen at build time: the firebase_core iOS plugin configures
    # the [DEFAULT] Firebase app from the bundled plist during plugin
    # registration, BEFORE Dart runs. Passing different options to
    # Firebase.initializeApp from Dart then throws [core/duplicate-app], so
    # --dart-define alone cannot point iOS at another project.
    set -e
    FLAVOR="${FLAVOR:-prod}"
    SRC="${SRCROOT}/config/${FLAVOR}/GoogleService-Info.plist"
    if [ ! -f "$SRC" ]; then
      echo "error: no GoogleService-Info.plist for flavor '${FLAVOR}' at $SRC" >&2
      exit 1
    fi
    cp "$SRC" "${BUILT_PRODUCTS_DIR}/${PRODUCT_NAME}.app/GoogleService-Info.plist"
    echo "Bundled ${FLAVOR} GoogleService-Info.plist"
  SH

  # Must run after the app bundle exists.
  runner.build_phases.delete(phase)
  runner.build_phases << phase
end

# ------------------------- stop bundling the single hardcoded prod plist
resources = runner.resources_build_phase
plist = resources.files.find do |f|
  f.file_ref&.path.to_s.end_with?("GoogleService-Info.plist")
end
resources.remove_build_file(plist) if plist

project.save

puts "Runner configurations : #{runner.build_configurations.map(&:name).sort.join(', ')}"
puts "Copy phase present    : #{runner.build_phases.any? { |p| p.respond_to?(:name) && p.name == PHASE_NAME }}"
puts "Plist in resources    : #{resources.files.any? { |f| f.file_ref&.path.to_s.end_with?('GoogleService-Info.plist') }}"
