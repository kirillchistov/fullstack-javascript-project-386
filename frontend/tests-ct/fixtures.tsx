import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../src/auth';
import LoginPage from '../src/pages/LoginPage';

/**
 * Экран входа в окружении, приближенном к приложению: роутер и AuthProvider.
 * Маршрут /admin — заглушка, чтобы проверить переход после успешного входа.
 */
export function LoginScreen() {
  return (
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<div>Экран кабинета владельца</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}
