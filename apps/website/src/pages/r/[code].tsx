import type { GetServerSideProps } from "next";
import { getAdminDb } from "@lib/firebaseAdmin";
import { lookupReferrer, normaliseReferralCode } from "@lib/referralCodes";

/**
 * `/r/<code>`: a parent's referral link, shared from the app.
 *
 * Always lands on enrolment, never an error page. A code no one owns is
 * dropped so the form doesn't claim a referral that isn't there. If the lookup
 * itself fails, a well-formed code is kept: the register API checks it again
 * on submit, so a passing outage never costs a family their referral.
 */
export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const code = normaliseReferralCode(params?.code);
  let keep = false;

  if (code) {
    try {
      keep = Boolean(await lookupReferrer(getAdminDb(), code));
    } catch (error) {
      console.error("Referral code lookup failed:", error);
      keep = true;
    }
  }

  return {
    redirect: {
      destination: keep ? `/register?ref=${code}` : "/register",
      permanent: false,
    },
  };
};

export default function ReferralRedirect() {
  return null;
}
