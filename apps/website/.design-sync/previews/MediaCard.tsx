import React from "react";
import MediaCard from "@modules/common/components/media-card/index";

export function Default() {
  return (
    <MediaCard
      mediaItems={[
        {
          title: "Local paper feature: Narwee's top tutoring team",
          description:
            "The St George Leader profiles Tenacity Tutoring's small-group approach to Maths and English.",
          link: "#",
        },
        {
          title: "Parent podcast: building confidence before HSC",
          description:
            "Our director joins the Learning Matters podcast to talk about exam stress and steady progress.",
          link: "#",
        },
      ]}
    />
  );
}

export function ManyItems() {
  return (
    <MediaCard
      mediaItems={[
        {
          title: "Selective school success stories",
          description:
            "Four Narwee families share how targeted prep helped their kids get an offer.",
          link: "#",
        },
        {
          title: "NAPLAN results roundup",
          description:
            "A look at how our Year 5 and Year 7 students performed this year.",
          link: "#",
        },
        {
          title: "Meet the tutors",
          description:
            "Get to know the team behind Tenacity Tutoring's small-group classes.",
          link: "#",
        },
        {
          title: "Term 3 enrolment now open",
          description:
            "Spaces are limited — book a free trial lesson before classes fill up.",
          link: "#",
        },
      ]}
    />
  );
}
