import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute() {
  const { session, isLoading, isVerified } = useAuth();

  if (isLoading) return null;
  if (!session) return <Navigate to="/" replace />;
  if (!isVerified) return <Navigate to="/verify-email" replace />;
  return <Outlet />;
}
