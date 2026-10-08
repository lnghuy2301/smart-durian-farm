import { type ReactNode, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Inbox, RefreshCw, X, AlertCircle } from 'lucide-react';
import type { Resource } from '../hooks/useResource';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{actions && <div className="actions">{actions}</div>}</div>;
}
export function Notice({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'error' | 'success' | 'warning' }) {
  return <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}><AlertCircle size={18}/><div>{children}</div></div>;
}
export function DataState<T>({ resource, children, empty }: { resource: Resource<T>; children: (data: T) => ReactNode; empty?: boolean }) {
  if (resource.loading) return <div className="data-state" role="status"><RefreshCw className="spin" size={24}/><span>Đang tải dữ liệu…</span></div>;
  if (resource.error) return <div className="data-state"><Notice kind="error">{resource.error.message}</Notice><button className="button secondary" onClick={resource.reload}><RefreshCw size={16}/>Thử lại</button></div>;
  if (empty || resource.data === undefined) return <div className="data-state"><Inbox size={36}/><h3>Chưa có dữ liệu phù hợp</h3><p>Thử đổi bộ lọc hoặc tải lại sau khi dữ liệu được tạo và cấp quyền.</p></div>;
  return children(resource.data);
}
export function Badge({ status }: { status: string }) {
  const labels: Record<string, string> = { Active: 'Đang sử dụng', Inactive: 'Ngừng sử dụng', Pending: 'Chờ duyệt', Reject: 'Đã từ chối', Accepted: 'Đã chấp nhận', Confirmed: 'Đã xác nhận', Draft: 'Bản nháp', Dead: 'Cây chết', Removed: 'Đã loại bỏ', Maintenance: 'Bảo trì', Online: 'Trực tuyến', Offline: 'Mất kết nối', Unknown: 'Chưa có tín hiệu' };
  return <span className={`badge status-${status.toLowerCase()}`}>{labels[status] ?? status}</span>;
}
export function Pagination({ total, offset, limit, onChange }: { total: number; offset: number; limit: number; onChange: (offset: number) => void }) {
  return <div className="pagination"><span>{total ? `${Math.min(offset + 1, total)}–${Math.min(offset + limit, total)} / ${total}` : '0 kết quả'}</span><div className="actions"><button className="button secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}><ArrowLeft size={16}/>Trước</button><button className="button secondary" disabled={offset + limit >= total || offset + limit > 100000} onClick={() => onChange(offset + limit)}>Sau<ArrowRight size={16}/></button></div></div>;
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, []);
  return <dialog ref={dialog} className="modal" onCancel={(event) => { event.preventDefault(); onClose(); }}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="Đóng" onClick={onClose}><X size={20}/></button></div>{children}</dialog>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : 'Chưa có';
export const number = (value: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value);
