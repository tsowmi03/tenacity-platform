import React from "react";
import Members from "@modules/common/components/team-members/index";

const AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="#d6ebf7"/><circle cx="200" cy="160" r="70" fill="#1c71af"/><path d="M60 400c0-100 63-160 140-160s140 60 140 160" fill="#1c71af"/></svg>`;
const AVATAR = `data:image/svg+xml,${encodeURIComponent(AVATAR_SVG)}`;

const TEAM = [
  { src: AVATAR, title: "Tom Sowmi", description: "Founder & Maths Tutor" },
  { src: AVATAR, title: "Priya Nair", description: "English Tutor" },
  { src: AVATAR, title: "Daniel Chen", description: "Maths Tutor" },
  { src: AVATAR, title: "Emily Wilson", description: "English Tutor" },
  { src: AVATAR, title: "Marcus Lee", description: "Selective Test Coach" },
];

export function Default() {
  return <Members photos={TEAM} />;
}

export function ThreeMembers() {
  return (
    <Members
      photos={[
        { src: AVATAR, title: "Tom Sowmi", description: "Founder & Maths Tutor" },
        { src: AVATAR, title: "Priya Nair", description: "English Tutor" },
        { src: AVATAR, title: "Daniel Chen", description: "Maths Tutor" },
      ]}
    />
  );
}
