import type { GetServerSideProps } from "next";
import { captureServerEvent } from "@lib/analyticsServer";
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
export const getServerSideProps: GetServerSideProps = async ({
  params,
  req,
}) => {
  const code = normaliseReferralCode(params?.code);
  let keep = false;
  let codeValid = false;
  let lookupFailed = false;

  if (code) {
    try {
      codeValid = Boolean(await lookupReferrer(getAdminDb(), code));
      keep = codeValid;
    } catch (error) {
      console.error("Referral code lookup failed:", error);
      keep = true;
      lookupFailed = true;
    }
  }

  // The code itself is never sent: it identifies the referring parent.
  await captureServerEvent(
    "referral_link_opened",
    { code_valid: codeValid, lookup_failed: lookupFailed },
    { cookies: req.cookies }
  );

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
