import assert from "node:assert/strict";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { loopbackBroker } from "./loopback-broker.mjs";

// Backend thật, RAM cô lập, không đọc .env root và không gửi SMTP/SMS thật.
const webRoot = fileURLToPath(new URL("..", import.meta.url));
const apiRoot = fileURLToPath(new URL("../../api", import.meta.url));
const require = createRequire(import.meta.url);
const compilation = spawnSync(
  process.execPath,
  [require.resolve("typescript/bin/tsc"), "--outDir", ".test-dist"],
  { cwd: apiRoot, encoding: "utf8", timeout: 60000 },
);
assert.equal(compilation.status, 0, compilation.stdout + compilation.stderr);
require("reflect-metadata");
const { Test } = require("@nestjs/testing");
const apiModule = (path) => require(`${apiRoot}/.test-dist/src/${path}.js`);
const { AppModule } = apiModule("app.module");
const { configureApplication } = apiModule("application");
const { readEnvironment } = apiModule("config/environment");
const { EmailSender } = apiModule("users/email/email.sender");
const { MockUserStore } = apiModule("auth/mock-user.store");
const { MqttService } = apiModule("mqtt/mqtt.service");
const { readMqttConfig } = apiModule("mqtt/mqtt.config");
const { TelemetryService } = apiModule("telemetry/telemetry.service");
const { AuthService } = apiModule("auth/auth.service");
const broker = await loopbackBroker();
const config = readEnvironment({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  MONGODB_URI: "mongodb://127.0.0.1:1/test",
  AUTH_MODE: "mock",
  AUTH_TEST_PHONE: "0900000000",
  AUTH_TEST_PASSWORD: "LocalTestOnly123!",
  AUTH_TEST_ADMIN_PHONE: "0900000001",
  AUTH_TEST_ADMIN_PASSWORD: "LocalAdminOnly123!",
  JWT_SECRET: "browser-test-only-secret-at-least-32-bytes",
});
config.mqtt = {
  ...readMqttConfig({}),
  enabled: true,
  host: "127.0.0.1",
  port: broker.port,
};
const codes = new Map();
const module = await Test.createTestingModule({
  imports: [AppModule.register(config)],
})
  .overrideProvider(EmailSender)
  .useValue({
    async sendVerification(to, code) {
      codes.set(to, code);
    },
  })
  .compile()
  .catch(async (error) => {
    await broker.close();
    throw error;
  });
const app = module.createNestApplication({ logger: false });
configureApplication(app, config);
let vite, browser;
const results = [];
const screenshots = fileURLToPath(new URL("../test-results/", import.meta.url));
mkdirSync(screenshots, { recursive: true });
async function check(name, action) {
  await action();
  results.push(name);
  console.log(`PASS ${name}`);
}
try {
  await app.listen(0, "127.0.0.1");
  const apiUrl = await app.getUrl();
  async function http(path, method = "GET", body, token, expected) {
    const response = await fetch(`${apiUrl}/api/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    assert.equal(
      response.status,
      expected ?? (method === "POST" ? 201 : 200),
      `${method} ${path}: ${response.status} ${JSON.stringify(data)}`,
    );
    return data;
  }
  const adminToken = (
    await http(
      "auth/login",
      "POST",
      { phone_number: "0900000001", password: "LocalAdminOnly123!" },
      undefined,
      200,
    )
  ).access_token;
  const ownerToken = (
    await http(
      "auth/login",
      "POST",
      { phone_number: "0900000000", password: "LocalTestOnly123!" },
      undefined,
      200,
    )
  ).access_token;
  const standard = await http(
    "standards",
    "POST",
    {
      code: "WEB-VG",
      name: "Tiêu chuẩn kiểm thử web",
      description: "Hồ sơ phục vụ kiểm thử trình duyệt",
      certifying_body: "Kiểm thử cô lập",
    },
    adminToken,
  );
  for (let i = 1; i <= 23; i++)
    await http(
      "materials",
      "POST",
      {
        name: `Vật tư kiểm thử ${String(i).padStart(2, "0")}`,
        material_type: "Fertilizer",
        default_dosage: "20",
        unit: "g",
        quarantine_days: 7,
      },
      adminToken,
    );
  const farmRequest = await http(
    "farms/requests",
    "POST",
    {
      area_size: 1,
      address: "Vườn kiểm thử giao diện, Tiền Giang",
      certificate_number: "WEB-FARM",
      longitude: 106,
      latitude: 10,
    },
    ownerToken,
  );
  const farmAccepted = await http(
    `farm-requests/${farmRequest.id}/approve`,
    "PATCH",
    {},
    adminToken,
  );
  const zone = await http(
    "zones",
    "POST",
    {
      farm_id: farmAccepted.farm_id,
      standard_id: standard.id,
      zone_name: "Khu sầu riêng kiểm thử",
      area_size: 0.5,
      longitude: 106,
      latitude: 10,
    },
    ownerToken,
  );
  const tree = await http(
    "trees",
    "POST",
    {
      zone_id: zone.id,
      variety: "Ri6 kiểm thử",
      plant_date: "2024-05-01T08:00:00+07:00",
      longitude: 106,
      latitude: 10,
    },
    ownerToken,
  );
  const coop = await http(
    "cooperatives",
    "POST",
    {
      cooperative_name: "HTX kiểm thử có sẵn",
      director: "Đại diện kiểm thử",
      certificate_number: "WEB-COOP-1",
      address: "Tiền Giang",
      contact_number: "0900000004",
    },
    adminToken,
  );
  const ownerId = (await http("auth/me", "GET", undefined, ownerToken)).id;
  const adminId = (await http("auth/me", "GET", undefined, adminToken)).id;
  const device = await http(
    "devices",
    "POST",
    {
      zone_id: zone.id,
      station_id: "WEB_STATION_A",
      installed_at: new Date().toISOString(),
      cost: 0,
    },
    ownerToken,
  );
  const otherDevice = await http(
    "devices",
    "POST",
    {
      zone_id: zone.id,
      station_id: "WEB_STATION_B",
      installed_at: new Date().toISOString(),
      cost: 0,
    },
    ownerToken,
  );
  const sensor = await http(
    "sensors",
    "POST",
    {
      device_id: device.id,
      name: "Nhiệt độ không khí A",
      sensor_type: "air_temperature",
      data_stream_id: "301",
      unit: "C",
      min_threshold: 20,
      max_threshold: 35,
    },
    ownerToken,
  );
  await http(
    "sensors",
    "POST",
    {
      device_id: device.id,
      name: "Độ ẩm không khí A",
      sensor_type: "air_humidity",
      data_stream_id: "302",
      unit: "%",
    },
    ownerToken,
  );
  await http(
    "sensors",
    "POST",
    {
      device_id: device.id,
      name: "Độ ẩm đất A",
      sensor_type: "soil_moisture",
      data_stream_id: "303",
      unit: "%",
    },
    ownerToken,
  );
  await http(
    "sensors",
    "POST",
    {
      device_id: otherDevice.id,
      name: "Nhiệt độ không khí B",
      sensor_type: "air_temperature",
      data_stream_id: "301",
      unit: "C",
    },
    ownerToken,
  );
  const mqtt = app.get(MqttService);
  const telemetry = app.get(TelemetryService);
  async function until(condition) {
    const deadline = Date.now() + 5000;
    while (!condition() && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert(condition(), "Timed out waiting for loopback receiver");
  }
  await until(() => mqtt.brokerStatus(adminId).subscribed);
  broker.publish(device.station_id, [
    { dataStreamId: 301, result: "26.54 oC" },
    { dataStreamId: 302, result: "70 %" },
    { dataStreamId: 303, result: "45 %" },
  ]);
  for (let i = 0; i < 23; i++)
    broker.publish(device.station_id, [
      { dataStreamId: 303, result: `${44 + i / 100} %` },
    ]);
  broker.publish(otherDevice.station_id, [
    { dataStreamId: 301, result: "10 C" },
  ]);
  await until(
    () =>
      telemetry.history(ownerId, device.id, { limit: 20, offset: 0 }).total ===
      26,
  );
  vite = await createServer({
    root: webRoot,
    configFile: `${webRoot}/vite.config.ts`,
    server: {
      port: 0,
      strictPort: false,
      host: "127.0.0.1",
      proxy: { "/api": { target: apiUrl, changeOrigin: true } },
    },
  });
  await vite.listen();
  const origin = vite.resolvedUrls.local[0].replace(/\/$/, "");
  const edge =
    process.env.WEB_TEST_BROWSER ??
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  if (!existsSync(edge))
    throw new Error(
      "Không có browser. Đặt WEB_TEST_BROWSER tới Chrome/Edge có sẵn, hoặc cài browser riêng.",
    );
  browser = await chromium.launch({ executablePath: edge, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(12000);
  const visit = (path) => page.goto(`${origin}${path}`);
  const heading = (name) =>
    page.getByRole("heading", { name, exact: true }).waitFor();
  async function login(phone, password = "LocalTestOnly123!") {
    await visit("/login");
    await heading("Đăng nhập");
    await page.getByLabel("Số điện thoại", { exact: true }).fill(phone);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector(".sidebar") ||
        document.querySelector('.auth-card [role="alert"]'),
    );
  }
  const logout = async () => {
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await heading("Đăng nhập");
  };
  await check(
    "login desktop assets, native form, no demo role switcher",
    async () => {
      await visit("/login");
      await heading("Đăng nhập");
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator(".auth-story").isVisible(), true);
      assert.equal(
        await page
          .locator("img.brand-logo")
          .first()
          .evaluate((image) => image.complete && image.naturalWidth > 0),
        true,
      );
      await page.screenshot({
        path: `${screenshots}/login-desktop.png`,
        fullPage: true,
      });
    },
  );
  await check("wrong credentials remain login error", async () => {
    await login("0900000000", "WrongPassword!");
    await page.getByRole("alert").filter({ hasText: "chưa đúng" }).waitFor();
    assert.equal(await page.locator(".sidebar").count(), 0);
  });
  await check(
    "Farmer dashboard, session restore and scoped counts",
    async () => {
      await login("0900000000");
      await heading("Xin chào, Local test Farmer");
      await page.locator(".stat-card").first().waitFor();
      assert.equal(await page.locator(".stat-card").count(), 3);
      assert.equal(
        await page
          .getByRole("link", { name: "Duyệt Manager", exact: true })
          .count(),
        0,
      );
      await page.locator(".sensor-card").first().waitFor();
      await page.screenshot({
        path: `${screenshots}/farmer-desktop.png`,
        fullPage: true,
      });
      await page.reload();
      await page.locator(".stat-card").first().waitFor();
      const keys = await page.evaluate(() => Object.keys(sessionStorage));
      assert.deepEqual(keys, ["smart-durian.access-token"]);
    },
  );
  await check(
    "catalog search, server pagination, detail and empty state",
    async () => {
      await visit("/materials");
      await page.locator("tbody tr").first().waitFor();
      assert.equal(await page.locator("tbody tr").count(), 20);
      await page.getByRole("button", { name: "Sau", exact: true }).click();
      await page.waitForFunction(
        () => document.querySelectorAll("tbody tr").length === 3,
      );
      await page.getByRole("button", { name: "Trước", exact: true }).click();
      await page.waitForFunction(
        () => document.querySelectorAll("tbody tr").length === 20,
      );
      await page.getByLabel("Tìm theo tên vật tư").fill("kiểm thử 01");
      await page.getByRole("button", { name: "Tìm kiếm" }).click();
      await page.waitForFunction(
        () => document.querySelectorAll("tbody tr").length === 1,
      );
      await page
        .getByRole("link", { name: "Vật tư kiểm thử 01", exact: true })
        .click();
      await heading("Vật tư kiểm thử 01");
      await visit("/materials?q=khong-co-ket-qua");
      await heading("Chưa có dữ liệu phù hợp");
    },
  );
  await check("farm zone tree standard and harvest read paths", async () => {
    for (const [path, title] of [
      [`/farms/${farmAccepted.farm_id}`, "WEB-FARM"],
      [`/zones/${zone.id}`, zone.zone_name],
      [`/trees/${tree.id}`, tree.tree_code],
      [`/standards/${standard.id}`, standard.name],
    ]) {
      await visit(path);
      await heading(title);
    }
    await heading("Vật tư liên kết");
    await visit("/tree-harvests");
    await heading("Chưa có dữ liệu phù hợp");
    await visit("/pending-managers");
    await heading("Không có quyền truy cập");
    await visit("/cooperatives/new");
    await heading("Không có quyền truy cập");
  });
  await check(
    "network failure clears data and supports manual retry",
    async () => {
      await page.route("**/api/materials?*", (route) => route.abort());
      await visit("/materials");
      await page.getByRole("alert").waitFor();
      assert.equal(await page.locator("tbody tr").count(), 0);
      await page.unroute("**/api/materials?*");
      await page.getByRole("button", { name: "Thử lại", exact: true }).click();
      await page.locator("tbody tr").first().waitFor();
    },
  );
  await check(
    "real MQTT TCP through Nest and HTTP to UI, raw unit and presence",
    async () => {
      await visit("/iot");
      await page.locator(".sensor-card").first().waitFor();
      assert.equal(await page.locator(".sensor-card").count(), 3);
      await page.getByText("26,54", { exact: false }).first().waitFor();
      await page
        .getByText("Đơn vị nhận oC khác cấu hình C; giữ nguyên giá trị.", {
          exact: true,
        })
        .waitFor();
      await page.getByText("Trực tuyến", { exact: true }).waitFor();
      await page.screenshot({
        path: `${screenshots}/iot-desktop.png`,
        fullPage: true,
      });
      const history = page.locator(".monitor-section").filter({
        has: page.getByRole("heading", {
          name: "Lịch sử số đo",
          exact: true,
        }),
      });
      await history.locator("tbody tr").first().waitFor();
      assert.equal(await history.locator("tbody tr").count(), 20);
      await history.getByRole("button", { name: "Sau", exact: true }).click();
      await page.waitForFunction(
        () =>
          document.querySelectorAll(".monitor-section:last-of-type tbody tr")
            .length === 6,
      );
      await page
        .getByLabel("Mã stream (không bắt buộc)", { exact: true })
        .fill("301");
      await page
        .getByRole("button", { name: "Lọc lịch sử", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document.querySelectorAll(".monitor-section:last-of-type tbody tr")
            .length === 1,
      );
      await page.getByLabel("Từ lúc", { exact: true }).fill("2030-01-01T00:00");
      await page
        .getByLabel("Đến trước lúc", { exact: true })
        .fill("2020-01-01T00:00");
      await page
        .getByRole("button", { name: "Lọc lịch sử", exact: true })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "bắt đầu trước kết thúc" })
        .waitFor();
      await page
        .getByLabel("Thiết bị / mã trạm", { exact: true })
        .selectOption(otherDevice.id);
      await page
        .getByText("Nhiệt độ không khí B", { exact: true })
        .first()
        .waitFor();
      assert.equal(await page.locator(".sensor-warning").count(), 0);
      assert.equal(await page.locator(".sensor-card").count(), 1);
      assert.equal(
        await page.getByText("Nhiệt độ không khí A", { exact: true }).count(),
        0,
      );
      await page
        .getByLabel("Thiết bị / mã trạm", { exact: true })
        .selectOption(device.id);
      await page
        .getByText("Đơn vị nhận oC khác cấu hình C; giữ nguyên giá trị.", {
          exact: true,
        })
        .waitFor();
    },
  );
  await check(
    "inactive metadata rejects new MQTT readings and preserves historical values",
    async () => {
      await http(
        `sensors/${sensor.id}`,
        "PATCH",
        { status: "Inactive" },
        ownerToken,
      );
      const rejected = mqtt.brokerStatus(adminId).rejected_readings;
      broker.publish(device.station_id, [
        { dataStreamId: 301, result: "99 C" },
      ]);
      await until(
        () => mqtt.brokerStatus(adminId).rejected_readings > rejected,
      );
      assert.equal(
        telemetry
          .latest(ownerId, device.id, { limit: 20, offset: 0 })
          .items.find((item) => item.data_stream_id === "301").value,
        26.54,
      );
      await http(
        `sensors/${sensor.id}`,
        "PATCH",
        { status: "Active" },
        ownerToken,
      );
      await http(
        `devices/${device.id}`,
        "PATCH",
        { status: "Inactive" },
        ownerToken,
      );
      const rejectedDevice = mqtt.brokerStatus(adminId).rejected_readings;
      broker.publish(device.station_id, [
        { dataStreamId: 301, result: "98 C" },
      ]);
      await until(
        () => mqtt.brokerStatus(adminId).rejected_readings > rejectedDevice,
      );
      assert.equal(
        telemetry.history(ownerId, device.id, { limit: 20, offset: 0 }).total,
        26,
      );
      await http(
        `devices/${device.id}`,
        "PATCH",
        { status: "Active" },
        ownerToken,
      );
    },
  );
  await check(
    "visible page polls new MQTT readings without manual refresh",
    async () => {
      await visit("/iot");
      await page.locator(".sensor-card").first().waitFor();
      broker.publish(device.station_id, [
        { dataStreamId: 301, result: "29 oC" },
      ]);
      await page
        .locator(".sensor-card")
        .filter({ hasText: "Nhiệt độ không khí A" })
        .locator("strong")
        .filter({ hasText: "29" })
        .waitFor({ timeout: 23000 });
    },
  );
  await check("mobile layout and menu without body overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await visit("/");
    await page.locator(".stat-card").first().waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    await page.getByRole("button", { name: "Mở menu", exact: true }).click();
    await page.locator(".sidebar.open").waitFor();
    await page.getByRole("link", { name: "Cây trồng", exact: true }).click();
    await page.locator("tbody tr").first().waitFor();
    assert.equal(await page.locator(".sidebar.open").count(), 0);
    await visit("/");
    await page.locator(".stat-card").first().waitFor();
    await page.screenshot({
      path: `${screenshots}/farmer-mobile.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Mở menu", exact: true }).click();
    await logout();
    assert.equal(await page.evaluate(() => sessionStorage.length), 0);
    await page.screenshot({
      path: `${screenshots}/login-mobile.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check(
    "Farmer registration becomes Active with no farm or owner claims",
    async () => {
      await visit("/register");
      await page
        .getByLabel("Họ và tên", { exact: true })
        .fill("Farmer đăng ký kiểm thử");
      await page
        .getByLabel("Số điện thoại", { exact: true })
        .fill("0900000010");
      await page
        .getByLabel("Mật khẩu", { exact: true })
        .fill("BrowserOnly123!");
      await page
        .getByRole("button", { name: "Xác nhận đăng ký", exact: true })
        .click();
      await heading("Đăng ký thành công");
      const signed = await http(
        "auth/login",
        "POST",
        { phone_number: "0900000010", password: "BrowserOnly123!" },
        undefined,
        200,
      );
      assert.equal(signed.user.status, "Active");
      assert.equal(signed.user.is_owner, false);
    },
  );
  await check(
    "password reset uses explicit SMS request and OTP with no account enumeration UI",
    async () => {
      await visit("/forgot-password");
      await page
        .getByLabel("Số điện thoại", { exact: true })
        .fill("0900000010");
      await page
        .getByRole("button", { name: "Gửi mã OTP", exact: true })
        .click();
      await page.getByLabel("Mã OTP", { exact: true }).waitFor();
      const otp = app
        .get(AuthService)
        .testSms("0900000010")
        .messages.at(-1).otp;
      await page.getByLabel("Mã OTP", { exact: true }).fill(otp);
      await page
        .getByLabel("Mật khẩu mới", { exact: true })
        .fill("ResetBrowserOnly123!");
      await page
        .getByRole("button", { name: "Đổi mật khẩu", exact: true })
        .click();
      await heading("Đã đổi mật khẩu");
    },
  );
  await check(
    "assignment grants current readings and ending assignment clears latest and history",
    async () => {
      const worker = await http(
        "auth/login",
        "POST",
        { phone_number: "0900000010", password: "ResetBrowserOnly123!" },
        undefined,
        200,
      );
      const request = await http(
        `zones/${zone.id}/assignment-requests`,
        "POST",
        { user_id: worker.user.id },
        ownerToken,
      );
      const accepted = await http(
        `assignment-requests/${request.id}/approve`,
        "PATCH",
        {},
        worker.access_token,
      );
      broker.publish(device.station_id, [
        { dataStreamId: 301, result: "27 oC" },
        { dataStreamId: 302, result: "72 %" },
        { dataStreamId: 303, result: "50 %" },
      ]);
      await until(
        () =>
          telemetry.history(worker.user.id, device.id, { limit: 20, offset: 0 })
            .total === 3,
      );
      await login("0900000010", "ResetBrowserOnly123!");
      await visit("/iot");
      await page.locator(".sensor-card").first().waitFor();
      await page
        .locator(".monitor-section:last-of-type tbody tr")
        .first()
        .waitFor();
      await http(
        `zone-assignments/${accepted.assignment_id}/end`,
        "PATCH",
        {},
        ownerToken,
      );
      await page
        .getByRole("button", { name: "Làm mới lịch sử số đo", exact: true })
        .click();
      await page.getByRole("alert").waitFor();
      assert.equal(await page.locator(".sensor-card").count(), 0);
      assert.equal(await page.locator(".monitor-section tbody tr").count(), 0);
      await page.getByRole("button", { name: "Thử lại", exact: true }).click();
      await page.getByRole("alert").waitFor();
      assert.equal(await page.locator(".sensor-card").count(), 0);
      await logout();
    },
  );
  async function registerManager(phone, email, name) {
    await visit("/register");
    await page
      .getByRole("button", { name: "Manager HTX", exact: true })
      .click();
    await page.getByLabel("Họ và tên", { exact: true }).fill(name);
    await page.getByLabel("Số điện thoại", { exact: true }).fill(phone);
    await page
      .getByLabel("Email (bắt buộc xác minh)", { exact: true })
      .fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill("BrowserOnly123!");
    await page
      .getByRole("button", { name: "Gửi mã xác minh email", exact: true })
      .click();
    await page.getByLabel("Mã xác minh email", { exact: true }).waitFor();
    assert(codes.has(email));
    await page
      .getByLabel("Mã xác minh email", { exact: true })
      .fill(codes.get(email));
    await page
      .getByRole("button", { name: "Xác minh email", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Xác nhận đăng ký", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Xác nhận đăng ký", exact: true })
      .click();
    await heading("Đăng ký thành công");
    const pending = (
      await http("users/pending-managers", "GET", undefined, adminToken)
    ).users.find((user) => user.phone_number === phone);
    assert.equal(pending.status, "Pending");
    assert.equal(pending.gmail_verify, true);
    return pending;
  }
  let manager;
  await check(
    "Manager email verification registers Pending and blocks login",
    async () => {
      manager = await registerManager(
        "0900000011",
        "manager-browser@example.com",
        "Manager kiểm thử browser",
      );
      await login("0900000011", "BrowserOnly123!");
      await page
        .getByRole("alert")
        .filter({ hasText: "chưa được duyệt" })
        .waitFor();
      assert.equal(await page.locator(".sidebar").count(), 0);
    },
  );
  await check(
    "Admin dashboard and HTX create edit unique conflict",
    async () => {
      await login("0900000001", "LocalAdminOnly123!");
      await heading("Tổng quan hệ thống");
      await page.locator(".stat-card").first().waitFor();
      assert.equal(await page.locator(".stat-card").count(), 4);
      await page.screenshot({
        path: `${screenshots}/admin-desktop.png`,
        fullPage: true,
      });
      await visit("/cooperatives/new");
      await page
        .getByLabel("Tên hợp tác xã", { exact: true })
        .fill("HTX mới kiểm thử");
      await page
        .getByLabel("Người đại diện / giám đốc", { exact: true })
        .fill("Đại diện mới");
      await page
        .getByLabel("Số chứng nhận", { exact: true })
        .fill("WEB-COOP-1");
      await page
        .getByLabel("Số điện thoại liên hệ", { exact: true })
        .fill("0900000015");
      await page.getByLabel("Địa chỉ", { exact: true }).fill("Bến Tre");
      await page
        .getByRole("button", { name: "Tạo hợp tác xã", exact: true })
        .click();
      await page.getByRole("alert").waitFor();
      assert.equal(
        await page.getByLabel("Tên hợp tác xã", { exact: true }).inputValue(),
        "HTX mới kiểm thử",
      );
      await page
        .getByLabel("Số chứng nhận", { exact: true })
        .fill("WEB-COOP-2");
      await page
        .getByRole("button", { name: "Tạo hợp tác xã", exact: true })
        .click();
      await heading("HTX mới kiểm thử");
      await page.getByRole("link", { name: "Chỉnh sửa", exact: true }).click();
      await page
        .getByLabel("Địa chỉ", { exact: true })
        .fill("Bến Tre cập nhật");
      await page
        .getByRole("button", { name: "Lưu thay đổi", exact: true })
        .click();
      await heading("HTX mới kiểm thử");
      await page.getByText("Bến Tre cập nhật", { exact: true }).waitFor();
    },
  );
  await check(
    "approve existing HTX, preserves UUID and enables scoped Manager dashboard",
    async () => {
      await visit("/pending-managers");
      const row = page.locator("tr").filter({ hasText: manager.user_name });
      await row.getByRole("button", { name: "Duyệt", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByLabel("Chọn HTX chưa có Manager", { exact: true })
        .selectOption(coop.id);
      await dialog
        .getByRole("button", { name: "Kiểm tra và xác nhận", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Xác nhận duyệt", exact: true })
        .click();
      await page.getByText(/Đã kích hoạt Manager kiểm thử browser/).waitFor();
      const active = await http(
        "auth/login",
        "POST",
        { phone_number: "0900000011", password: "BrowserOnly123!" },
        undefined,
        200,
      );
      assert.equal(active.user.id, manager.id);
      assert.equal(active.user.status, "Active");
      await logout();
      await login("0900000011", "BrowserOnly123!");
      await heading("Tổng quan hoạt động HTX");
      assert.equal(
        await page
          .getByRole("link", { name: "Duyệt Manager", exact: true })
          .count(),
        0,
      );
      await visit("/cooperatives");
      await page.locator("tbody tr").first().waitFor();
      assert.equal(await page.locator("tbody tr").count(), 1);
      await visit(`/farms/${farmAccepted.farm_id}`);
      await page
        .getByRole("alert")
        .filter({ hasText: "Không tìm thấy" })
        .waitFor();
      assert.equal(
        await page
          .getByRole("heading", { name: "WEB-FARM", exact: true })
          .count(),
        0,
      );
      await visit("/pending-managers");
      await heading("Không có quyền truy cập");
      await logout();
    },
  );
  await check(
    "reject Pending Manager requires explicit confirmation",
    async () => {
      const rejected = await registerManager(
        "0900000012",
        "reject-browser@example.com",
        "Manager từ chối kiểm thử",
      );
      await login("0900000001", "LocalAdminOnly123!");
      await visit("/pending-managers");
      const row = page.locator("tr").filter({ hasText: rejected.user_name });
      await row
        .getByRole("button", {
          name: `Từ chối ${rejected.user_name}`,
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("button", { name: "Kiểm tra và xác nhận", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Xác nhận từ chối", exact: true })
        .click();
      await page
        .getByText(/Đã từ chối tài khoản Manager từ chối kiểm thử/)
        .waitFor();
      assert.equal(
        app.get(MockUserStore).findById(rejected.id).status,
        "Reject",
      );
    },
  );
  await check(
    "Manager HTX overview, accepted assignments, farm filter and confirmed harvest totals",
    async () => {
      const managerToken = (
        await http(
          "auth/login",
          "POST",
          { phone_number: "0900000011", password: "BrowserOnly123!" },
          undefined,
          200,
        )
      ).access_token;
      const secondRequest = await http(
        "farms/requests",
        "POST",
        {
          area_size: 1,
          address: "Vườn thứ hai trong HTX",
          certificate_number: "WEB-FARM-2",
          longitude: 106,
          latitude: 10,
        },
        ownerToken,
      );
      const secondFarm = await http(
        `farm-requests/${secondRequest.id}/approve`,
        "PATCH",
        {},
        adminToken,
      );
      const secondZone = await http(
        "zones",
        "POST",
        {
          farm_id: secondFarm.farm_id,
          standard_id: standard.id,
          zone_name: "Khu hai đã phân công",
          area_size: 0.5,
          longitude: 106,
          latitude: 10,
        },
        ownerToken,
      );
      const secondTree = await http(
        "trees",
        "POST",
        {
          zone_id: secondZone.id,
          variety: "Monthong kiểm thử",
          plant_date: "2024-05-01T08:00:00+07:00",
          longitude: 106,
          latitude: 10,
        },
        ownerToken,
      );
      for (const id of [farmAccepted.farm_id, secondFarm.farm_id]) {
        const join = await http(
          `farms/${id}/join-requests`,
          "POST",
          { cooperative_id: coop.id },
          ownerToken,
        );
        await http(`farm-requests/${join.id}/approve`, "PATCH", {}, adminToken);
        await http(
          `farm-requests/${join.id}/approve`,
          "PATCH",
          {},
          managerToken,
        );
      }
      const worker = await http(
        "auth/login",
        "POST",
        { phone_number: "0900000010", password: "ResetBrowserOnly123!" },
        undefined,
        200,
      );
      const assignmentRequest = await http(
        `zones/${secondZone.id}/assignment-requests`,
        "POST",
        { user_id: worker.user.id },
        ownerToken,
      );
      await http(
        `assignment-requests/${assignmentRequest.id}/approve`,
        "PATCH",
        {},
        worker.access_token,
      );
      const today = new Date(Date.now() + 7 * 3600000)
        .toISOString()
        .slice(0, 10);
      for (const [target, count, weight, batch] of [
        [tree.id, 10, 30, "WEB-H-1"],
        [secondTree.id, 20, 60, "WEB-H-2"],
      ]) {
        const harvest = await http(
          "tree-harvests",
          "POST",
          {
            tree_id: target,
            season_name: "Mùa vụ kiểm thử Manager",
            harvest_date: today,
            fruit_count: count,
            total_weight_kg: weight,
            batch_code: batch,
          },
          ownerToken,
        );
        await http(
          `tree-harvests/${harvest.id}/submit`,
          "PATCH",
          {},
          ownerToken,
        );
      }
      const outsideRequest = await http(
        "farms/requests",
        "POST",
        {
          area_size: 1,
          address: "Vườn ngoài HTX",
          certificate_number: "WEB-OUTSIDE",
          longitude: 106,
          latitude: 10,
        },
        worker.access_token,
      );
      const outside = await http(
        `farm-requests/${outsideRequest.id}/approve`,
        "PATCH",
        {},
        adminToken,
      );
      await logout();
      await login("0900000011", "BrowserOnly123!");
      await heading("Tổng quan hoạt động HTX");
      await page.locator(".manager-stats").waitFor();
      assert.deepEqual(
        await page
          .locator(".manager-stats .stat-card > strong")
          .allTextContents(),
        ["2", "2", "2", "1"],
      );
      assert(
        (
          await page.locator(".harvest-stats strong").nth(1).innerText()
        ).includes("90"),
      );
      await page.screenshot({
        path: `${screenshots}/manager-desktop.png`,
        fullPage: true,
      });
      await page
        .getByLabel("Vườn thành viên", { exact: true })
        .selectOption(farmAccepted.farm_id);
      await page.waitForFunction(
        () =>
          document.querySelector(".manager-stats .stat-card strong")
            ?.textContent === "1",
      );
      assert(
        (
          await page.locator(".harvest-stats strong").nth(1).innerText()
        ).includes("30"),
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(
        () =>
          document.querySelector(".sidebar").getBoundingClientRect().right <= 0,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );
      await page.screenshot({
        path: `${screenshots}/manager-mobile.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await visit(`/farms/${outside.farm_id}`);
      await page
        .getByRole("alert")
        .filter({ hasText: "Không tìm thấy" })
        .waitFor();
      await page.route("**/api/zones?limit=100*", (route) => route.abort());
      await visit("/");
      await page.getByRole("alert").waitFor();
      assert.equal(await page.locator(".manager-stats").count(), 0);
      await page.unroute("**/api/zones?limit=100*");
      await page.getByRole("button", { name: "Thử lại", exact: true }).click();
      await page.locator(".manager-stats").waitFor();
      await logout();
      await login("0900000001", "LocalAdminOnly123!");
    },
  );
  await check(
    "approve creates a new HTX atomically from real Admin form",
    async () => {
      await logout();
      const candidate = await registerManager(
        "0900000013",
        "inline-browser@example.com",
        "Manager HTX mới kiểm thử",
      );
      await login("0900000001", "LocalAdminOnly123!");
      await visit("/pending-managers");
      await page
        .locator("tr")
        .filter({ hasText: candidate.user_name })
        .getByRole("button", { name: "Duyệt", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("button", { name: "Tạo HTX mới", exact: true })
        .click();
      await dialog
        .getByLabel("Tên hợp tác xã", { exact: true })
        .fill("HTX tạo khi duyệt");
      await dialog
        .getByLabel("Người đại diện / giám đốc", { exact: true })
        .fill("Đại diện");
      await dialog
        .getByLabel("Số chứng nhận", { exact: true })
        .fill("WEB-INLINE");
      await dialog
        .getByLabel("Số điện thoại liên hệ", { exact: true })
        .fill("0900000013");
      await dialog.getByLabel("Địa chỉ", { exact: true }).fill("Đồng Nai");
      await dialog
        .getByRole("button", { name: "Kiểm tra và xác nhận", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Xác nhận duyệt", exact: true })
        .click();
      await page.getByText(/Đã kích hoạt Manager HTX mới kiểm thử/).waitFor();
      const coops = await http(
        "cooperatives?q=WEB-INLINE",
        "GET",
        undefined,
        adminToken,
      );
      assert.equal(coops.total, 1);
      assert.equal(coops.items[0].manager_id, candidate.id);
    },
  );
  await check(
    "concurrent approval 409 locks retry and reconciles current server state",
    async () => {
      await logout();
      const candidate = await registerManager(
        "0900000014",
        "concurrent-browser@example.com",
        "Manager đồng thời kiểm thử",
      );
      await login("0900000001", "LocalAdminOnly123!");
      await visit("/pending-managers");
      await page
        .locator("tr")
        .filter({ hasText: candidate.user_name })
        .getByRole("button", { name: "Duyệt", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      const available = (
        await http("cooperatives?q=WEB-COOP-2", "GET", undefined, adminToken)
      ).items[0];
      await dialog
        .getByLabel("Chọn HTX chưa có Manager", { exact: true })
        .selectOption(available.id);
      await http(
        `users/${candidate.id}/approve`,
        "PATCH",
        { cooperative_id: available.id },
        adminToken,
      );
      await dialog
        .getByRole("button", { name: "Kiểm tra và xác nhận", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Xác nhận duyệt", exact: true })
        .click();
      await dialog.getByRole("alert").waitFor();
      assert.equal(
        await dialog
          .getByRole("button", { name: "Kiểm tra và xác nhận", exact: true })
          .isDisabled(),
        true,
      );
      await dialog
        .getByRole("button", {
          name: "Kiểm tra trạng thái mới nhất",
          exact: true,
        })
        .click();
      await dialog
        .getByRole("alert")
        .filter({ hasText: "không còn trong danh sách chờ" })
        .waitFor();
      await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
      await page
        .getByText("Đã tải lại danh sách tài khoản chờ duyệt.", { exact: true })
        .waitFor();
    },
  );
  await check(
    "expired stored JWT is discarded before protected pages render",
    async () => {
      await page.evaluate(() => {
        const token = sessionStorage.getItem("smart-durian.access-token");
        const parts = token.split(".");
        parts[1] = window.btoa(JSON.stringify({ exp: 1 }));
        sessionStorage.setItem("smart-durian.access-token", parts.join("."));
      });
      await page.reload();
      await heading("Đăng nhập");
      assert.equal(await page.locator(".sidebar").count(), 0);
      assert.equal(await page.evaluate(() => sessionStorage.length), 0);
      await login("0900000001", "LocalAdminOnly123!");
    },
  );
  await check(
    "server token revocation closes session and removes protected data",
    async () => {
      await visit("/materials");
      await page.locator("tbody tr").first().waitFor();
      const admin = app.get(MockUserStore).findByPhone("0900000001");
      app.get(MockUserStore).revokeTokens(admin.id);
      await page.getByRole("button", { name: "Làm mới", exact: true }).click();
      await heading("Đăng nhập");
      assert.equal(await page.locator("tbody tr").count(), 0);
      assert.equal(await page.evaluate(() => sessionStorage.length), 0);
    },
  );
  assert.deepEqual(errors, [], "Uncaught browser errors");
  writeFileSync(
    `${screenshots}/report.json`,
    JSON.stringify(
      {
        checked_at: new Date().toISOString(),
        passed: results,
        browser: "Chromium / locally installed Edge or WEB_TEST_BROWSER",
        api: "real isolated Nest controllers/services; SMTP capture; mock SMS; real MQTT.js TCP to loopback broker; RAM stores",
        screenshots: [
          "login-desktop.png",
          "login-mobile.png",
          "farmer-desktop.png",
          "farmer-mobile.png",
          "admin-desktop.png",
          "iot-desktop.png",
          "manager-desktop.png",
          "manager-mobile.png",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    `${results.length} browser checks passed. Artifacts: apps/web/test-results`,
  );
} finally {
  await browser?.close();
  await vite?.close();
  await app.close();
  await broker.close();
}
