import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Praxl",
  description: "Praxl Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: April 5, 2026</p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">1. Data Controller</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Praxl (&quot;we&quot;, &quot;us&quot;) is the data controller for personal data processed through this Service.
          For any privacy-related questions or to exercise your rights, contact us at{" "}
          <a href="mailto:hello@praxl.app" className="text-primary underline">hello@praxl.app</a>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">2. Information We Collect</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong>Account Data:</strong> When you sign up, we collect your email address, name, and profile
          image via our authentication provider (Clerk). We do not store passwords - authentication credentials
          are handled by Clerk.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong>Skill Content:</strong> Skills you create, edit, or import (title, description, content,
          version history, tags) are stored in our database to provide the Service.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong>CLI Data:</strong> When using the Praxl CLI, we collect platform type (e.g. Claude Code,
          Cursor), sync status, and a heartbeat timestamp. We do not collect file contents from your machine
          beyond the skills you explicitly sync.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong>Error & Diagnostic Data:</strong> When the app crashes or throws an error, we may collect
          the error message, stack trace, browser metadata, and a session replay with all text masked and
          media blocked. This is used solely for debugging.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong>Billing Data:</strong> If you upgrade to Pro, payment details (card number, billing address)
          are collected and processed directly by our payment processors (Clerk Billing and Stripe). We never
          see or store full card details - only a reference to your subscription and plan status.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">3. Legal Basis for Processing (GDPR)</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We process your personal data under the following legal bases defined in Article 6 of the GDPR:
        </p>
        <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed space-y-1">
          <li><strong>Contract (Art. 6(1)(b)):</strong> to provide the Service you signed up for - account, skill storage, sync, AI features</li>
          <li><strong>Legitimate interest (Art. 6(1)(f)):</strong> to keep the Service secure, prevent abuse, and debug errors</li>
          <li><strong>Consent (Art. 6(1)(a)):</strong> for optional analytics and marketing cookies; you may withdraw consent at any time</li>
          <li><strong>Legal obligation (Art. 6(1)(c)):</strong> to comply with tax and accounting requirements on paid subscriptions</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">4. How We Use Your Information</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We use your information to: provide and maintain the Service, sync your skills across platforms,
          provide AI-powered features (analysis, suggestions, chat), process subscription payments, communicate
          with you about your account, detect and fix errors, and prevent abuse.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We do not sell personal data, do not use it for advertising, and do not share it with third parties
          beyond the sub-processors listed below.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">5. Third-Party Services (Sub-processors)</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We rely on the following sub-processors to deliver the Service. Each has a Data Processing Agreement
          in place and is GDPR-compliant:
        </p>
        <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed space-y-1">
          <li><strong>Clerk</strong> (USA) - authentication, user management, subscription billing</li>
          <li><strong>Stripe</strong> (USA) - payment processing (via Clerk Billing)</li>
          <li><strong>Supabase</strong> (EU region) - PostgreSQL database hosting</li>
          <li><strong>Vercel</strong> (USA, with EU edge) - application hosting and CDN</li>
          <li><strong>Anthropic</strong> (USA) - AI features. When you provide your own API key, requests go directly from your browser to Anthropic and we do not see the content.</li>
          <li><strong>Sentry</strong> (USA) - error tracking and diagnostics (text masked, media blocked)</li>
          <li><strong>GitHub</strong> (USA) - public marketplace skill discovery and optional two-way sync if you connect your GitHub account</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">6. International Data Transfers</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Some of our sub-processors are located outside the European Economic Area (EEA), primarily in the
          United States. These transfers are protected by Standard Contractual Clauses (SCCs) approved by the
          European Commission, and where applicable by the EU-US Data Privacy Framework.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">7. Cookies</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We use the following cookies across Praxl:
        </p>
        <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed space-y-1">
          <li>
            <strong>__session, __client (Clerk, strictly necessary):</strong> keep you signed in and protect
            against session hijacking. Expire on sign-out or after 7 days of inactivity.
          </li>
          <li>
            <strong>praxl_consent (strictly necessary):</strong> stores your cookie preferences for 365 days
            on the .praxl.app domain, so we don&apos;t ask again on every visit.
          </li>
          <li>
            <strong>Analytics cookies (optional, consent-based):</strong> reserved for future use - none are
            currently deployed.
          </li>
          <li>
            <strong>Marketing cookies (optional, consent-based):</strong> reserved for future use - none are
            currently deployed.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground leading-relaxed">
          You can change or withdraw your consent at any time by clicking the &quot;Cookies&quot; link in the
          footer of the landing page. Withdrawing consent does not affect the lawfulness of processing based
          on consent before its withdrawal.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">8. Data Storage and Security</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your data is stored in a PostgreSQL database hosted by Supabase with SSL encryption in transit and
          at rest. We implement HTTP security headers (CSP, HSTS, X-Frame-Options), tRPC-level rate limiting,
          input validation, and a least-privilege access model. No system is 100% secure; we will notify
          affected users without undue delay if a personal data breach occurs, in line with Article 33–34 GDPR.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">9. Your Rights (GDPR)</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          If you are in the EEA, UK, or Switzerland, you have the following rights regarding your personal data:
        </p>
        <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed space-y-1">
          <li><strong>Access (Art. 15):</strong> request a copy of the personal data we hold about you</li>
          <li><strong>Rectification (Art. 16):</strong> correct inaccurate or incomplete data</li>
          <li><strong>Erasure (Art. 17):</strong> delete your account and associated data (&quot;right to be forgotten&quot;)</li>
          <li><strong>Restriction (Art. 18):</strong> ask us to limit processing in specific cases</li>
          <li><strong>Portability (Art. 20):</strong> export your skills as machine-readable files at any time via the app</li>
          <li><strong>Objection (Art. 21):</strong> object to processing based on legitimate interest</li>
          <li><strong>Withdraw consent (Art. 7):</strong> for cookies or any consent-based processing</li>
          <li><strong>Lodge a complaint:</strong> with your local supervisory authority (in Poland: UODO - uodo.gov.pl)</li>
        </ul>
        <p className="text-sm text-muted-foreground leading-relaxed">
          To exercise any of these rights, email{" "}
          <a href="mailto:hello@praxl.app" className="text-primary underline">hello@praxl.app</a>. We will
          respond within 30 days.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">10. Data Retention</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We retain your data for as long as your account is active. When you delete your account, we delete
          your personal data and skills within 30 days, except where we are required to retain data for legal
          or accounting purposes (typically 5 years for invoices). Error logs in Sentry are retained for 30
          days. Aggregated, anonymized usage data may be retained indefinitely.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">11. Children</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The Service is not intended for users under 16 years of age. We do not knowingly collect personal
          data from children. If you believe we have collected data from someone under 16, please contact us.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">12. Changes to This Policy</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We may update this policy from time to time. We will notify you of material changes via the Service
          or email at least 14 days before they take effect. The &quot;Last updated&quot; date above indicates
          the latest revision.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">13. Contact</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          For privacy questions, data access requests, or to withdraw consent:{" "}
          <a href="mailto:hello@praxl.app" className="text-primary underline">hello@praxl.app</a>.
        </p>
      </section>
    </div>
  );
}
