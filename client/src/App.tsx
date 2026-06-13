import { Router } from './components/Router';
import { AuthProvider } from './context/AuthContext';
import { HomePage } from './pages/HomePage';
import { AdminLogin } from './pages/AdminLogin';
import { AdminDashboard } from './pages/AdminDashboard';
import './App.css';

function App() {
  const routes = [
    {
      path: '/',
      component: <HomePage />
    },
    {
      path: '/admin/login',
      component: <AdminLogin />
    },
    {
      path: '/admin',
      component: <AdminDashboard />
    },
    {
      path: '*',
      component: <HomePage /> // Fallback to home for unknown routes
    }
  ];

  // A single AuthProvider wraps the whole router so auth state is shared across
  // routes (login → dashboard) instead of each route holding its own instance.
  return (
    <AuthProvider>
      <Router routes={routes} />
    </AuthProvider>
  );
}

export default App;
