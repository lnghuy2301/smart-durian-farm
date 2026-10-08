import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Building2, Plus, Pencil, RefreshCw, Search } from 'lucide-react';
import { useSession } from '../auth/session';
import { queryString } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useTask } from '../hooks/useTask';
import { Badge, DataState, Field, Notice, PageHeader, Pagination, dateTime } from '../components/ui';
import type { Cooperative, CooperativeDetail, CooperativeInput, Page } from '../types/api';

export const emptyCooperative: CooperativeInput = { cooperative_name: '', director: '', certificate_number: '', address: '', contact_number: '' };
export function CooperativeFields({ value, onChange }: { value: CooperativeInput; onChange: (value: CooperativeInput) => void }) {
  const field = (key: keyof CooperativeInput, next: string) => onChange({ ...value, [key]: next });
  return <div className="form-grid"><Field label="Tên hợp tác xã"><input required maxLength={40} autoComplete="organization" value={value.cooperative_name} onChange={(e) => field('cooperative_name', e.target.value)}/></Field><Field label="Người đại diện / giám đốc"><input required maxLength={40} value={value.director} onChange={(e) => field('director', e.target.value)}/></Field><Field label="Số chứng nhận"><input required maxLength={24} value={value.certificate_number} onChange={(e) => field('certificate_number', e.target.value)}/></Field><Field label="Số điện thoại liên hệ"><input required type="tel" pattern="[+]?[0-9]{9,13}" maxLength={14} value={value.contact_number} onChange={(e) => field('contact_number', e.target.value)}/></Field><div className="full-column"><Field label="Địa chỉ"><textarea required maxLength={255} value={value.address} onChange={(e) => field('address', e.target.value)}/></Field></div></div>;
}
export function cleanCooperative(value: CooperativeInput): CooperativeInput {
  return { cooperative_name: value.cooperative_name.trim(), director: value.director.trim(), certificate_number: value.certificate_number.trim(), address: value.address.trim(), contact_number: value.contact_number.trim() };
}
export function CooperativeList() {
  const { api, user } = useSession(); const [params, setParams] = useSearchParams(); const q = (params.get('q') ?? '').slice(0, 100);
  const rawOffset = Number(params.get('offset') ?? 0); const offset = Number.isInteger(rawOffset) && rawOffset >= 0 && rawOffset <= 100000 ? rawOffset : 0;
  const [search, setSearch] = useState(q); useEffect(() => setSearch(q), [q]);
  const path = `cooperatives${queryString({ q, limit: 20, offset })}`;
  const load = useCallback((signal: AbortSignal) => api.request<Page<Cooperative>>(path, { signal }), [api, path]); const resource = useResource(path, load);
  return <><PageHeader title="Hợp tác xã" subtitle={user.role === 'Manager' ? 'Thông tin hợp tác xã bạn đang quản lý.' : 'Danh sách hợp tác xã trong hệ thống.'} actions={<><button className="button secondary" onClick={resource.reload}><RefreshCw size={16}/>Làm mới</button>{user.role === 'Admin' && <Link className="button" to="/cooperatives/new"><Plus size={17}/>Thêm hợp tác xã</Link>}</>}/><div className="panel"><form className="toolbar" onSubmit={(e) => { e.preventDefault(); setParams(search.trim() ? { q: search.trim() } : {}); }}><Field label="Tìm tên HTX, số chứng nhận hoặc địa chỉ"><input maxLength={100} value={search} onChange={(e) => setSearch(e.target.value)}/></Field><button type="submit" className="button secondary"><Search size={17}/>Tìm kiếm</button></form><DataState resource={resource} empty={resource.data?.items.length === 0}>{(data) => <div className="table-scroll"><table><thead><tr><th>Tên hợp tác xã</th><th>Người đại diện</th><th>Địa chỉ</th><th>Manager</th><th>Thao tác</th></tr></thead><tbody>{data.items.map((coop) => <tr key={coop.id}><td><Link className="item-name" to={`/cooperatives/${coop.id}`}>{coop.cooperative_name}</Link><small>{coop.certificate_number}</small></td><td>{coop.director}<small>{coop.contact_number}</small></td><td>{coop.address}</td><td><Badge status={coop.manager_id ? 'Active' : 'Pending'}/><small>{coop.manager_id ? 'Đã có Manager' : 'Chưa có Manager'}</small></td><td><div className="actions"><Link className="icon-button" aria-label={`Chi tiết ${coop.cooperative_name}`} to={`/cooperatives/${coop.id}`}><ArrowUpRight size={17}/></Link>{user.role === 'Admin' && <Link className="icon-button" aria-label={`Sửa ${coop.cooperative_name}`} to={`/cooperatives/${coop.id}/edit`}><Pencil size={17}/></Link>}</div></td></tr>)}</tbody></table></div>}</DataState>{resource.data && <Pagination {...resource.data} onChange={(value) => setParams((previous) => { const next = new URLSearchParams(previous); next.set('offset', String(value)); return next; })}/>}</div>{user.role === 'Admin' && <CooperativeNotifications/>}</>;
}
export function CooperativeDetailPage() {
  const { id = '' } = useParams(); const { api, user } = useSession(); const location = useLocation();
  const load = useCallback((signal: AbortSignal) => api.request<CooperativeDetail>(`cooperatives/${id}`, { signal }), [api, id]); const resource = useResource(id, load);
  const success = location.state && typeof location.state === 'object' && 'success' in location.state && typeof location.state.success === 'string' ? location.state.success : '';
  return <><PageHeader title="Thông tin hợp tác xã" actions={<Link className="button secondary" to="/cooperatives"><ArrowLeft size={16}/>Danh sách HTX</Link>}/>{success && <Notice kind="success">{success}</Notice>}<DataState resource={resource}>{(coop) => <><section className="panel"><div className="panel-heading"><div className="actions"><span className="section-icon"><Building2/></span><div><span className="section-label">HỢP TÁC XÃ</span><h2>{coop.cooperative_name}</h2></div></div>{user.role === 'Admin' && <Link className="button secondary" to={`/cooperatives/${coop.id}/edit`}><Pencil size={16}/>Chỉnh sửa</Link>}</div><dl className="details"><div><dt>Người đại diện / giám đốc</dt><dd>{coop.director}</dd></div><div><dt>Số chứng nhận</dt><dd>{coop.certificate_number}</dd></div><div><dt>Địa chỉ</dt><dd>{coop.address}</dd></div><div><dt>Điện thoại liên hệ</dt><dd>{coop.contact_number}</dd></div><div><dt>Quản lý HTX</dt><dd>{coop.manager_id ? 'Đã gắn Manager' : 'Chưa có Manager'}</dd></div><div><dt>Ngày tạo</dt><dd>{dateTime(coop.lifecycle.created_at)}</dd></div></dl></section>{!coop.manager_id && <section className="panel"><h2>Bổ sung Manager</h2><Notice kind="warning">HTX chưa có Manager sẽ được cảnh báo sau 7 ngày; sau 30 ngày có thể bị xóa tự động nếu không có dữ liệu liên quan.</Notice><dl className="details"><div><dt>Mốc cảnh báo</dt><dd>{dateTime(coop.lifecycle.warning_at)}</dd></div><div><dt>Mốc xét xóa tự động</dt><dd>{dateTime(coop.lifecycle.deletion_due_at)}</dd></div></dl>{user.role === 'Admin' && <Link className="button" to="/pending-managers">Duyệt và gắn Manager</Link>}</section>}</>}</DataState></>;
}
export function CooperativeEditor() {
  const { id } = useParams();
  return id ? <LoadEditor id={id}/> : <CooperativeForm/>;
}
function LoadEditor({ id }: { id: string }) {
  const { api } = useSession(); const load = useCallback((signal: AbortSignal) => api.request<CooperativeDetail>(`cooperatives/${id}`, { signal }), [api, id]); const resource = useResource(id, load);
  return <DataState resource={resource}>{(data) => <CooperativeForm key={data.id} initial={data}/>}</DataState>;
}
function CooperativeForm({ initial }: { initial?: CooperativeDetail }) {
  const [value, setValue] = useState<CooperativeInput>(initial ? cleanCooperative(initial) : { ...emptyCooperative }); const task = useTask(); const { api } = useSession(); const navigate = useNavigate();
  return <><PageHeader title={initial ? 'Chỉnh sửa hợp tác xã' : 'Thêm hợp tác xã'} subtitle="Thông tin pháp lý và liên hệ của hợp tác xã." actions={<Link className="button secondary" to={initial ? `/cooperatives/${initial.id}` : '/cooperatives'}><ArrowLeft size={16}/>Quay lại</Link>}/><form className="panel" onSubmit={(e) => { e.preventDefault(); void task.run(async (signal) => {
    const clean = cleanCooperative(value); let body: Partial<CooperativeInput> = clean;
    if (initial) { body = Object.fromEntries(Object.entries(clean).filter(([key, next]) => initial[key as keyof CooperativeInput] !== next)); if (!Object.keys(body).length) throw new Error('Bạn chưa thay đổi thông tin nào.'); }
    const result = await api.request<Cooperative>(initial ? `cooperatives/${initial.id}` : 'cooperatives', { method: initial ? 'PATCH' : 'POST', body, signal });
    navigate(`/cooperatives/${result.id}`, { replace: true, state: { success: initial ? 'Đã lưu thông tin hợp tác xã.' : 'Đã tạo hợp tác xã. Hãy duyệt Manager để gắn người quản lý.' } });
  }); }}><fieldset disabled={task.busy}><h2 className="form-title">Thông tin hợp tác xã</h2><CooperativeFields value={value} onChange={setValue}/>{!initial && <Notice>HTX được tạo chưa có Manager. Bạn gắn Manager khi duyệt tài khoản đang chờ.</Notice>}{task.error && <Notice kind="error">{task.error} Nếu kết nối bị gián đoạn, kiểm tra danh sách hoặc chi tiết HTX trước khi gửi lại.</Notice>}<div className="form-actions"><Link className="button secondary" to={initial ? `/cooperatives/${initial.id}` : '/cooperatives'}>Hủy</Link><button type="submit" className="button">{task.busy ? 'Đang lưu…' : initial ? 'Lưu thay đổi' : 'Tạo hợp tác xã'}</button></div></fieldset></form></>;
}
interface CooperativeNotification { id: string; cooperative_name: string; type: 'ManagerMissing' | 'DeletionBlocked' | 'CooperativeDeleted'; created_at: string; manager_deadline: string }
function CooperativeNotifications() {
  const { api } = useSession(); const [offset, setOffset] = useState(0); const path = `cooperative-notifications${queryString({ limit: 20, offset })}`;
  const load = useCallback((signal: AbortSignal) => api.request<Page<CooperativeNotification>>(path, { signal }), [api, path]); const resource = useResource(path, load);
  const labels: Record<CooperativeNotification['type'], string> = { ManagerMissing: 'Chưa có Manager', DeletionBlocked: 'Chưa thể xóa do có dữ liệu liên quan', CooperativeDeleted: 'Đã xóa HTX chưa có Manager' };
  return <section className="panel"><div className="panel-heading"><div><h2>Thông báo hợp tác xã</h2><p>Cảnh báo và kết quả xử lý tự động của hệ thống.</p></div><button className="icon-button" aria-label="Làm mới thông báo HTX" onClick={resource.reload}><RefreshCw size={18}/></button></div><DataState resource={resource} empty={resource.data?.items.length === 0}>{(data) => <div className="table-scroll"><table><thead><tr><th>HTX</th><th>Thông báo</th><th>Thời gian</th><th>Mốc xét xóa</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.id}><td>{item.cooperative_name}</td><td>{labels[item.type]}</td><td>{dateTime(item.created_at)}</td><td>{dateTime(item.manager_deadline)}</td></tr>)}</tbody></table></div>}</DataState>{resource.data && <Pagination {...resource.data} onChange={setOffset}/>}</section>;
}
