import { Link } from 'react-router-dom';

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 font-display text-xl font-semibold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function Terms() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-teal">Terms</p>
      <h1 className="mb-2 font-display text-3xl font-bold">Terms of use</h1>
      <p className="mb-8 text-sm text-muted">
        BizTransform is a student prototype built for a university unit (ICT313). These plain-language terms explain
        what to expect. They are not legal advice.
      </p>

      <Section title="What this is">
        <p>
          A tool that asks 15 yes/no questions about your business, scores your digital maturity, and suggests a
          roadmap of next steps. It is a starting point for thinking, not a professional assessment.
        </p>
      </Section>

      <Section title="Please be aware">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Results depend entirely on your own answers. Scores, sector comparisons and roadmaps are indicative only.
            Sector comparisons come from the few businesses on this platform and may include demonstration data.
          </li>
          <li>
            Roadmaps may be written by an AI service. AI can be wrong or generic, so check suggestions, prices and
            terms with each provider before acting. Vendor links are examples, not endorsements.
          </li>
          <li>
            Nothing here is financial, legal or business advice. Any cost or benefit figures you enter are your own
            estimates.
          </li>
          <li>
            The service is provided as is, may change or be removed, and may have mistakes or downtime. Don&apos;t rely
            on it for anything important, and keep your own copies of anything you need.
          </li>
        </ul>
      </Section>

      <Section title="Your account">
        <ul className="list-disc space-y-1 pl-5">
          <li>Keep your password private. Use a password you don&apos;t use anywhere else.</li>
          <li>Only enter information you are entitled to share. Don&apos;t enter sensitive personal information.</li>
          <li>Don&apos;t try to break, overload or probe the service, or access other people&apos;s data.</li>
          <li>We may deactivate accounts that misuse the service.</li>
          <li>
            You can delete your account yourself, with all the data linked to it, from your{' '}
            <Link to="/account" className="text-teal hover:underline">
              account page
            </Link>
            .
          </li>
        </ul>
      </Section>

      <Section title="Sharing reports">
        <p>
          You can create a link that lets anyone who has it read a summary of your latest report until it expires or
          you revoke it. Only share it with people you trust, and revoke it when you no longer need it.
        </p>
      </Section>

      <Section title="Privacy">
        <p>
          How information is collected, used and shared is explained in the{' '}
          <Link to="/privacy" className="text-teal hover:underline">
            privacy notice
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}
