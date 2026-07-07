import { ReactNode } from "react";
import { Navigate } from "react-router-dom";

type Props = {
  children: ReactNode;
  loading: boolean;
  isAuthenticated: boolean;
};

export default function ProtectedRoute({ children, loading, isAuthenticated }: Props) {
  if (loading) {
    return (
      <main style={{ padding: "40px 20px" }}>
        <p>Checking authentication...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}
