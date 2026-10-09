# Xác thực và điều hướng web

Branch: `feat/web-auth`, kế thừa `feat/web-platform`. Mẫu: `login_register`.

Bản UI mới nhất ngày 2026-10-09: `fix/web-registration-spacing`, kế thừa `fix/web-registration-role-transition` dcfe54e và toàn bộ các module web.

Panel trái được cập nhật riêng tiếp trên `feat/web-auth-orchard-panel`: ảnh vườn người dùng chọn, logo trắng và nội dung giới thiệu mới. Cột phải và hiệu ứng giữ nguyên; xem [asset, phạm vi và21 đối chiếu trước/sau](AUTH_INTRO_PANEL.md).

## Hợp đồng và hành vi

- Đăng nhập POST `/api/auth/login` với `phone_number`, `password`; sau đó GET `/api/auth/me`. Chỉ user Active và role Admin/Manager/Farmer được mở shell. Role do server trả, không có bộ chọn role đăng nhập.
- Token chỉ lưu `sessionStorage` theo tab. Không lưu password, OTP, email proof, profile hay dữ liệu tài nguyên. `exp` dùng điều khiển UI; chữ ký và quyền do server xác minh. Deadline lấy mốc sớm hơn JWT exp và `expires_in`. Không refresh token. Khi hết hạn, 401 hoặc logout: dispose client, abort request, xóa token và unmount cả shell theo phiên; response đến trễ không được ghi vào phiên mới.
- Khi reload: GET `/auth/me` trước khi hiện dữ liệu. Khôi phục lỗi đưa về đăng nhập, hiển thị nguyên nhân. Khi browser thức lại/focus: kiểm tra expiry ngay. Logout chỉ ở client vì backend chưa có endpoint logout.
- Đăng ký chỉ Farmer/Manager. Farmer không chọn farm, owner hay HTX; tài khoản Active. Manager phải xác minh email: POST `/auth/registration/email/request` → POST `/verify` → POST `/auth/register` với `email_verification_token`. UUID tài khoản đã tồn tại từ bước đăng ký, status Pending; Admin approve mới kích hoạt. Chưa có OTP điện thoại trong đăng ký.
- Challenge và proof ràng buộc điện thoại/email. Thay một trong hai hoặc role xóa challenge/proof. Proof giữ trong RAM; hết deadline phải xác minh lại. Gửi email do người dùng bấm, cooldown 60 giây, không retry tự động. Email không giới hạn domain Gmail. SMTP chưa cấu hình có thể trả 503, UI hiển thị lỗi.
- Form Farmer chỉ có họ tên, điện thoại và mật khẩu, không hiển thị hoặc gửi email. API backend vẫn hỗ trợ email Farmer tùy chọn; không thay đổi hợp đồng backend. Không có nhánh Owner giả lập hoặc tạo vườn ngay trong đăng ký.
- Quên mật khẩu: POST `/auth/forgot-password` → POST `/auth/reset-password` với OTP 6 chữ số. Response 202 là thông báo chống lộ tài khoản, không chứng minh SMS đã được gửi. Cooldown UI 60 giây; backend quyết định rate limit và hiệu lực. Không dùng `/auth/test/sms` trong ứng dụng.
- Client không retry mutation và hủy form request khi rời trang. Password không trim, số điện thoại không chuyển đổi `0`/`+84`. Form giới hạn đúng DTO. Lỗi 401 đăng nhập là sai thông tin; 401 authenticated đóng phiên. 403 Pending hiển thị lỗi server, không suy đoán trạng thái cụ thể.

## UI và quyền

Hero, bố cục hai cột, vai trò đăng ký, các field lấy từ mẫu và cân lại cho hợp đồng thực. Dùng logo/pattern của brand kit; không tải ảnh hay font từ CDN. Mobile chỉ hiện form và logo. Sidebar/topbar thống nhất, menu mobile đóng bằng backdrop, bàn phím có skip link và focus visible. Các trang Admin có guard riêng và backend vẫn kiểm tra quyền. [Dashboard Manager](MANAGER_DASHBOARD.md) đã được triển khai sau khi người dùng chốt mẫu mới riêng.

### Bố cục đăng ký hiện tại

Theo yêu cầu cân lại cột phải và bỏ email Farmer, bản 2026-10-09 mở rộng card tối đa440px, giảm khoảng cách giữa các field/header/role-tabs và đổi thông báo vai trò thành hướng dẫn nhỏ thay vì khung màu lớn. Bỏ gợi ý điện thoại "dùng số đã đăng ký" ở form đăng ký vì đây là số mới; login/reset vẫn giữ gợi ý. Input giữ kích thước và nút hiển thị mật khẩu như trước. Cột phải có padding trên40–64px, dưới64–88px theo chiều cao viewport; footer cách card24px. Chỉ route /register dùng các override, không đổi layout login/reset.

Desktop rộng trên900px và cao ít nhất680px: cột giới thiệu sticky, cao100dvh; không co giãn theo email/OTP của form bên phải. Màn hình thấp/mobile cuộn theo nội dung tự nhiên, không cắt phần cuối hoặc ép form vào height cố định. Ở1440×900, form Manager và footer nằm trọn trong viewport, khoảng trống dưới footer khoảng73px; Farmer khoảng117px. Đây là số đo tại viewport cụ thể, không phải pixel cố định cho mọi màn hình.

Email chỉ xuất hiện khi chọn Manager. Wrapper dùng Grid `0fr↔1fr` và opacity để mở/thu trong240ms, xử lý đổi role liên tiếp mà không đo height bằng JS. Khi Farmer: vùng email có `aria-hidden`, `inert`, input disabled/không required và height0; không giữ khoảng trống email, không nằm trong tab order hoặc chặn native validation. Giá trị email giữ trong RAM để trở lại Manager không mất nội dung; request Farmer luôn loại `gmail` dù trước đó đã nhập email Manager. Challenge/proof vẫn bị xóa khi đổi role, điện thoại hoặc email. Manager vẫn xác minh email trước khi gửi register Pending. Reduced motion tắt chuyển động.

Kiểm chứng mới: sáu viewport1440×900,1440×1200,1280×720,900×900,390×844,320×700 không overflow ngang; footer giữ đủ khoảng đệm dưới; hero desktop giữ nguyên chiều cao giữa hai role. Có frame trung gian khi email mở, đổi role nhanh vẫn về đúng trạng thái, giữ các giá trị form và email ẩn không làm Farmer invalid. Lint, TypeScript/production build và format check đạt. **22 browser scenarios với API Nest thật đạt**, trong đó test nhập email Manager→chọn Farmer→đăng ký và login nhận `gmail:null`, cùng flow Manager OTP→Pending/Admin duyệt. SMTP/SMS vẫn dùng fake provider của harness, không root .env hay gửi tin thật.

Tái lập: chạy `npm run dev:api` và `npm run dev:web`, mở /register. Farmer có3 trường; chọn Manager để email mở nhẹ. Nhập email không hợp lệ ở Manager rồi chuyển Farmer: trường email biến mất và không chặn submit. Chuyển lại Manager giữ nội dung email nhưng phải xác minh mới. Kiểm tra desktop900px cao và mobile320/390px rộng, cuộn cuối trang để thấy khoảng đệm dưới. Ảnh kiểm tra mới ghi đè `register-farmer-desktop.png`, `register-manager-desktop.png`, `register-farmer-mobile.png`, `register-manager-mobile.png` trong apps/web/test-results (ignored). Để kiểm chứng luồng API chạy `npm run test:web:e2e` từ root.

### Lịch sử sửa chuyển vai trò ngày 2026-10-08

Các số đo0px và email Farmer tùy chọn bên dưới thuộc commit dcfe54e trước khi người dùng yêu cầu bỏ email. Bản hiện tại thay đổi chiều cao form có animation khi mở/thu email, không giữ một chỗ trống giả cho Farmer.

Sửa ngày 2026-10-08 trên branch `fix/web-registration-role-transition`, kế thừa `feat/web-manager-dashboard`. Trước sửa, chọn Farmer→Manager thêm Notice vào flow và làm form/nút submit/khung desktop tăng đột ngột khoảng104–126px tùy viewport. Vùng `registration-role-guidance` hiện dùng CSS Grid: hai thông báo Farmer/Manager cùng một ô, chiều cao tự lấy nội dung lớn hơn theo bề rộng thực. Không đặt height cố định hoặc đo DOM bằng JavaScript; text wrap/zoom vẫn theo flow tự nhiên. Cả hai vai trò đều có hướng dẫn nghiệp vụ thực, không chừa khung trống.

Thông báo hoạt động chuyển opacity trong180ms; thông báo còn lại `visibility:hidden` và `aria-hidden=true`, giữ chỗ nhưng không được screen reader đọc. Nút chọn role dùng cùng font-weight và chuyển màu/background/border nhẹ. `prefers-reduced-motion:reduce` tắt các transition này. Không đổi registration/email OTP API, việc xóa challenge/proof khi đổi role hoặc required của email Manager.

Kiểm chứng trình duyệt Edge headless trên viewport1440×900,1440×1200,1280×720,900×900,390×844,320×700: đổi role hai chiều nhiều lần, đo vị trí/kích thước layout/hero/card/form/submit trong16 frame mỗi lần; chênh lệch tối đa **0px**, không overflow ngang. Kiểm tra giữ giá trị form, email required chỉ ở Manager, chỉ một hướng dẫn được cung cấp cho trợ năng, reduced motion tắt transition và bấm đổi role không gửi OTP/register request. Ảnh fixture `register-farmer-desktop.png`, `register-manager-desktop.png`, `register-farmer-mobile.png`, `register-manager-mobile.png` trong apps/web/test-results (ignored). Web lint và production build (bao gồm TypeScript) đạt.

Tái lập thủ công: mở /register, đổi Farmer↔Manager ở desktop/mobile khi chưa gửi OTP; heading, các field, nút submit và cột giới thiệu giữ vị trí, nội dung hướng dẫn đổi nhẹ. Nhập các field rồi đổi role để kiểm tra giữ dữ liệu; email Farmer tùy chọn, Manager bắt buộc. Các bước nhập OTP sau khi chủ động gửi mã vẫn thêm field theo workflow đã có.

## Kiểm tra tái lập

Chạy `npm run lint:web`, `npm run typecheck:web`, `npm run test:web`, `npm run build:web` từ root. Unit test kiểm tra expiry malformed, huỷ phiên/response trễ, 401 và không retry conflict. Kiểm tra trình duyệt end-to-end được ghi ở tài liệu tổng sau khi các module tích hợp. Test dùng account cô lập, không ghi mật khẩu thật hoặc token vào tài liệu.
