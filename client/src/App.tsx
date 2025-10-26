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
      component: (
        <AuthProvider>
          <AdminLogin />
        </AuthProvider>
      )
    },
    {
      path: '/admin',
      component: (
        <AuthProvider>
          <AdminDashboard />
        </AuthProvider>
      )
    },
    {
      path: '*',
      component: <HomePage /> // Fallback to home for unknown routes
    }
  ];

  return <Router routes={routes} />;
}

export default App;
