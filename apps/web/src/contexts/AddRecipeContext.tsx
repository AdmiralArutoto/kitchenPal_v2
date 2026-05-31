import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import AddRecipeChooser from '../components/AddRecipeChooser';

type AddRecipeContextValue = {
  openAddRecipe: () => void;
};

const AddRecipeContext = createContext<AddRecipeContextValue | null>(null);

// Hosts the "+ Add Recipe" intake chooser so any authed view (the global Nav button, the Catalog
// header, an empty state) can open the single chooser instance. Rendered inside AuthedLayout, which
// sits within the Router, so the chooser's navigation/query hooks have their providers.
export function AddRecipeProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openAddRecipe = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ openAddRecipe }), [openAddRecipe]);

  return (
    <AddRecipeContext.Provider value={value}>
      {children}
      {open && <AddRecipeChooser onClose={() => setOpen(false)} />}
    </AddRecipeContext.Provider>
  );
}

export function useAddRecipe(): AddRecipeContextValue {
  const ctx = useContext(AddRecipeContext);
  if (!ctx) throw new Error('useAddRecipe must be used within AddRecipeProvider');
  return ctx;
}
