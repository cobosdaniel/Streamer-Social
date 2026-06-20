import { useEffect, useState, ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { API_BASE } from "../env";

type Props = {
  children: ReactNode;
};


export default function ProtectedRoute({ children }: Props) {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch(`${API_BASE}/api/me`, {
          method: "GET",
          credentials: "include",
        });

        setIsAuthenticated(response.ok);
      } catch (error) {
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, []);

  if (loading) {
    return (
      <main style={{ padding: "40px 20px" }}>
        <p>Checking authentication...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}