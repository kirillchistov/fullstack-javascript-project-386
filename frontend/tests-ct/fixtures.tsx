import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../src/auth';
import BookingPage from '../src/pages/BookingPage';
import LoginPage from '../src/pages/LoginPage';

/** Экран входа с заглушкой кабинета после успешного логина */
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

/** Страница бронирования по slug (как /u/kirill) */
export function BookingScreen({ slug = 'kirill' }: { slug?: string }) {
  return (
    <MemoryRouter initialEntries={[`/u/${slug}`]}>
      <Routes>
        <Route path="/u/:slug" element={<BookingPage />} />
      </Routes>
    </MemoryRouter>
  );
}
