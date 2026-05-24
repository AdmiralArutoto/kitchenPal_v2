import { Outlet } from 'react-router-dom';
import Nav from './Nav';
import Footer from './Footer';

export default function AuthedLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
