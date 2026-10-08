import { useCallback, useEffect, useState } from 'react';
import { Check, Search, RefreshCw, X, ShieldCheck } from 'lucide-react';
import { useSession } from '../auth/session';
import { ApiError } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useTask } from '../hooks/useTask';
import { Badge, DataState, Field, Modal, Notice, PageHeader, Pagination, dateTime } from '../components/ui';
import { CooperativeFields, cleanCooperative, emptyCooperative } from './Cooperatives';
import type { Cooperative, User } from '../types/api';

export function PendingManagersPage() {
  const { api } = useSession(); const [q, setQ] = useState(''); const [offset, setOffset] = useState(0); const [selected, setSelected] = useState<{ user: User; reject: boolean }>(); const [success, setSuccess] = useState('');
  const load = useCallback((signal: AbortSignal) => api.request<{ users: User[] }>('users/pending-managers', { signal }), [api]); const resource = useResource('pending-managers', load);
  const filtered = resource.data?.users.filter((user) => [user.user_name, user.phone_number, user.gmail ?? ''].some((value) => value.toLocaleLowerCase('vi').includes(q.trim().toLocaleLowerCase('vi')))) ?? [];
  const total = filtered.length; const safeOffset = total === 0 ? 0 : Math.min(offset, Math.floor((total - 1) / 20) * 20);
  useEffect(() => { if (offset !== safeOffset) setOffset(safeOffset); }, [safeOffset, offset]);
  return <><PageHeader title="Duyệt tài khoản Manager" subtitle="Xem tài khoản chờ duyệt, gắn HTX và kích hoạt quyền Manager." actions={<button className="button secondary" onClick={resource.reload}><RefreshCw size={17}/>Làm mới</button>}/>{success && <Notice kind="success">{success}</Notice>}<section className="panel"><div className="panel-heading"><div><h2>Danh sách chờ duyệt</h2><p>{resource.data ? `${resource.data.users.length} tài khoản đang chờ` : 'Đang kiểm tra tài khoản chờ duyệt'}</p></div><ShieldCheck size={25}/></div><div className="toolbar"><Field label="Tìm tên, điện thoại hoặc email"><span className="search-input"><Search size={17}/><input maxLength={100} value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }}/></span></Field></div><DataState resource={resource} empty={resource.data !== undefined && total === 0}>{() => <div className="table-scroll"><table><thead><tr><th>Người đăng ký</th><th>Điện thoại / Email</th><th>Ngày đăng ký</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{filtered.slice(safeOffset, safeOffset + 20).map((user) => <tr key={user.id}><td><strong>{user.user_name}</strong></td><td>{user.phone_number}<small>{user.gmail ?? 'Chưa có email'}</small></td><td>{dateTime(user.created_at)}</td><td><Badge status={user.status}/></td><td><div className="actions"><button className="button" onClick={() => { setSuccess(''); setSelected({ user, reject: false }); }}><Check size={16}/>Duyệt</button><button className="icon-button" aria-label={`Từ chối ${user.user_name}`} onClick={() => { setSuccess(''); setSelected({ user, reject: true }); }}><X size={18}/></button></div></td></tr>)}</tbody></table></div>}</DataState>{resource.data && <><Pagination total={total} offset={safeOffset} limit={20} onChange={setOffset}/><p className="table-note">Tìm kiếm và phân trang trên toàn bộ danh sách chờ duyệt đã tải.</p></>}</section>{selected && <ApprovalDialog key={`${selected.user.id}/${selected.reject}`} user={selected.user} reject={selected.reject} onClose={() => setSelected(undefined)} onDone={(message) => { setSuccess(message); setSelected(undefined); resource.reload(); }}/>}</>;
}
function ApprovalDialog({ user, reject, onClose, onDone }: { user: User; reject: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const { api } = useSession(); const task = useTask(); const [mode, setMode] = useState<'existing' | 'create'>('existing'); const [cooperativeId, setCooperativeId] = useState(''); const [value, setValue] = useState({ ...emptyCooperative }); const [confirm, setConfirm] = useState(false); const [needsCheck, setNeedsCheck] = useState(false); const [processed, setProcessed] = useState(false); const [checkedCooperatives, setCheckedCooperatives] = useState<Cooperative[]>();
  const load = useCallback((signal: AbortSignal) => reject ? Promise.resolve({ cooperatives: [] as Cooperative[] }) : api.request<{ cooperatives: Cooperative[] }>('users/cooperatives', { signal }), [api, reject]);
  const resource = useResource('approval-cooperatives', load);
  const available = (checkedCooperatives ?? resource.data?.cooperatives ?? []).filter((coop) => coop.manager_id === null);
  const selected = available.find((coop) => coop.id === cooperativeId);
  async function reconcile(signal: AbortSignal) {
    const [pending, coops] = await Promise.all([api.request<{ users: User[] }>('users/pending-managers', { signal }), api.request<{ cooperatives: Cooperative[] }>('users/cooperatives', { signal })]);
    setCheckedCooperatives(coops.cooperatives);
    if (!pending.users.some((item) => item.id === user.id)) { setProcessed(true); task.setError('Tài khoản không còn trong danh sách chờ. Thao tác đã được xử lý; đóng cửa sổ để tải lại danh sách.'); return; }
    setNeedsCheck(false); setConfirm(false);
    if (mode === 'existing' && cooperativeId && !coops.cooperatives.some((coop) => coop.id === cooperativeId && coop.manager_id === null)) { setCooperativeId(''); task.setError('HTX vừa chọn không còn khả dụng. Hãy chọn HTX khác.'); }
  }
  async function submit(signal: AbortSignal) {
    if (!reject && mode === 'existing' && !selected) throw new Error('Chọn HTX hiện có chưa được gắn Manager.');
    if (!confirm) { setConfirm(true); return; }
    try {
      const body = reject ? {} : mode === 'existing' ? { cooperative_id: cooperativeId } : { cooperative: cleanCooperative(value) };
      await api.request(`users/${user.id}/${reject ? 'reject' : 'approve'}`, { method: 'PATCH', body, signal });
      onDone(reject ? `Đã từ chối tài khoản ${user.user_name}.` : `Đã kích hoạt ${user.user_name} và gắn HTX ${mode === 'create' ? value.cooperative_name.trim() : selected?.cooperative_name}.`);
    } catch (error) {
      setConfirm(false);
      if (error instanceof ApiError && (error.status === 0 || error.status === 409 || error.status >= 500)) setNeedsCheck(true);
      throw error;
    }
  }
  return <Modal title={reject ? 'Từ chối tài khoản Manager' : 'Duyệt tài khoản Manager'} onClose={() => { if (!task.busy) { if (processed) onDone('Đã tải lại danh sách tài khoản chờ duyệt.'); else onClose(); } }}><div className="candidate-summary"><span className="avatar">{user.user_name.slice(0, 1).toUpperCase()}</span><div><h3>{user.user_name}</h3><p>{user.phone_number} · {user.gmail}</p><small>{user.gmail_verify ? 'Email đã xác minh' : 'Email chưa xác minh'} · Đăng ký {dateTime(user.created_at)}</small></div></div><form onSubmit={(e) => { e.preventDefault(); void task.run(submit); }}><fieldset disabled={task.busy || needsCheck || processed}>
    {reject ? <Notice kind="warning">Tài khoản sẽ chuyển sang trạng thái từ chối và chưa thể đăng nhập. Backend không có trường lý do từ chối hay gửi thông báo tự động.</Notice> : confirm ? <Notice kind="warning">Kích hoạt tài khoản <strong>{user.user_name}</strong> và {mode === 'create' ? 'tạo HTX mới' : 'gắn HTX'} <strong>{mode === 'create' ? value.cooperative_name.trim() : selected?.cooperative_name}</strong>. Manager sẽ được truy cập dữ liệu của HTX này.</Notice> : <><div className="role-tabs"><button type="button" aria-pressed={mode === 'existing'} onClick={() => setMode('existing')}>HTX hiện có</button><button type="button" aria-pressed={mode === 'create'} onClick={() => setMode('create')}>Tạo HTX mới</button></div>{mode === 'create' ? <CooperativeFields value={value} onChange={setValue}/> : <DataState resource={resource}>{() => <Field label="Chọn HTX chưa có Manager"><select required value={cooperativeId} onChange={(e) => setCooperativeId(e.target.value)}><option value="">Chọn hợp tác xã</option>{available.map((coop) => <option key={coop.id} value={coop.id}>{coop.cooperative_name} · {coop.certificate_number}</option>)}</select>{available.length === 0 && <small>Chưa có HTX khả dụng. Bạn có thể chọn tạo HTX mới.</small>}</Field>}</DataState>}</>}
    <div className="form-actions">{confirm && <button type="button" className="button secondary" onClick={() => setConfirm(false)}>Kiểm tra lại</button>}<button className={`button ${reject ? 'danger' : ''}`} type="submit" disabled={!reject && mode === 'existing' && !selected}>{task.busy ? 'Đang xử lý…' : confirm ? reject ? 'Xác nhận từ chối' : 'Xác nhận duyệt' : 'Kiểm tra và xác nhận'}</button></div>
    </fieldset>{task.error && <Notice kind="error">{task.error}</Notice>}{needsCheck && !processed && <><Notice kind="warning">Kết quả hoặc trạng thái hiện tại chưa chắc chắn. Kiểm tra tài khoản và HTX trước khi thao tác tiếp.</Notice><button className="button secondary" type="button" disabled={task.busy} onClick={() => void task.run(reconcile)}><RefreshCw size={16}/>Kiểm tra trạng thái mới nhất</button></>}</form></Modal>;
}
