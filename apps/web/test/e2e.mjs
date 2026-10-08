import assert from 'node:assert/strict';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

// Backend thật, RAM cô lập, không đọc .env root và không gửi SMTP/SMS thật.
const webRoot = fileURLToPath(new URL('..', import.meta.url));
const apiRoot = fileURLToPath(new URL('../../api', import.meta.url));
const require = createRequire(import.meta.url);
const compilation = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--outDir', '.test-dist'], { cwd: apiRoot, encoding: 'utf8', timeout: 60000 });
assert.equal(compilation.status, 0, compilation.stdout + compilation.stderr);
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const apiModule = (path) => require(`${apiRoot}/.test-dist/src/${path}.js`);
const { AppModule } = apiModule('app.module');
const { configureApplication } = apiModule('application');
const { readEnvironment } = apiModule('config/environment');
const { EmailSender } = apiModule('users/email/email.sender');
const { MockUserStore } = apiModule('auth/mock-user.store');
const config = readEnvironment({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test', MONGODB_URI: 'mongodb://127.0.0.1:1/test', AUTH_MODE: 'mock', AUTH_TEST_PHONE: '0900000000', AUTH_TEST_PASSWORD: 'LocalTestOnly123!', AUTH_TEST_ADMIN_PHONE: '0900000001', AUTH_TEST_ADMIN_PASSWORD: 'LocalAdminOnly123!', JWT_SECRET: 'browser-test-only-secret-at-least-32-bytes' });
const codes = new Map();
const module = await Test.createTestingModule({ imports: [AppModule.register(config)] }).overrideProvider(EmailSender).useValue({ async sendVerification(to, code) { codes.set(to, code); } }).compile();
const app = module.createNestApplication({ logger: false });
configureApplication(app, config);
let vite, browser;
const results = [];
const screenshots = fileURLToPath(new URL('../test-results/', import.meta.url));
mkdirSync(screenshots, { recursive: true });
async function check(name, action) { await action(); results.push(name); console.log(`PASS ${name}`); }
try {
  await app.listen(0, '127.0.0.1');
  const apiUrl = await app.getUrl();
  async function http(path, method = 'GET', body, token, expected) {
    const response = await fetch(`${apiUrl}/api/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, expected ?? (method === 'POST' ? 201 : 200), `${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
    return data;
  }
  const adminToken = (await http('auth/login', 'POST', { phone_number: '0900000001', password: 'LocalAdminOnly123!' }, undefined, 200)).access_token;
  const ownerToken = (await http('auth/login', 'POST', { phone_number: '0900000000', password: 'LocalTestOnly123!' }, undefined, 200)).access_token;
  const standard = await http('standards', 'POST', { code: 'WEB-VG', name: 'Tiêu chuẩn kiểm thử web', description: 'Hồ sơ phục vụ kiểm thử trình duyệt', certifying_body: 'Kiểm thử cô lập' }, adminToken);
  for (let i = 1; i <= 23; i++) await http('materials', 'POST', { name: `Vật tư kiểm thử ${String(i).padStart(2, '0')}`, material_type: 'Fertilizer', default_dosage: '20', unit: 'g', quarantine_days: 7 }, adminToken);
  const farmRequest = await http('farms/requests', 'POST', { area_size: 1, address: 'Vườn kiểm thử giao diện, Tiền Giang', certificate_number: 'WEB-FARM', longitude: 106, latitude: 10 }, ownerToken);
  const farmAccepted = await http(`farm-requests/${farmRequest.id}/approve`, 'PATCH', {}, adminToken);
  const zone = await http('zones', 'POST', { farm_id: farmAccepted.farm_id, standard_id: standard.id, zone_name: 'Khu sầu riêng kiểm thử', area_size: 0.5, longitude: 106, latitude: 10 }, ownerToken);
  const tree = await http('trees', 'POST', { zone_id: zone.id, variety: 'Ri6 kiểm thử', plant_date: '2024-05-01T08:00:00+07:00', longitude: 106, latitude: 10 }, ownerToken);
  const coop = await http('cooperatives', 'POST', { cooperative_name: 'HTX kiểm thử có sẵn', director: 'Đại diện kiểm thử', certificate_number: 'WEB-COOP-1', address: 'Tiền Giang', contact_number: '0900000004' }, adminToken);
  vite = await createServer({ root: webRoot, configFile: `${webRoot}/vite.config.ts`, server: { port: 0, strictPort: false, host: '127.0.0.1', proxy: { '/api': { target: apiUrl, changeOrigin: true } } } });
  await vite.listen();
  const origin = vite.resolvedUrls.local[0].replace(/\/$/, '');
  const edge = process.env.WEB_TEST_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (!existsSync(edge)) throw new Error('Không có browser. Đặt WEB_TEST_BROWSER tới Chrome/Edge có sẵn, hoặc cài browser riêng.');
  browser = await chromium.launch({ executablePath: edge, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultTimeout(12000);
  const visit = (path) => page.goto(`${origin}${path}`);
  const heading = (name) => page.getByRole('heading', { name, exact: true }).waitFor();
  async function login(phone, password = 'LocalTestOnly123!') {
    await visit('/login'); await heading('Đăng nhập');
    await page.getByLabel('Số điện thoại', { exact: true }).fill(phone);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.sidebar') || document.querySelector('.auth-card [role="alert"]'));
  }
  const logout = async () => { await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click(); await heading('Đăng nhập'); };
  await check('login desktop assets, native form, no demo role switcher', async () => {
    await visit('/login'); await heading('Đăng nhập');
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('.auth-story').isVisible(), true);
    assert.equal(await page.locator('img.brand-logo').first().evaluate((image) => image.complete && image.naturalWidth > 0), true);
    await page.screenshot({ path: `${screenshots}/login-desktop.png`, fullPage: true });
  });
  await check('wrong credentials remain login error', async () => {
    await login('0900000000', 'WrongPassword!'); await page.getByRole('alert').filter({ hasText: 'chưa đúng' }).waitFor();
    assert.equal(await page.locator('.sidebar').count(), 0);
  });
  await check('Farmer dashboard, session restore and scoped counts', async () => {
    await login('0900000000'); await heading('Xin chào, Local test Farmer');
    await page.locator('.stat-card').first().waitFor(); assert.equal(await page.locator('.stat-card').count(), 3);
    assert.equal(await page.getByRole('link', { name: 'Duyệt Manager', exact: true }).count(), 0);
    await page.screenshot({ path: `${screenshots}/farmer-desktop.png`, fullPage: true });
    await page.reload(); await page.locator('.stat-card').first().waitFor();
    const keys = await page.evaluate(() => Object.keys(sessionStorage)); assert.deepEqual(keys, ['smart-durian.access-token']);
  });
  await check('catalog search, server pagination, detail and empty state', async () => {
    await visit('/materials'); await page.locator('tbody tr').first().waitFor(); assert.equal(await page.locator('tbody tr').count(), 20);
    await page.getByRole('button', { name: 'Sau', exact: true }).click(); await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 3);
    await page.getByRole('button', { name: 'Trước', exact: true }).click(); await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 20);
    await page.getByLabel('Tìm theo tên vật tư').fill('kiểm thử 01'); await page.getByRole('button', { name: 'Tìm kiếm' }).click(); await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
    await page.getByRole('link', { name: 'Vật tư kiểm thử 01', exact: true }).click(); await heading('Vật tư kiểm thử 01');
    await visit('/materials?q=khong-co-ket-qua'); await heading('Chưa có dữ liệu phù hợp');
  });
  await check('farm zone tree standard and harvest read paths', async () => {
    for (const [path, title] of [[`/farms/${farmAccepted.farm_id}`, 'WEB-FARM'], [`/zones/${zone.id}`, zone.zone_name], [`/trees/${tree.id}`, tree.tree_code], [`/standards/${standard.id}`, standard.name]]) { await visit(path); await heading(title); }
    await heading('Vật tư liên kết');
    await visit('/tree-harvests'); await heading('Chưa có dữ liệu phù hợp');
    await visit('/pending-managers'); await heading('Không có quyền truy cập');
    await visit('/cooperatives/new'); await heading('Không có quyền truy cập');
  });
  await check('network failure clears data and supports manual retry', async () => {
    await page.route('**/api/materials?*', (route) => route.abort()); await visit('/materials'); await page.getByRole('alert').waitFor(); assert.equal(await page.locator('tbody tr').count(), 0);
    await page.unroute('**/api/materials?*'); await page.getByRole('button', { name: 'Thử lại', exact: true }).click(); await page.locator('tbody tr').first().waitFor();
  });
  await check('mobile layout and menu without body overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await visit('/'); await page.locator('.stat-card').first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByRole('button', { name: 'Mở menu', exact: true }).click(); await page.locator('.sidebar.open').waitFor();
    await page.getByRole('link', { name: 'Cây trồng', exact: true }).click(); await page.locator('tbody tr').first().waitFor(); assert.equal(await page.locator('.sidebar.open').count(), 0);
    await visit('/'); await page.locator('.stat-card').first().waitFor(); await page.screenshot({ path: `${screenshots}/farmer-mobile.png`, fullPage: true });
    await page.getByRole('button', { name: 'Mở menu', exact: true }).click(); await logout();
    assert.equal(await page.evaluate(() => sessionStorage.length), 0); await page.screenshot({ path: `${screenshots}/login-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check('Farmer registration becomes Active with no farm or owner claims', async () => {
    await visit('/register'); await page.getByLabel('Họ và tên', { exact: true }).fill('Farmer đăng ký kiểm thử'); await page.getByLabel('Số điện thoại', { exact: true }).fill('0900000010'); await page.getByLabel('Mật khẩu', { exact: true }).fill('BrowserOnly123!');
    await page.getByRole('button', { name: 'Xác nhận đăng ký', exact: true }).click(); await heading('Đăng ký thành công');
    const signed = await http('auth/login', 'POST', { phone_number: '0900000010', password: 'BrowserOnly123!' }, undefined, 200); assert.equal(signed.user.status, 'Active'); assert.equal(signed.user.is_owner, false);
  });
  async function registerManager(phone, email, name) {
    await visit('/register'); await page.getByRole('button', { name: 'Manager HTX', exact: true }).click(); await page.getByLabel('Họ và tên', { exact: true }).fill(name); await page.getByLabel('Số điện thoại', { exact: true }).fill(phone); await page.getByLabel('Email (bắt buộc xác minh)', { exact: true }).fill(email); await page.getByLabel('Mật khẩu', { exact: true }).fill('BrowserOnly123!');
    await page.getByRole('button', { name: 'Gửi mã xác minh email', exact: true }).click(); await page.getByLabel('Mã xác minh email', { exact: true }).waitFor(); assert(codes.has(email));
    await page.getByLabel('Mã xác minh email', { exact: true }).fill(codes.get(email)); await page.getByRole('button', { name: 'Xác minh email', exact: true }).click(); await page.getByRole('button', { name: 'Xác nhận đăng ký', exact: true }).waitFor(); await page.getByRole('button', { name: 'Xác nhận đăng ký', exact: true }).click(); await heading('Đăng ký thành công');
    const pending = (await http('users/pending-managers', 'GET', undefined, adminToken)).users.find((user) => user.phone_number === phone); assert.equal(pending.status, 'Pending'); assert.equal(pending.gmail_verify, true); return pending;
  }
  let manager;
  await check('Manager email verification registers Pending and blocks login', async () => {
    manager = await registerManager('0900000011', 'manager-browser@example.com', 'Manager kiểm thử browser'); await login('0900000011', 'BrowserOnly123!'); await page.getByRole('alert').filter({ hasText: 'chưa được duyệt' }).waitFor(); assert.equal(await page.locator('.sidebar').count(), 0);
  });
  await check('Admin dashboard and HTX create edit unique conflict', async () => {
    await login('0900000001', 'LocalAdminOnly123!'); await heading('Tổng quan hệ thống'); await page.locator('.stat-card').first().waitFor(); assert.equal(await page.locator('.stat-card').count(), 4); await page.screenshot({ path: `${screenshots}/admin-desktop.png`, fullPage: true });
    await visit('/cooperatives/new'); await page.getByLabel('Tên hợp tác xã', { exact: true }).fill('HTX mới kiểm thử'); await page.getByLabel('Người đại diện / giám đốc', { exact: true }).fill('Đại diện mới'); await page.getByLabel('Số chứng nhận', { exact: true }).fill('WEB-COOP-1'); await page.getByLabel('Số điện thoại liên hệ', { exact: true }).fill('0900000015'); await page.getByLabel('Địa chỉ', { exact: true }).fill('Bến Tre');
    await page.getByRole('button', { name: 'Tạo hợp tác xã', exact: true }).click(); await page.getByRole('alert').waitFor(); assert.equal(await page.getByLabel('Tên hợp tác xã', { exact: true }).inputValue(), 'HTX mới kiểm thử');
    await page.getByLabel('Số chứng nhận', { exact: true }).fill('WEB-COOP-2'); await page.getByRole('button', { name: 'Tạo hợp tác xã', exact: true }).click(); await heading('HTX mới kiểm thử');
    await page.getByRole('link', { name: 'Chỉnh sửa', exact: true }).click(); await page.getByLabel('Địa chỉ', { exact: true }).fill('Bến Tre cập nhật'); await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click(); await heading('HTX mới kiểm thử'); await page.getByText('Bến Tre cập nhật', { exact: true }).waitFor();
  });
  await check('approve existing HTX, preserves UUID and enables Manager with deferred dashboard', async () => {
    await visit('/pending-managers'); const row = page.locator('tr').filter({ hasText: manager.user_name }); await row.getByRole('button', { name: 'Duyệt', exact: true }).click(); const dialog = page.getByRole('dialog'); await dialog.getByLabel('Chọn HTX chưa có Manager', { exact: true }).selectOption(coop.id); await dialog.getByRole('button', { name: 'Kiểm tra và xác nhận', exact: true }).click(); await dialog.getByRole('button', { name: 'Xác nhận duyệt', exact: true }).click(); await page.getByText(/Đã kích hoạt Manager kiểm thử browser/).waitFor();
    const active = await http('auth/login', 'POST', { phone_number: '0900000011', password: 'BrowserOnly123!' }, undefined, 200); assert.equal(active.user.id, manager.id); assert.equal(active.user.status, 'Active');
    await logout(); await login('0900000011', 'BrowserOnly123!'); await heading('Không gian Manager'); assert.equal(await page.getByRole('link', { name: 'Duyệt Manager', exact: true }).count(), 0);
    await visit('/cooperatives'); await page.locator('tbody tr').first().waitFor(); assert.equal(await page.locator('tbody tr').count(), 1); await visit('/pending-managers'); await heading('Không có quyền truy cập'); await logout();
  });
  await check('reject Pending Manager requires explicit confirmation', async () => {
    const rejected = await registerManager('0900000012', 'reject-browser@example.com', 'Manager từ chối kiểm thử'); await login('0900000001', 'LocalAdminOnly123!'); await visit('/pending-managers'); const row = page.locator('tr').filter({ hasText: rejected.user_name }); await row.getByRole('button', { name: `Từ chối ${rejected.user_name}`, exact: true }).click(); const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Kiểm tra và xác nhận', exact: true }).click(); await dialog.getByRole('button', { name: 'Xác nhận từ chối', exact: true }).click(); await page.getByText(/Đã từ chối tài khoản Manager từ chối kiểm thử/).waitFor(); assert.equal(app.get(MockUserStore).findById(rejected.id).status, 'Reject');
  });
  await check('server token revocation closes session and removes protected data', async () => {
    await visit('/materials'); await page.locator('tbody tr').first().waitFor(); const admin = app.get(MockUserStore).findByPhone('0900000001'); app.get(MockUserStore).revokeTokens(admin.id); await page.getByRole('button', { name: 'Làm mới', exact: true }).click(); await heading('Đăng nhập'); assert.equal(await page.locator('tbody tr').count(), 0); assert.equal(await page.evaluate(() => sessionStorage.length), 0);
  });
  assert.deepEqual(errors, [], 'Uncaught browser errors');
  writeFileSync(`${screenshots}/report.json`, JSON.stringify({ checked_at: new Date().toISOString(), passed: results, browser: 'Chromium / locally installed Edge or WEB_TEST_BROWSER', api: 'real isolated Nest controllers/services; SMTP capture provider; RAM stores', screenshots: ['login-desktop.png', 'login-mobile.png', 'farmer-desktop.png', 'farmer-mobile.png', 'admin-desktop.png'] }, null, 2));
  console.log(`${results.length} browser checks passed. Artifacts: apps/web/test-results`);
} finally {
  await browser?.close(); await vite?.close(); await app.close();
}
