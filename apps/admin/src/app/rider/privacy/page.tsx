import Link from "next/link";
export default function Page() {
  return (
    <main className="r-onboarding">
      <article className="r-onboarding-card">
        <span className="r-eyebrow">RIDER PRIVACY / PILOT DRAFT</span>
        <h1>
          Your work.
          <br />
          Your information.
        </h1>
        <p>
          Operator: [registered business name], [registration number], [business
          address]. Privacy contact: [support email / phone]. These details must
          be completed before public launch.
        </p>
        <br />
        <p>
          We use your account identity, name and phone number to review rider
          applications and coordinate assignments. Approved riders see the
          pickup and recipient information needed for their assigned packages.
          Package events record who confirmed pickup and delivery and when. Delivery fees and verified payments are retained for operational and
          financial reconciliation.
        </p>
        <br />
        <p>
          Background notifications are optional. Enabling them stores a browser
          push endpoint and encryption keys with your rider account so we can
          send assignment and account alerts through your browser’s push
          provider. Notification previews omit recipient details. Disable alerts
          in the rider workspace or browser settings to stop them on that
          device. Browser providers also process push delivery metadata.
        </p>
        <br />
        <p>
          iGO does not collect live rider GPS location in this web app. Opening
          a Google map shares the saved pickup/delivery address with Google.
          External Google Maps navigation is governed by{" "}
          <a
            href="https://maps.google.com/help/terms_maps/"
            className="underline"
          >
            Google Maps terms
          </a>{" "}
          and{" "}
          <a href="https://policies.google.com/privacy" className="underline">
            Google’s privacy policy
          </a>
          .
        </p>
        <br />
        <p>
          Access is limited to authorized operational users and service
          providers including Clerk (identity), Supabase (database) and the
          website host. Use recipient information only to fulfill assigned
          deliveries. Never share login credentials or export recipient details
          for unrelated purposes.
        </p>
        <br />
        <p>
          Contact iGO to request correction, access or removal of personal
          information. Operational, financial and audit records may need to be
          retained; iGO must publish its retention periods and complete this
          notice before launch.
        </p>
        <Link className="r-back" href="/rider">
          ← Back to rider workspace
        </Link>
      </article>
    </main>
  );
}
