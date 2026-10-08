import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/session';
import { AuthLayout, LoginPage, RegisterPage, ForgotPasswordPage } from './pages/AuthPages';
import { ProtectedLayout, AdminGuard, AwaitingPage } from './components/Shell';
export function App() {
  return <BrowserRouter><AuthProvider><Routes><Route element={<AuthLayout/>}><Route path="/login" element={<LoginPage/>}/><Route path="/register" element={<RegisterPage/>}/><Route path="/forgot-password" element={<ForgotPasswordPage/>}/></Route><Route element={<ProtectedLayout/>}><Route index element={<AwaitingPage title="Tổng quan"/>}/>{['materials', 'standards', 'farms', 'zones', 'trees', 'tree-harvests', 'cooperatives', 'iot'].map((path) => <Route key={path} path={`${path}/*`} element={<AwaitingPage title={path}/>}/>)}<Route element={<AdminGuard/>}><Route path="pending-managers" element={<AwaitingPage title="Duyệt Manager"/>}/></Route><Route path="*" element={<div className="panel"><h1>Không tìm thấy trang</h1><Link to="/">Về tổng quan</Link></div>}/></Route></Routes></AuthProvider></BrowserRouter>;
}
