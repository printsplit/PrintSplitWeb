import { useState, useEffect, ReactNode } from 'react';

interface Route {
  path: string;
  component: ReactNode;
}

interface RouterProps {
  routes: Route[];
  basePath?: string;
}

export function Router({ routes, basePath = '/core' }: RouterProps) {
  const [currentPath, setCurrentPath] = useState(() => {
    // Strip the base path to get the route path
    const pathname = window.location.pathname;
    return pathname.startsWith(basePath) ? pathname.slice(basePath.length) || '/' : pathname;
  });

  useEffect(() => {
    const handleNavigation = () => {
      const pathname = window.location.pathname;
      const routePath = pathname.startsWith(basePath) ? pathname.slice(basePath.length) || '/' : pathname;
      setCurrentPath(routePath);
    };

    // Listen for popstate (back/forward buttons)
    window.addEventListener('popstate', handleNavigation);

    return () => {
      window.removeEventListener('popstate', handleNavigation);
    };
  }, [basePath]);

  // Find matching route
  const currentRoute = routes.find(route => {
    if (route.path === currentPath) return true;
    // Simple pattern matching for dynamic routes like /admin/*
    if (route.path.endsWith('/*') && currentPath.startsWith(route.path.slice(0, -2))) {
      return true;
    }
    return false;
  });

  // 404 fallback
  if (!currentRoute) {
    const fallback = routes.find(r => r.path === '*');
    return <>{fallback ? fallback.component : <div>404 - Not Found</div>}</>;
  }

  return <>{currentRoute.component}</>;
}

export function navigate(path: string, basePath = '/core') {
  // Add base path back for browser navigation
  const fullPath = basePath + path;
  window.history.pushState({}, '', fullPath);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function Link({ to, children, ...props }: { to: string; children: ReactNode; [key: string]: any }) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(to);
  };

  return (
    <a href={to} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}
