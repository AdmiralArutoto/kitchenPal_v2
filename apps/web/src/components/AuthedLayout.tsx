import { Outlet } from 'react-router-dom';
import { AddRecipeProvider } from '../contexts/AddRecipeContext';
import { usePrefetchOnLogin } from '../hooks/usePrefetchOnLogin';
import Nav from './Nav';
import Footer from './Footer';

export default function AuthedLayout() {
  usePrefetchOnLogin();
  return (
    <AddRecipeProvider>
      {/* App background (bg-app) frames a centered content sheet (bg-page) so the content column reads
          as a distinct surface on wide screens. */}
      <div className="flex min-h-screen flex-col bg-bg-app">
        <Nav />
        <main className="flex flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col bg-bg-page">
            <Outlet />
          </div>
        </main>
        <Footer />
      </div>
    </AddRecipeProvider>
  );
}
