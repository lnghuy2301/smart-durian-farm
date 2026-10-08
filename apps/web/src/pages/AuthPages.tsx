import { useEffect, useState } from "react";
import { Link, Navigate, Outlet } from "react-router-dom";
import {
  ArrowRight,
  Leaf,
  ShieldCheck,
  Radio,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "../auth/session";
import { publicApi, ApiError } from "../api/client";
import { useTask } from "../hooks/useTask";
import { Brand } from "../components/Brand";
import { Field, Notice } from "../components/ui";
import type { User } from "../types/api";

const phonePattern = "[+]?[0-9]{9,13}";
function Phone({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field
      label="Số điện thoại"
      hint="Dùng đúng số đã đăng ký, kể cả tiền tố +84 hoặc 0."
    >
      <input
        name="phone_number"
        type="tel"
        autoComplete="tel"
        required
        pattern={phonePattern}
        maxLength={13}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </Field>
  );
}
function Password({
  value,
  onChange,
  label = "Mật khẩu",
  fresh = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  fresh?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} hint={fresh ? "Từ 8 đến 128 ký tự." : undefined}>
      <span className="password-input">
        <input
          name={fresh ? "new_password" : "password"}
          type={visible ? "text" : "password"}
          autoComplete={fresh ? "new-password" : "current-password"}
          minLength={8}
          maxLength={128}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </span>
    </Field>
  );
}
function useCooldown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (until <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return {
    seconds: Math.max(0, Math.ceil((until - now) / 1000)),
    start: () => {
      setNow(Date.now());
      setUntil(Date.now() + 60000);
    },
  };
}
export function AuthLayout() {
  const auth = useAuth();
  if (auth.loading)
    return <main className="data-state">Đang kiểm tra phiên đăng nhập…</main>;
  if (auth.session) return <Navigate to="/" replace />;
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand light />
        <div className="auth-story-body">
          <span className="eyebrow">NỀN TẢNG QUẢN LÝ NÔNG NGHIỆP</span>
          <h1>
            Chăm vườn thông minh.
            <br />
            <em>Vững mùa bội thu.</em>
          </h1>
          <p>
            Kết nối nông hộ, hợp tác xã và dữ liệu tại vườn trên cùng một nền
            tảng.
          </p>
          <div className="story-points">
            <span>
              <Leaf />
              Quản lý vườn và từng cây
            </span>
            <span>
              <Radio />
              Theo dõi môi trường từ cảm biến
            </span>
            <span>
              <ShieldCheck />
              Phân quyền theo nhiệm vụ
            </span>
          </div>
        </div>
        <small>SMART DURIAN · Đồng hành cùng nhà vườn</small>
      </section>
      <section className="auth-form-side">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className="auth-card">
          {auth.message && <Notice kind="warning">{auth.message}</Notice>}
          <Outlet />
        </div>
        <p className="auth-footer">
          Smart Durian Farm · Nền tảng quản lý vườn sầu riêng
        </p>
      </section>
    </main>
  );
}
export function LoginPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const auth = useAuth();
  const task = useTask();
  return (
    <>
      <span className="eyebrow">CHÀO MỪNG TRỞ LẠI</span>
      <h1>Đăng nhập</h1>
      <p className="auth-intro">Tiếp tục quản lý vườn và hợp tác xã của bạn.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void task.run(async (signal) => {
            try {
              await auth.login(phone.trim(), password, signal);
            } catch (error) {
              if (error instanceof ApiError && error.status === 401)
                throw new Error("Số điện thoại hoặc mật khẩu chưa đúng.");
              throw error;
            }
          });
        }}
      >
        <fieldset disabled={task.busy}>
          <Phone value={phone} onChange={setPhone} />
          <Password value={password} onChange={setPassword} />
          <div className="auth-form-link">
            <Link to="/forgot-password">Quên mật khẩu?</Link>
          </div>
          {task.error && <Notice kind="error">{task.error}</Notice>}
          <button className="button full" type="submit">
            {task.busy ? "Đang xác thực…" : "Đăng nhập"}
            <ArrowRight size={17} />
          </button>
        </fieldset>
      </form>
      <p className="auth-switch">
        Chưa có tài khoản? <Link to="/register">Đăng ký ngay</Link>
      </p>
    </>
  );
}
interface EmailChallenge {
  verification_id: string;
  expires_in: number;
}
interface EmailProof {
  email_verification_token: string;
  expires_in: number;
}
export function RegisterPage() {
  const [role, setRole] = useState<"Farmer" | "Manager">("Farmer");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gmail, setGmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<EmailChallenge>();
  const [proof, setProof] = useState<EmailProof>();
  const [expiresAt, setExpiresAt] = useState(0);
  const [otp, setOtp] = useState("");
  const [created, setCreated] = useState<User>();
  const [notice, setNotice] = useState("");
  const task = useTask();
  const cooldown = useCooldown();
  function resetEmail() {
    setChallenge(undefined);
    setProof(undefined);
    setOtp("");
    setExpiresAt(0);
    setNotice("");
    task.setError("");
  }
  async function send(signal: AbortSignal) {
    cooldown.start();
    const result = await publicApi.request<EmailChallenge>(
      "auth/registration/email/request",
      {
        method: "POST",
        body: { phone_number: phone.trim(), gmail: gmail.trim() },
        signal,
      },
    );
    setChallenge(result);
    setProof(undefined);
    setOtp("");
    setExpiresAt(Date.now() + result.expires_in * 1000);
    setNotice("Mã xác minh đã được gửi tới email. Hãy kiểm tra cả thư rác.");
  }
  async function submit(signal: AbortSignal) {
    if (role === "Manager" && !proof) {
      if (!challenge) {
        await send(signal);
        return;
      }
      if (Date.now() >= expiresAt)
        throw new Error("Mã xác minh đã hết hạn. Vui lòng gửi mã mới.");
      const verified = await publicApi.request<EmailProof>(
        "auth/registration/email/verify",
        {
          method: "POST",
          body: {
            phone_number: phone.trim(),
            gmail: gmail.trim(),
            verification_id: challenge.verification_id,
            otp,
          },
          signal,
        },
      );
      setProof(verified);
      setOtp("");
      setExpiresAt(Date.now() + verified.expires_in * 1000);
      setNotice(
        "Email đã xác minh. Xác nhận đăng ký để gửi tài khoản chờ Admin duyệt.",
      );
      return;
    }
    if (role === "Manager" && Date.now() >= expiresAt)
      throw new Error("Phiên xác minh đã hết hạn. Hãy xác minh email lại.");
    const result = await publicApi.request<{ message: string; user: User }>(
      "auth/register",
      {
        method: "POST",
        signal,
        body: {
          user_name: name.trim(),
          phone_number: phone.trim(),
          password,
          role,
          ...(gmail.trim() ? { gmail: gmail.trim() } : {}),
          ...(role === "Manager" && proof
            ? { email_verification_token: proof.email_verification_token }
            : {}),
        },
      },
    );
    setCreated(result.user);
    setPassword("");
    resetEmail();
  }
  if (created)
    return (
      <>
        <h1>Đăng ký thành công</h1>
        <Notice kind="success">
          {created.role === "Manager"
            ? "Tài khoản Manager đang chờ Admin duyệt và gắn hợp tác xã. Bạn có thể đăng nhập sau khi được kích hoạt."
            : "Tài khoản Farmer đã được kích hoạt. Đăng nhập để tiếp tục."}
        </Notice>
        <Link className="button full" to="/login">
          Về trang đăng nhập
        </Link>
      </>
    );
  return (
    <>
      <span className="eyebrow">BẮT ĐẦU CÙNG SMART DURIAN</span>
      <h1>Tạo tài khoản</h1>
      <p className="auth-intro">Chọn vai trò phù hợp với công việc của bạn.</p>
      <div className="role-tabs">
        <button
          type="button"
          aria-pressed={role === "Farmer"}
          disabled={task.busy}
          onClick={() => {
            setRole("Farmer");
            resetEmail();
          }}
        >
          <Leaf size={18} />
          Farmer
        </button>
        <button
          type="button"
          aria-pressed={role === "Manager"}
          disabled={task.busy}
          onClick={() => {
            setRole("Manager");
            resetEmail();
          }}
        >
          <ShieldCheck size={18} />
          Manager HTX
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void task.run(submit);
        }}
      >
        <fieldset disabled={task.busy}>
          <Field label="Họ và tên">
            <input
              autoComplete="name"
              required
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Phone
            value={phone}
            onChange={(value) => {
              setPhone(value);
              resetEmail();
            }}
          />
          <Field
            label={
              role === "Manager"
                ? "Email (bắt buộc xác minh)"
                : "Email (không bắt buộc)"
            }
          >
            <input
              type="email"
              autoComplete="email"
              required={role === "Manager"}
              value={gmail}
              onChange={(e) => {
                setGmail(e.target.value);
                resetEmail();
              }}
            />
          </Field>
          <Password fresh value={password} onChange={setPassword} />
          <div className="registration-role-guidance">
            <div
              className="registration-role-message"
              data-active={role === "Farmer"}
              aria-hidden={role !== "Farmer"}
            >
              <Notice>
                Tài khoản Farmer được kích hoạt ngay sau khi đăng ký thành công.
                Bạn có thể đăng nhập để quản lý vườn và công việc được cấp
                quyền.
              </Notice>
            </div>
            <div
              className="registration-role-message"
              data-active={role === "Manager"}
              aria-hidden={role !== "Manager"}
            >
              <Notice>
                Xác minh email để gửi đăng ký Manager. Tài khoản được sử dụng
                sau khi Admin duyệt và gắn hợp tác xã.
              </Notice>
            </div>
          </div>
          {challenge && !proof && (
            <>
              <Field label="Mã xác minh email">
                <input
                  name="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
              </Field>
              <button
                className="button secondary"
                type="button"
                disabled={cooldown.seconds > 0}
                onClick={() => void task.run(send)}
              >
                {cooldown.seconds
                  ? `Gửi lại sau ${cooldown.seconds}s`
                  : "Gửi lại mã"}
              </button>
            </>
          )}
          {proof && (
            <button
              className="button secondary"
              type="button"
              onClick={resetEmail}
            >
              Xác minh email lại
            </button>
          )}
          {notice && <Notice kind="success">{notice}</Notice>}
          {task.error && <Notice kind="error">{task.error}</Notice>}
          <button
            className="button full"
            type="submit"
            disabled={role === "Manager" && !challenge && cooldown.seconds > 0}
          >
            {task.busy
              ? "Đang xử lý…"
              : role === "Farmer" || proof
                ? "Xác nhận đăng ký"
                : challenge
                  ? "Xác minh email"
                  : "Gửi mã xác minh email"}
            <ArrowRight size={17} />
          </button>
        </fieldset>
      </form>
      <p className="auth-switch">
        Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
      </p>
    </>
  );
}
export function ForgotPasswordPage() {
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState("");
  const task = useTask();
  const cooldown = useCooldown();
  async function send(signal: AbortSignal) {
    cooldown.start();
    const result = await publicApi.request<{ message: string }>(
      "auth/forgot-password",
      { method: "POST", signal, body: { phone_number: phone.trim() } },
    );
    setSent(true);
    setNotice(result.message);
  }
  if (done)
    return (
      <>
        <h1>Đã đổi mật khẩu</h1>
        <Notice kind="success">Đăng nhập bằng mật khẩu mới để tiếp tục.</Notice>
        <Link className="button full" to="/login">
          Đăng nhập
        </Link>
      </>
    );
  return (
    <>
      <h1>Khôi phục mật khẩu</h1>
      <p className="auth-intro">
        Nhận mã xác minh qua số điện thoại đã đăng ký.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void task.run(
            sent
              ? async (signal) => {
                  await publicApi.request("auth/reset-password", {
                    method: "POST",
                    signal,
                    body: {
                      phone_number: phone.trim(),
                      otp,
                      new_password: password,
                    },
                  });
                  setPassword("");
                  setOtp("");
                  setDone(true);
                }
              : send,
          );
        }}
      >
        <fieldset disabled={task.busy}>
          <Phone value={phone} onChange={setPhone} disabled={sent} />
          {sent && (
            <>
              <Field label="Mã OTP">
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  required
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
              </Field>
              <Password
                fresh
                label="Mật khẩu mới"
                value={password}
                onChange={setPassword}
              />
              <div className="actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={cooldown.seconds > 0}
                  onClick={() => void task.run(send)}
                >
                  {cooldown.seconds
                    ? `Gửi lại sau ${cooldown.seconds}s`
                    : "Gửi lại OTP"}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setSent(false);
                    setOtp("");
                    setPassword("");
                    setNotice("");
                  }}
                >
                  Đổi số điện thoại
                </button>
              </div>
            </>
          )}
          {notice && <Notice>{notice}</Notice>}
          {task.error && <Notice kind="error">{task.error}</Notice>}
          <button
            className="button full"
            type="submit"
            disabled={!sent && cooldown.seconds > 0}
          >
            {task.busy ? "Đang xử lý…" : sent ? "Đổi mật khẩu" : "Gửi mã OTP"}
          </button>
        </fieldset>
      </form>
      <p className="auth-switch">
        <Link to="/login">Quay lại đăng nhập</Link>
      </p>
    </>
  );
}
