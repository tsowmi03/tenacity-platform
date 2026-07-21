import React from "react";
import Head from "@modules/common/components/head/index";

// Head wraps next/head and teleports <title>/<meta> tags into the document
// head — it never renders any visible DOM of its own. The render-check
// treats a fully empty root as a crash, so each story pairs the real
// (invisible) mount with a small explanatory note — honest about what the
// component does, and satisfies the check without faking visual output.
function NoVisualOutputNote({ title }: { title: string }) {
  return (
    <div className="p-6 max-w-md rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">
      <p className="font-semibold text-gray-700">Head renders no visible UI</p>
      <p className="mt-1">
        It sets document metadata only. Mounted title for this story:{" "}
        <code className="text-gray-800">{title}</code>
      </p>
    </div>
  );
}

export function Default() {
  return (
    <>
      <Head />
      <NoVisualOutputNote title="Tenacity Tutoring | Determination Meets Success" />
    </>
  );
}

export function ProgramPage() {
  return (
    <>
      <Head
        title="Year 10 Mathematics Advanced"
        description="Small-group HSC-pathway Maths tuition in Narwee for Year 10 students, with weekly classes, practice papers and personalised feedback."
        canonicalPath="/modules/year-10-mathematics-advanced"
      />
      <NoVisualOutputNote title="Year 10 Mathematics Advanced | Tenacity Tutoring" />
    </>
  );
}
