import orchard from "../assets/auth/durian-orchard-morning.png";
import { Brand } from "./Brand";
import "./AuthIntroPanel.css";

export function AuthIntroPanel() {
  return (
    <section className="auth-story auth-intro-panel">
      <img className="auth-intro-photo" src={orchard} alt="" />
      <div className="auth-intro-overlay" aria-hidden="true" />
      <Brand light />
      <div className="auth-intro-copy">
        <span className="auth-intro-label">SMART DURIAN</span>
        <h1 className="auth-intro-title">
          Chăm sóc thông minh.
          <br />
          Nguồn gốc rõ ràng.
        </h1>
        <p className="auth-intro-description">
          Kết nối nhà vườn, hợp tác xã và dữ liệu canh tác — từ chăm sóc đến
          truy xuất nguồn gốc sầu riêng.
        </p>
      </div>
      <small className="auth-intro-footer">
        Smart Durian · Đồng hành cùng nhà vườn
      </small>
    </section>
  );
}
