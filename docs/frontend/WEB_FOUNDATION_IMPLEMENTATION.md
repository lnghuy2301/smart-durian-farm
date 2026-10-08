# Smart Durian Web: triển khai và tái lập

Cập nhật 2026-10-08. Frontend React + TypeScript + Vite tại `apps/web`, kế thừa backend f20f6c1 và review 4a8bdd7; không tạo backend/API mới. Bộ nhận diện dùng nguyên nguồn `assets/brand/Smart_Durian_Brand_Kit`. Mẫu tham khảo chỉ nằm ở docs, không có demo script trong runtime. [Quyết định thích nghi mẫu](DESIGN_ADAPTATION.md) ghi rõ chỗ lệch hợp đồng.

## Phạm vi đã triển khai

Auth phone/password → /auth/me, đăng ký Farmer Active/Manager email verified Pending, quên mật khẩu OTP, session JWT15m theo tab, logout và xóa dữ liệu theo phiên. Dashboard Farmer/Admin, shared resource list/detail, HTX Admin create/edit và duyệt/reject Manager. **Dashboard Manager chờ người dùng cung cấp mẫu riêng**, không lấy bản sao Admin làm thiết kế. Menu và trang dữ liệu Manager hoạt động theo quyền backend.

Không có React Native trong đợt này. Không có actuator control/publish task, Cultivation/AI/Blockchain/public QR hoặc chuyển business store sang database. Không mở mutation tài nguyên chỉ đọc khi chưa có mẫu nghiệp vụ. Không tự gửi email/SMS để demo; mọi yêu cầu gửi OTP phải do người dùng bấm.

## Cách chạy trên Windows

Yêu cầu Node >=20.19 (đã kiểm tra Node20.20.0), npm10, browser hiện đại hỗ trợ native dialog. Tại root:

```powershell
npm ci
# Terminal 1: chạy API với cấu hình backend hiện có
npm run dev:api
# Terminal 2: chạy web
npm run dev:web
```

Web tại http://127.0.0.1:5173, API mặc định http://127.0.0.1:3000. Nếu API dùng port khác, tạo **apps/web/.env.local** theo apps/web/.env.example và chỉ điền `WEB_DEV_API_TARGET=http://127.0.0.1:PORT`; restart Vite. Không sao chép .env root vào web. `VITE_API_BASE_URL=/api` là cấu hình public, không chứa secret. WEB_DEV_API_TARGET chỉ ở máy dev, không nằm trong bundle. Không đổi cách normalize số điện thoại: login dùng đúng chuỗi đã đăng ký.

Khởi chạy backend có thể cần cấu hình database/provisioning đã mô tả trong README backend; web không kiểm tra hoặc tự sửa credentials. Business store hiện còn RAM, nên account đăng ký, HTX, farms và số đo sẽ mất khi restart process. Token mất hiệu lực khi mock user/version thay đổi; UI tự đưa về login ở 401. Chỉ account Active vào được shell; Manager Pending không vào.

Production: `npm run build:web` tạo apps/web/dist, `npm run preview -w apps/web` để xem bản build local. Deploy phải có HTTPS, route `/api` reverse proxy tới Nest và SPA fallback index.html cho các deep link; Vite dev proxy không tồn tại trong dist. Nếu dùng API khác origin thì cấu hình CORS backend theo origin cụ thể, không đưa JWT_SECRET/SMTP/MQTT credentials vào VITE_*. Chưa deploy trong đợt này.

## Module và branch local

Các branch là chuỗi phụ thuộc: branch sau kế thừa commit branch trước, để chạy đủ bộ mà không phải cherry-pick. Không push/merge/main trong đợt này.

| Branch | Guide | Phần triển khai |
|---|---|---|
| chore/web-reference-preparation | references/stitch_smart_durian_farmer_dashboard/README.md | Dọn placeholder/trùng tham khảo, ghi manifest |
| feat/web-platform | [PLATFORM](modules/PLATFORM.md) | Workspace, brand, font, API client, UI chung |
| feat/web-auth | [AUTH](modules/AUTH.md) | Session, registration/reset/login, role shell |
| feat/web-resources | [RESOURCES](modules/RESOURCES.md) | Vật tư/tiêu chuẩn/vườn/khu/cây/thu hoạch đọc |
| feat/web-cooperatives-admin | [COOPERATIVES_ADMIN](modules/COOPERATIVES_ADMIN.md) | HTX list/detail/Admin create/edit/notifications |
| feat/web-manager-approval | [MANAGER_APPROVAL](modules/MANAGER_APPROVAL.md) | Pending table, approve/reject và conflict check |
| feat/web-dashboards | [DASHBOARDS](modules/DASHBOARDS.md) | Farmer/Admin dashboard, browser suite foundation |
| feat/web-iot-monitoring | [IOT_MONITORING](modules/IOT_MONITORING.md) | Latest/history, raw unit, presence và poll; 21 browser scenarios + 6 unit tests |

`feat/web-foundation` cũ là branch chuẩn bị trước mẫu; không phải branch chứa web hoàn chỉnh. Xem branch mới nhất trong handoff và git log trước khi chạy. Giữ các branch module để review diff theo từng bước; không xóa branch sau.

## Cấu trúc code

- src/api/client.ts: Bearer public/authenticated client, timeout20s, typed request, AbortController, giải thích HTTP lỗi, không retry mutation. 401 chỉ đóng authenticated session. Dispose làm vô hiệu response đang await cả fetch lẫn JSON.
- src/auth/session.tsx và token.ts: sessionStorage chỉ có token; GET me trước render; exp + expires_in, hẹn hết hạn và kiểm tra lúc focus. Context không có dữ liệu resource. Shell remount theo token để không giữ cache tài khoản khác.
- src/hooks/useResource.ts: key path+query, loading/empty/error/retry, abort và loại response cũ. useTask: mutation submit thủ công, khoá đồng thời, abort rời trang.
- src/components: Brand trỏ shared kit, shell/nav/guard, form fields có nhãn trợ năng tường minh, table/pagination/notice/modal dùng chung.
- src/pages: từng nhóm nghiệp vụ ở file riêng, field types theo response thật trong src/types/api.ts. Không suy schema từ Swagger khi thiếu response model.
- test/client.test.ts/token.test.ts: các invariant session/client có ý nghĩa. test/e2e.mjs: backend thật + browser qua Vite proxy, provider giả chỉ ở harness.

## Tái lập kiểm tra và dữ liệu

```powershell
npm run lint:web
npm run typecheck:web
npm run test:web
npm run build:web
npm run test:web:e2e
```

Browser suite compile backend vào apps/api/.test-dist, tạo Nest ở port ngẫu nhiên, store RAM riêng, Vite port ngẫu nhiên, Edge headless có sẵn. Nếu Edge khác path đặt `$env:WEB_TEST_BROWSER='C:\path\to\chrome.exe'` trước chạy. Không cần root .env, DB/broker thật hoặc npm tải browser. Test không sửa backend business code; cuối suite đóng browser/Vite/Nest.

Seed suite qua HTTP thật: login account test được backend config tạo, tạo materials/standard/farm-request, Admin approve farm, owner create zone/tree, Admin create HTX. Account mới đăng ký qua UI; email OTP đọc từ capture EmailSender trong process harness, không mở endpoint lấy email OTP trong sản phẩm. Password/OTP/token chỉ test process, report không ghi ra. Những số điện thoại/password trong file test là fixture cô lập, không phải thông tin đăng nhập backend đang chạy của người dùng.

Foundation trước IoT đã đạt **13 browser scenarios + 5 unit tests**, lint/typecheck/build. Coverage: assets/login desktop, sai mật khẩu, Farmer total/restore, catalog server pagination/search/detail/empty, farm/zone/tree/standard/harvest đọc, network error/retry, mobile390/menu/no body overflow, Farmer register, Manager verify→Pending/login blocked, Admin HTX create/edit/unique409 giữ form, approve existing giữ UUID→Manager login/scope/guard/chờ mẫu, reject explicit confirm, server revoke→xóa session/protected data. Screenshot desktop1440x1000/mobile390x844 tại apps/web/test-results (ignored), report.json không chứa credentials. Mở PNG hoặc chạy lại suite để tái lập; không commit screenshot test có dữ liệu fixture vào nguồn thiết kế.

Các trường hợp cần test thủ công trong môi trường thật: SMTP delivery/spam, SMS provider delivery/rate limits, credentials/port thực, database/broker/hardware, tài khoản hoặc quyền đổi giữa nhiều browser. Browser failure tests có route abort giả để kiểm tra UI lỗi; không dùng mock response cho happy path. Dữ liệu test không chứng minh hardware hay persistence production.

## Quy tắc thao tác và lỗi

Search theo đúng field backend, phân trang server khi có Page; pending Manager API không pagination thì client search trên toàn list và ghi rõ. Không gửi q cho endpoint không có DTO q. UUID chỉ làm khóa/link; UI dùng tên/mã/địa chỉ thật. Không có input UUID tuỳ ý để giả chọn dữ liệu chưa có directory API. Client guard hỗ trợ điều hướng, backend là nơi quyết định quyền.

400 giữ form để sửa; 401 authenticated đóng toàn phiên; login401 giữ form báo sai thông tin; 403 không mở rộng scope; 404 không giữ dữ liệu không còn được truy cập; 409 giữ form và kiểm tra dữ liệu mới; 429 cooldown/manual retry; 503 hiện dịch vụ chưa sẵn sàng. Network/timeout mutation không tự retry. Approval có bước reconcile GET pending + HTX để biết tài khoản còn chờ và HTX còn khả dụng trước khi thao tác lại. HTX editor chỉ gửi 5 field được phép và field thực sự thay đổi.

## Dọn dẹp và bảo toàn

Xem manifest reference cho danh sách exact duplicate đã xóa. Đã bỏ placeholder folder rỗng AI/mobile/reference html/images; chỉ tạo lại khi có file thật. Giữ node_modules/dist/.test-dist là build/dependency hữu ích, không xóa để rồi tải lại. `.env` root và các thay đổi ERD/MQTT/Postman riêng của người dùng không được stage. Original HTML/screen còn lại giữ nguyên để review thiết kế. Nguồn brand vẫn 46 file, không nhân bản kit vào public.
