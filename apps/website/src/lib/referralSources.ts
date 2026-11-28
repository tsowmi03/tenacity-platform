export const REFERRAL_SOURCE_OPTIONS = [
  {
    code: "friend_family",
    label: "Friend or family",
    detailLabel: "Who can we thank?",
    detailPlaceholder: "Their name",
  },
  {
    code: "existing_family",
    label: "Existing Tenacity family",
    detailLabel: "Which family can we thank?",
    detailPlaceholder: "Their name",
  },
  {
    code: "google",
    label: "Google Search or Maps",
  },
  {
    code: "google_ad",
    label: "Google ad",
  },
  {
    code: "ai_assistant",
    label: "AI assistant (ChatGPT, Gemini)",
  },
  {
    code: "social_media",
    label: "Facebook or Instagram",
  },
  {
    code: "community",
    label: "School, church, or community",
    detailLabel: "Which school, church, or community? (optional)",
  },
  {
    code: "tutoring_provider",
    label: "MarksPlus or another tutoring provider",
    detailLabel: "Which tutoring provider? (optional)",
  },
  {
    code: "flyer_signage",
    label: "Flyer or signage",
  },
  {
    code: "other",
    label: "Other",
    detailLabel: "Please tell us where you heard about us (optional)",
  },
  {
    code: "prefer_not_to_say",
    label: "Prefer not to say",
  },
] as const;

export type ReferralSourceCode =
  (typeof REFERRAL_SOURCE_OPTIONS)[number]["code"];

type ReferralSourceOption = {
  code: ReferralSourceCode;
  label: string;
  detailLabel?: string;
  /** Hint text inside the detail box. The box is never required. */
  detailPlaceholder?: string;
};

export const isReferralSourceCode = (
  value: string
): value is ReferralSourceCode =>
  REFERRAL_SOURCE_OPTIONS.some((option) => option.code === value);

export const referralSourceOption = (
  value: string
): ReferralSourceOption | undefined =>
  REFERRAL_SOURCE_OPTIONS.find((option) => option.code === value);
