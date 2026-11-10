import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, RequireAuth } from './auth';
import { Login } from './pages/Login';
import { Workspace } from './pages/Workspace';
import { EditorPage } from './pages/EditorPage';
import './app.css';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Workspace />} />
          <Route path="/doc/:id" element={<EditorPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="bottom-center" richColors closeButton />
    </AuthProvider>
  );
}