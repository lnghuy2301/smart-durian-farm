import { useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Leaf,
  Trees,
  Map,
  Building2,
  Package,
  ClipboardCheck,
  Radio,
  Users,
  LogOut,
  Menu,
  X,
  Sprout,
} from "lucide-react";
import { useAuth, useSession } from "../auth/session";
import { Brand } from "./Brand";
import { Notice, PageHeader } from "./ui";

const nav = [
  { to: "/", title: "Tổng quan", icon: LayoutDashboard },
  { to: "/farms", title: "Vườn trồng", icon: Leaf },
  { to: "/zones", title: "Khu vực", icon: Map },
  { to: "/trees", title: "Cây trồng", icon: Trees },
  { to: "/tree-harvests", title: "Thu hoạch", icon: Sprout },
  { to: "/iot", title: "Giám sát IoT", icon: Radio },
  { to: "/cooperatives", title: "Hợp tác xã", icon: Building2 },
  { to: "/pending-managers", title: "Duyệt Manager", icon: Users, admin: true },
  { to: "/materials", title: "Vật tư", icon: Package },
  { to: "/standards", title: "Tiêu chuẩn", icon: ClipboardCheck },
];
export function ProtectedLayout() {
  const auth = useAuth();
  if (auth.loading)
    return <main className="data-state">Đang kiểm tra phiên…</main>;
  if (!auth.session) return <Navigate to="/login" replace />;
  return <Shell key={auth.session.token} />;
}
function Shell() {
  const { user } = useSession();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const selected = nav.find((item) =>
    item.to === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(item.to),
  );
  const roleLabel = {
    Admin: "Quản trị hệ thống",
    Farmer: "Nhà vườn",
    Manager: "Quản lý hợp tác xã",
  }[user.role];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Đến nội dung chính
      </a>
      {open && (
        <button
          className="nav-backdrop"
          aria-label="Đóng menu"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-brand">
          <Link to="/" onClick={() => setOpen(false)}>
            <Brand />
          </Link>
          <button
            className="icon-button mobile-menu"
            aria-label="Đóng menu"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="section-label">KHÔNG GIAN LÀM VIỆC</span>
          <strong>{roleLabel}</strong>
        </div>
        <nav aria-label="Điều hướng chính">
          {nav
            .filter((item) => !item.admin || user.role === "Admin")
            .map(({ to, title, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={() => setOpen(false)}
              >
                <Icon size={19} />
                {title}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-block">
            <span className="avatar">
              {user.user_name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{user.user_name}</strong>
              <small>{user.role}</small>
            </div>
          </div>
          <button className="logout" onClick={logout}>
            <LogOut size={18} />
            Đăng xuất
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="actions">
            <button
              className="icon-button mobile-menu"
              aria-label="Mở menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb">
              Smart Durian <span>/</span> {selected?.title ?? "Chi tiết"}
            </span>
          </div>
          <span className="topbar-role">
            <span className="status-dot" />
            {roleLabel}
          </span>
        </header>
        <main id="main-content" tabIndex={-1} className="page-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          Smart Durian Farm · Quản lý nông nghiệp thông minh
        </footer>
      </div>
    </div>
  );
}
export function AdminGuard() {
  return useSession().user.role === "Admin" ? (
    <Outlet />
  ) : (
    <>
      <PageHeader title="Không có quyền truy cập" />
      <Notice kind="warning">Trang này dành cho Admin.</Notice>
      <Link className="button" to="/">
        Về tổng quan
      </Link>
    </>
  );
}
export function ManagerAwaitingPage() {
  return (
    <>
      <PageHeader
        title="Không gian Manager"
        subtitle="Quản lý dữ liệu hợp tác xã trong phạm vi được cấp quyền."
      />
      <div className="panel">
        <Notice>
          Dashboard Manager đang chờ mẫu giao diện riêng. Bạn có thể sử dụng các
          trang dữ liệu trong menu.
        </Notice>
      </div>
    </>
  );
}
