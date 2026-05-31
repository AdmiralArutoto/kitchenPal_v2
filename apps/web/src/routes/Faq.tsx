import Card from '../components/Card';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How do I add a recipe?',
    a: 'Click “+ Add Recipe” in the nav. You can import from a link, type one in manually, or generate one with AI.',
  },
  {
    q: 'Which links can I import?',
    a: 'Recipe websites, Instagram reels, TikTok videos, and YouTube (including Shorts). If a link can’t be read automatically, you can paste the text or upload a screenshot instead.',
  },
  {
    q: 'Are my recipes private?',
    a: 'Yes. Your recipes are visible only to you — KitchenPal is a private collection, not a social feed.',
  },
  {
    q: 'How does AI generation and modification work?',
    a: 'Describe a dish to generate a draft, or open a saved recipe and use “Modify with AI” to scale it, make it vegan, simplify steps, or swap ingredients. Always review the result before cooking.',
  },
  {
    q: 'Can I scale ingredient amounts?',
    a: 'Yes — open a recipe and use the serving scaler to adjust quantities up or down.',
  },
  {
    q: 'What are the daily recommendations?',
    a: 'Every morning you get a fresh batch of recipe ideas on the Home page, picked based on your dietary preferences. Move any you like into your collection.',
  },
];

export default function Faq() {
  return (
    <div className="mx-auto flex w-full max-w-[896px] flex-col gap-6 px-6 pt-12 pb-20">
      <Card variant="bordered" padding="lg">
        <h1 className="text-3xl font-semibold text-text-default">Frequently asked questions</h1>
        <p className="mt-2 text-base text-text-muted">Quick answers to common questions.</p>

        <div className="mt-6 flex flex-col divide-y divide-black/5">
          {FAQS.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-text-default">
                {item.q}
                <ChevronIcon />
              </summary>
              <p className="mt-2 text-sm leading-6 text-text-body">{item.a}</p>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-text-muted transition-transform group-open:rotate-180"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
