import { useState } from 'react';
import { useCreateRecipe } from '../hooks/useRecipes';
import Modal from './Modal';
import RecipeEditForm, { type RecipeFormValues } from './RecipeEditForm';

type Props = {
  onClose: () => void;
};

const EMOJIS = ['🍝', '🥗', '🍕', '🥘', '🍳', '🍔', '🌮', '🍣', '🍜', '🥪', '🥟', '🍲', '🥞', '🍱', '🍰'];

// Add Recipe modal from Figma 8:9872. Wraps RecipeEditForm; emoji auto-assigned at mount.
// On submit → optimistic insert + background POST /api/recipes with source: 'manual'.
export default function AddRecipeModal({ onClose }: Props) {
  const [emoji] = useState(() => EMOJIS[Math.floor(Math.random() * EMOJIS.length)]!);
  const createMutation = useCreateRecipe();

  function handleSave(values: RecipeFormValues) {
    createMutation.mutate({
      name: values.name,
      description: values.description,
      ingredients: values.ingredients,
      steps: values.steps,
      tags: values.tags,
      cookingTime: values.cookingTime,
      servings: values.servings,
      emoji: values.emoji ?? emoji,
      source: 'manual',
    });
    onClose();
  }

  return (
    <Modal open ariaLabel="Add new recipe" onClose={onClose}>
      <RecipeEditForm
        title="Add New Recipe"
        subtitle="Create a new recipe for your collection"
        initialValues={{
          name: '',
          description: null,
          cookingTime: null,
          servings: 2,
          ingredients: [],
          steps: [],
          tags: [],
          emoji,
        }}
        onCancel={onClose}
        onSave={handleSave}
        saving={false}
        submitLabel="Add Recipe"
      />
    </Modal>
  );
}
