export const REFERRAL_SOURCE_OPTIONS = [
  {
    code: "friend_family",
    label: "Friend or family",
    detailLabel: "Who referred you?",
  },
  {
    code: "existing_family",
    label: "Existing Tenacity family",
    detailLabel: "Family name",
  },
  {
    code: "google",
    label: "Google Search or Maps",
  },
  {
    code: "social_media",
    label: "Facebook or Instagram",
  },
  {
    code: "community",
    label: "School, church, or community",
    detailLabel: "Which organisation?",
  },
  {
    code: "tutoring_provider",
    label: "MarksPlus or another tutoring provider",
    detailLabel: "Which provider?",
  },
  {
    code: "flyer_signage",
    label: "Flyer or signage",
  },
  {
    code: "other",
    label: "Other",
    detailLabel: "Referral detail",
  },
  {
    code: "prefer_not_to_say",
    label: "Prefer not to say",
  },
];

export function referralSourceOption(code) {
  return REFERRAL_SOURCE_OPTIONS.find((option) => option.code === code);
}

export function referralSourceLabel(code) {
  return referralSourceOption(code)?.label || "Not recorded";
}
