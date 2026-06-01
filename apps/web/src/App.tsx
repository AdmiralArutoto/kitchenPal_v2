import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import ToastViewport from './components/ToastViewport';
import ProtectedRoute from './components/ProtectedRoute';
import AuthedLayout from './components/AuthedLayout';
import Auth from './routes/Auth';
import VerifyEmail from './routes/VerifyEmail';
import Home from './routes/Home';
import Catalog from './routes/Catalog';
import About from './routes/About';
import CookMode from './routes/CookMode';
import Account from './routes/Account';
import Settings from './routes/Settings';
import Contact from './routes/Contact';
import Privacy from './routes/Privacy';
import Terms from './routes/Terms';
import Faq from './routes/Faq';
import { queryClient } from './lib/queryClient';

const router = createBrowserRouter([
  { path: '/', element: <Auth /> },
  { path: '/verify-email', element: <VerifyEmail /> },
  {
    element: <ProtectedRoute />,
    children: [
      // Full-screen takeover — intentionally OUTSIDE AuthedLayout (no nav/footer while cooking).
      { path: '/cookmode', element: <CookMode /> },
      {
        element: <AuthedLayout />,
        children: [
          { path: '/home', element: <Home /> },
          { path: '/catalog', element: <Catalog /> },
          { path: '/about', element: <About /> },
          { path: '/account', element: <Account /> },
          { path: '/settings', element: <Settings /> },
          { path: '/contact', element: <Contact /> },
          { path: '/privacy', element: <Privacy /> },
          { path: '/terms', element: <Terms /> },
          { path: '/faq', element: <Faq /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
          <ToastViewport />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
