import LegalDoc from '../components/LegalDoc';

export default function Privacy() {
  return (
    <LegalDoc
      title="Privacy Policy"
      updated="June 1, 2026"
      intro="This Privacy Policy explains what information KitchenPal collects, how we use it, and the choices you have. KitchenPal is a private recipe app — your recipes are visible only to you."
      sections={[
        {
          heading: 'Information we collect',
          body: [
            'Account information: the email address you sign up with.',
            'Profile information: your display name, dietary preferences, and an optional avatar image.',
            'Your content: recipes you create, import, or generate, along with any photos you upload and the source links you paste.',
          ],
        },
        {
          heading: 'How we use your information',
          body: [
            'To provide the service — store and display your recipes, personalize AI suggestions using your dietary preferences, and generate recommendations and images.',
            'We do not sell your personal information or use it for advertising.',
          ],
        },
        {
          heading: 'AI and third-party processing',
          body: [
            'When you import or generate a recipe, the text, URL, image, or transcript you submit is sent to third-party processors to extract or create the recipe — including OpenAI (recipe extraction, generation, and images), Supadata (video transcripts), and Apify (public social captions). We do not use your data to train AI models.',
            'Your data is stored with Supabase (database and file storage).',
          ],
        },
        {
          heading: 'Data sharing',
          body: [
            'We only share data with the processors listed above as needed to operate KitchenPal. We may disclose information if required by law.',
          ],
        },
        {
          heading: 'Your choices',
          body: [
            'You can edit or delete your recipes, update your profile and dietary preferences, and add or remove your avatar at any time from your Account page.',
            'To request deletion of your account and associated data, contact us using the details below.',
          ],
        },
        {
          heading: 'Changes to this policy',
          body: ['We may update this policy from time to time. Material changes will be reflected by the "Last updated" date above.'],
        },
        {
          heading: 'Contact',
          body: ['Questions about privacy? Email support@kitchenpal.app.'],
        },
      ]}
    />
  );
}
