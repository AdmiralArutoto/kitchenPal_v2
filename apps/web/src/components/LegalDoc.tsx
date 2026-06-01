import Card from './Card';

export type LegalSection = { heading: string; body: string[] };

type Props = {
  title: string;
  updated: string;
  intro?: string;
  sections: LegalSection[];
};

// Shared layout for static legal/policy pages (Privacy, Terms): a titled card with dated sections.
export default function LegalDoc({ title, updated, intro, sections }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-[896px] flex-col gap-6 px-6 pt-12 pb-20">
      <Card variant="bordered" padding="lg">
        <h1 className="font-serif text-3xl font-semibold text-text-default">{title}</h1>
        <p className="mt-1 text-sm text-text-muted">Last updated: {updated}</p>
        {intro && <p className="mt-4 text-base leading-7 text-text-body">{intro}</p>}

        <div className="mt-6 flex flex-col gap-6">
          {sections.map((s) => (
            <section key={s.heading} className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-text-default">{s.heading}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="text-sm leading-6 text-text-body">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </Card>
    </div>
  );
}
