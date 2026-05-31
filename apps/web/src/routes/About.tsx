import Card from '../components/Card';

const FEATURES = [
  'AI-powered recipe generation tailored to your preferences',
  'Personal recipe vault with smart organization',
  'Modify existing recipes using AI suggestions',
  'Smart serving scaler for ingredient amounts',
  'Tag-based filtering and search',
];

// Account info now lives under the avatar menu (/account). About keeps just the product blurb.
export default function About() {
  return (
    <div className="mx-auto flex w-full max-w-[896px] flex-col gap-8 px-6 pt-12 pb-20">
      <Card variant="bordered" padding="lg">
        <h2 className="border-b border-black/10 pb-4 text-2xl font-semibold text-text-default">
          About KitchenPal
        </h2>
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-base text-text-body">
            <span className="font-bold">KitchenPal</span> is your personal recipe management
            companion, designed to help you discover, organize, and create delicious recipes with
            the power of AI.
          </p>
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold text-text-default">Features:</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-text-body">
              {FEATURES.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-1 border-t border-black/10 pt-4 text-sm text-text-muted">
            <p>
              <span className="font-bold">Version:</span> 1.0.0
            </p>
            <p>
              <span className="font-bold">Purpose:</span> Private recipe management with AI
              assistance
            </p>
            <p className="italic">Your recipes are private and only visible to you.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
