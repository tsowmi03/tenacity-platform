import React from "react";
import TeamCard from "@modules/common/components/team-card/index";
import Facebook from "@modules/common/icons/facebook";
import Instagram from "@modules/common/icons/instagram";
import Linkedin from "@modules/common/icons/linkedin";

const AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500"><rect width="400" height="500" fill="#d6ebf7"/><circle cx="200" cy="190" r="80" fill="#1c71af"/><path d="M50 500c0-110 67-180 150-180s150 70 150 180" fill="#1c71af"/></svg>`;
const AVATAR = `data:image/svg+xml,${encodeURIComponent(AVATAR_SVG)}`;

const SOCIAL_LINKS = [
  { url: "#", icon: <Facebook size="20" /> },
  { url: "#", icon: <Instagram size="20" /> },
  { url: "#", icon: <Linkedin size="20" /> },
];

export function Default() {
  return (
    <TeamCard
      name="Tom Sowmi"
      jobTitle="Founder & Director"
      imageSrc={AVATAR}
      socialLinks={SOCIAL_LINKS}
    />
  );
}
