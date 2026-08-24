import { Navigate, Route, Routes } from 'react-router-dom';
import { ProfileProvider, useProfile } from './state/profileStore';
import OnboardingChat from './screens/OnboardingChat';
import Disclosure from './screens/Disclosure';
import Dashboard from './screens/Dashboard';
import type { ReactNode } from 'react';

function RequireProfile({ children }: { children: ReactNode }) {
  const { state } = useProfile();
  if (!state) return <Navigate to="/onboarding" replace />;
  return children;
}

function Home() {
  const { state } = useProfile();
  return <Navigate to={state ? '/dashboard' : '/onboarding'} replace />;
}

export default function App() {
  return (
    <ProfileProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/onboarding" element={<OnboardingChat />} />
        <Route path="/disclosure" element={<Disclosure />} />
        <Route
          path="/dashboard"
          element={
            <RequireProfile>
              <Dashboard />
            </RequireProfile>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ProfileProvider>
  );
}
