import LegalPage from "@modules/legal/LegalPage";
import Link from "next/link";

// The family enrolment Terms & Conditions, word for word from the PDF this
// page replaced (public/T&Cs.pdf, WEB-9). Change the wording only as a
// deliberate update to the terms. These are not the app's terms of use, which
// families accept in the app.
export default function Terms() {
  return (
    <LegalPage
      title="Terms & Conditions"
      description="The terms families agree to when they enrol with Tenacity Tutoring: intellectual property, privacy, fees and charges."
      canonicalPath="/terms"
      intro={
        <>
          The terms you agree to when you enrol a student with Tenacity
          Tutoring. For how this website handles your information, see our{" "}
          <Link href="/privacy">privacy policy</Link>.
        </>
      }
    >
      <h2 id="intellectual-property">Intellectual property notice</h2>
      <p>
        The logos, graphics, pictures, design, and layout (&ldquo;Contents&rdquo;)
        of all resources given to students, electronically or otherwise, are the
        exclusive property of Tenacity Tutoring. The Contents shall not be
        reproduced, attached, copied, or linked to or from, any website or any
        other print or electronic medium without the express written consent of
        Tenacity Tutoring.
      </p>

      <h2 id="privacy">Privacy policy</h2>
      <p>
        Tenacity Tutoring (&ldquo;Tenacity&rdquo;) is bound by the Privacy Act
        1988 (Cth) (&ldquo;Privacy Act&rdquo;) and will protect your personal
        information in accordance with the Australian Privacy Principles. These
        principles govern how we can collect, use, hold and disclose your
        personal information. Protecting your privacy and the confidentiality of
        your personal information is fundamental to the way Tenacity does
        business.
      </p>
      <p>
        We advise that much of the information that you may have provided or may
        be asked to provide to Tenacity is &lsquo;personal information&rsquo; as
        defined by the Privacy Act. Tenacity collects and holds personal
        information such as the student&rsquo;s name, gender, date of birth, age,
        school year, address, and the parents/guardians&rsquo; details such as
        their names and contact details.
      </p>
      <p>
        We typically collect and hold such information by requesting students to
        fill out a Student Enrolment Form which is completed by the
        student&rsquo;s parent or guardian. We may store your information in hard
        copy or electronic format, in storage facilities that we own and operate
        ourselves, or that are owned and operated by our service providers. We
        take reasonable steps to maintain the security of your information and to
        protect it from unauthorised disclosures.
      </p>
      <p>
        Collection of your personal information is required for the following
        purposes:
      </p>
      <ul>
        <li>Monitoring and improving the performance of students</li>
        <li>
          Developing and improving Tenacity learning materials and instructional
          methods
        </li>
        <li>Providing training to employees and instructors of Tenacity</li>
        <li>
          Any other purposes the student&rsquo;s parent/carer has been given
          notice of in the Enrolment form or otherwise.
        </li>
      </ul>
      <p>
        We may also use your personal information to keep you informed of
        upcoming events and/or to offer you our products or services that we
        believe may interest you. If you do not want to receive such
        communications from us, please contact us.
      </p>
      <p>
        In accordance with the Australian Privacy Principles, your personal
        information may only be disclosed (i) to you and your parent/guardian (if
        you are a minor), or (ii) as may be required or authorised by or under an
        Australian law or a court/tribunal order.
      </p>
      <p>
        You are entitled to access your personal information held by Tenacity
        upon request. If you wish to access or correct your personal information
        held by Tenacity, please contact us on{" "}
        <a href="tel:0401455112">0401 455 112</a> or at{" "}
        <a href="mailto:admin@tenacitytutoring.com">admin@tenacitytutoring.com</a>.
      </p>

      <h2 id="fees">Fees and charges</h2>
      <p>
        In the event that the fees are not paid by the due date as indicated on
        the invoice, Tenacity reserves the right to charge reasonable
        administrative fees or late payment charges to recover outstanding
        amounts. Parents will be informed of any applicable late fees in advance.
      </p>
      <p>
        If a student is unable to attend a scheduled lesson, Tenacity may, at its
        discretion, offer a make-up lesson based on availability. However, refunds
        or partial credits will not be issued for missed lessons unless otherwise
        agreed in writing.
      </p>
      <p>
        Tenacity may, at its discretion, offer discounts based on specific
        promotions, sibling enrolments, or other criteria. Any applicable
        discounts will be clearly communicated to parents before enrolment.
      </p>
      <p>
        Tenacity reserves its right to change its days of operation or close for a
        certain period of time due to public holidays or holiday periods (e.g.
        over the Christmas/New Year period) and/or any unforeseeable event (e.g.
        an act of God). In such an event, Tenacity will advise parents of such
        change as early as practicable through written and/or direct
        communication.
      </p>
      <p>
        Tenacity reserves the right to modify these Terms and Conditions,
        including fees and policies. Parents will be provided with at least 14
        days&rsquo; written notice of any significant changes.
      </p>

      <h2 id="agreement">Agreement and contact information</h2>
      <p>
        By enrolling a student with Tenacity Tutoring, you acknowledge and agree
        to these Terms and Conditions.
      </p>
      <p>For any questions or concerns, please contact us at:</p>
      <p>
        Phone: <a href="tel:0401455112">0401 455 112</a>
        <br />
        Email:{" "}
        <a href="mailto:admin@tenacitytutoring.com">admin@tenacitytutoring.com</a>
      </p>
    </LegalPage>
  );
}
