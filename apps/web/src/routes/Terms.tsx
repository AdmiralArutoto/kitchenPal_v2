import LegalDoc from '../components/LegalDoc';

export default function Terms() {
  return (
    <LegalDoc
      title="Terms of Service"
      updated="June 1, 2026"
      intro="By creating an account or using KitchenPal, you agree to these Terms. Please read them carefully."
      sections={[
        {
          heading: 'Using KitchenPal',
          body: [
            'KitchenPal is provided for your personal, non-commercial recipe management. You are responsible for activity under your account and for keeping your login credentials secure.',
          ],
        },
        {
          heading: 'Your content',
          body: [
            'You retain ownership of the recipes and content you create or upload. You grant KitchenPal the limited rights needed to store, process, and display that content back to you as part of the service.',
            'When you import a recipe from a website or social post, the original recipe remains the property of its creator. KitchenPal shows source attribution where available.',
          ],
        },
        {
          heading: 'AI-generated content',
          body: [
            'AI features can produce inaccurate or incomplete results. Always review a recipe — especially ingredients, quantities, cooking times, and allergens — before cooking. AI output is provided "as is" with no guarantee of accuracy or fitness for any purpose.',
          ],
        },
        {
          heading: 'Acceptable use',
          body: [
            'Do not misuse the service, attempt to disrupt it, access other users’ data, or upload unlawful, infringing, or harmful content.',
          ],
        },
        {
          heading: 'Disclaimers',
          body: [
            'KitchenPal is provided without warranties of any kind. We are not responsible for cooking outcomes, dietary or allergic reactions, or reliance on any recipe or AI suggestion.',
          ],
        },
        {
          heading: 'Limitation of liability',
          body: [
            'To the maximum extent permitted by law, KitchenPal and its operators are not liable for any indirect, incidental, or consequential damages arising from your use of the service.',
          ],
        },
        {
          heading: 'Changes and termination',
          body: [
            'We may update these Terms or change, suspend, or discontinue the service at any time. Continued use after changes means you accept the updated Terms.',
          ],
        },
        {
          heading: 'Contact',
          body: ['Questions about these Terms? Email support@kitchenpal.app.'],
        },
      ]}
    />
  );
}
