import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiClient, apiBaseUrl, publicApi } from "../api/client";
import type { LoginResponse, User } from "../types/api";
import { tokenDeadline } from "./token";

const storageKey = "smart-durian.access-token";
function storedToken() {
  try {
    return sessionStorage.getItem(storageKey);
  } catch {
    return null;
  }
}
function persist(token?: string) {
  try {
    if (token) sessionStorage.setItem(storageKey, token);
    else sessionStorage.removeItem(storageKey);
  } catch {
    /* Phiên trong RAM vẫn dùng được khi storage bị chặn. */
  }
}
interface Session {
  user: User;
  api: ApiClient;
  deadline: number;
  token: string;
}
interface AuthState {
  session?: Session;
  loading: boolean;
  message: string;
  login: (
    phone: string,
    password: string,
    signal: AbortSignal,
  ) => Promise<void>;
  logout: () => void;
}
const Context = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const active = useRef<ApiClient | undefined>(undefined);
  const generation = useRef(0);
  function close(reason = "") {
    generation.current++;
    active.current?.dispose();
    active.current = undefined;
    persist();
    setSession(undefined);
    setLoading(false);
    setMessage(reason);
  }
  async function establish(
    token: string,
    deadline: number,
    signal: AbortSignal,
  ) {
    const current = ++generation.current;
    active.current?.dispose();
    const api = new ApiClient(apiBaseUrl, token, () => {
      if (current === generation.current)
        close(
          "Phiên đã hết hạn hoặc tài khoản đã thay đổi. Vui lòng đăng nhập lại.",
        );
    });
    active.current = api;
    try {
      const user = await api.request<User>("auth/me", { signal });
      if (current !== generation.current || signal.aborted)
        throw new DOMException("Đã huỷ", "AbortError");
      if (
        !["Admin", "Manager", "Farmer"].includes(user.role) ||
        user.status !== "Active" ||
        deadline <= Date.now()
      )
        throw new Error("Tài khoản hoặc phiên đăng nhập không hợp lệ.");
      persist(token);
      setMessage("");
      setSession({ user, api, deadline, token });
      setLoading(false);
    } catch (error) {
      api.dispose();
      if (current === generation.current) {
        active.current = undefined;
        persist();
        setSession(undefined);
        setLoading(false);
      }
      throw error;
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    const token = storedToken();
    const deadline = token ? tokenDeadline(token) : undefined;
    if (token && deadline && deadline > Date.now()) {
      void establish(token, deadline, controller.signal).catch(
        (error: unknown) => {
          if (!controller.signal.aborted)
            setMessage(
              error instanceof Error
                ? error.message
                : "Không khôi phục được phiên.",
            );
        },
      );
    } else {
      persist();
      setLoading(false);
      if (token) setMessage("Phiên đăng nhập đã hết hạn.");
    }
    return () => {
      controller.abort();
      active.current?.dispose();
    };
    // Chỉ khôi phục một lần khi mount; các phiên mới dùng login bên dưới.
  }, []);
  useEffect(() => {
    if (!session) return;
    const check = () => {
      if (Date.now() >= session.deadline)
        close("Phiên đăng nhập đã hết 15 phút. Vui lòng đăng nhập lại.");
    };
    const timer = setTimeout(check, Math.max(0, session.deadline - Date.now()));
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [session]);
  async function login(phone: string, password: string, signal: AbortSignal) {
    const response = await publicApi.request<LoginResponse>("auth/login", {
      method: "POST",
      body: { phone_number: phone, password },
      signal,
    });
    const deadline = tokenDeadline(response.access_token);
    if (!deadline || deadline <= Date.now())
      throw new Error("Máy chủ trả phiên không hợp lệ.");
    await establish(
      response.access_token,
      Math.min(deadline, Date.now() + response.expires_in * 1000),
      signal,
    );
  }
  return (
    <Context.Provider
      value={{ session, loading, message, login, logout: () => close() }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("Thiếu AuthProvider");
  return value;
}
export function useSession() {
  const { session } = useAuth();
  if (!session) throw new Error("Thiếu phiên đăng nhập");
  return session;
}
