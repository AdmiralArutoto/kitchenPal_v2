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
import { queryClient } from './lib/queryClient';

const router = createBrowserRouter([
  { path: '/', element: <Auth /> },
  { path: '/verify-email', element: <VerifyEmail /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AuthedLayout />,
        children: [
          { path: '/home', element: <Home /> },
          { path: '/catalog', element: <Catalog /> },
          { path: '/about', element: <About /> },
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
