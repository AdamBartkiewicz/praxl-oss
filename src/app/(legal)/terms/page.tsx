import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - Praxl",
  description: "Praxl Terms of Service",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Last updated: April 4, 2026</p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">1. Acceptance of Terms</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          By accessing or using Praxl (&quot;the Service&quot;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">2. Description of Service</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Praxl is an AI skill management platform that allows users to create, edit, version, and deploy AI skills across multiple AI coding tools. The Service includes a web application, CLI tool, and marketplace.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">3. User Accounts</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          You must create an account to use most features of the Service. You are responsible for maintaining the security of your account credentials and for all activity under your account.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">4. User Content</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          You retain ownership of all skills and content you create. By using the Service, you grant Praxl a limited license to store, process, and display your content as needed to provide the Service. You are responsible for ensuring your content does not violate any laws or third-party rights.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">5. Marketplace</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The Marketplace provides access to third-party skills from GitHub repositories. Praxl does not control or endorse third-party content. You install third-party skills at your own risk. Security scanning is provided as a convenience but does not guarantee safety.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">6. AI Features</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The Service uses AI models (via the Anthropic API) for skill analysis, improvement suggestions, and chat features. AI outputs may contain errors and should be reviewed before use. You may need to provide your own API key for AI features.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">7. Prohibited Use</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          You may not use the Service to distribute malware, phishing content, or skills designed to harm users or systems. You may not attempt to bypass security scanning or rate limiting. You may not use the Service for any illegal purpose.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">8. Limitation of Liability</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND. PRAXL SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING FROM YOUR USE OF THE SERVICE.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">9. Changes to Terms</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance. We will notify users of material changes via the Service or email.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">10. Contact</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          For questions about these Terms, contact us at hello@praxl.app.
        </p>
      </section>
    </div>
  );
}
