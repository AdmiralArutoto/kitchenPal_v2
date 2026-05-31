import { Link } from 'react-router-dom';
import Card from '../components/Card';

const SUPPORT_EMAIL = 'support@kitchenpal.app';

export default function Contact() {
  return (
    <div className="mx-auto flex w-full max-w-[896px] flex-col gap-6 px-6 pt-12 pb-20">
      <Card variant="bordered" padding="lg">
        <h1 className="text-3xl font-semibold text-text-default">Contact us</h1>
        <p className="mt-2 text-base leading-7 text-text-body">
          Have a question, found a bug, or want to suggest a feature? We’d love to hear from you.
        </p>

        <div className="mt-6 flex flex-col gap-4">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="flex items-center gap-3 rounded-xl border border-border-subtle p-4 transition-colors hover:border-primary hover:bg-bg-page"
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-primary">
              <MailIcon />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-text-default">Email</span>
              <span className="text-sm text-text-muted">{SUPPORT_EMAIL}</span>
            </span>
          </a>

          <p className="text-sm text-text-muted">
            We typically reply within a couple of business days. For quick answers, check the{' '}
            <Link to="/faq" className="font-medium text-primary hover:underline">
              FAQ
            </Link>
            .
          </p>
        </div>
      </Card>
    </div>
  );
}

function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}
