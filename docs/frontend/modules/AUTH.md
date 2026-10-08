# Xác thực và điều hướng web

Branch: `feat/web-auth`, kế thừa `feat/web-platform`. Mẫu: `login_register`.

## Hợp đồng và hành vi

- Đăng nhập POST `/api/auth/login` với `phone_number`, `password`; sau đó GET `/api/auth/me`. Chỉ user Active và role Admin/Manager/Farmer được mở shell. Role do server trả, không có bộ chọn role đăng nhập.
- Token chỉ lưu `sessionStorage` theo tab. Không lưu password, OTP, email proof, profile hay dữ liệu tài nguyên. `exp` dùng điều khiển UI; chữ ký và quyền do server xác minh. Deadline lấy mốc sớm hơn JWT exp và `expires_in`. Không refresh token. Khi hết hạn, 401 hoặc logout: dispose client, abort request, xóa token và unmount cả shell theo phiên; response đến trễ không được ghi vào phiên mới.
- Khi reload: GET `/auth/me` trước khi hiện dữ liệu. Khôi phục lỗi đưa về đăng nhập, hiển thị nguyên nhân. Khi browser thức lại/focus: kiểm tra expiry ngay. Logout chỉ ở client vì backend chưa có endpoint logout.
- Đăng ký chỉ Farmer/Manager. Farmer không chọn farm, owner hay HTX; tài khoản Active. Manager phải xác minh email: POST `/auth/registration/email/request` → POST `/verify` → POST `/auth/register` với `email_verification_token`. UUID tài khoản đã tồn tại từ bước đăng ký, status Pending; Admin approve mới kích hoạt. Chưa có OTP điện thoại trong đăng ký.
- Challenge và proof ràng buộc điện thoại/email. Thay một trong hai hoặc role xóa challenge/proof. Proof giữ trong RAM; hết deadline phải xác minh lại. Gửi email do người dùng bấm, cooldown 60 giây, không retry tự động. Email không giới hạn domain Gmail. SMTP chưa cấu hình có thể trả 503, UI hiển thị lỗi.
- Farmer có thể nhập email nhưng không tự nhận là đã xác minh. Không có nhánh Owner giả lập hoặc tạo vườn ngay trong đăng ký.
- Quên mật khẩu: POST `/auth/forgot-password` → POST `/auth/reset-password` với OTP 6 chữ số. Response 202 là thông báo chống lộ tài khoản, không chứng minh SMS đã được gửi. Cooldown UI 60 giây; backend quyết định rate limit và hiệu lực. Không dùng `/auth/test/sms` trong ứng dụng.
- Client không retry mutation và hủy form request khi rời trang. Password không trim, số điện thoại không chuyển đổi `0`/`+84`. Form giới hạn đúng DTO. Lỗi 401 đăng nhập là sai thông tin; 401 authenticated đóng phiên. 403 Pending hiển thị lỗi server, không suy đoán trạng thái cụ thể.

## UI và quyền

Hero, bố cục hai cột, vai trò đăng ký, các field lấy từ mẫu và cân lại cho hợp đồng thực. Dùng logo/pattern của brand kit; không tải ảnh hay font từ CDN. Mobile chỉ hiện form và logo. Sidebar/topbar thống nhất, menu mobile đóng bằng backdrop, bàn phím có skip link và focus visible. Các trang Admin có guard riêng và backend vẫn kiểm tra quyền. [Dashboard Manager](MANAGER_DASHBOARD.md) đã được triển khai sau khi người dùng chốt mẫu mới riêng.

## Kiểm tra tái lập

Chạy `npm run lint:web`, `npm run typecheck:web`, `npm run test:web`, `npm run build:web` từ root. Unit test kiểm tra expiry malformed, huỷ phiên/response trễ, 401 và không retry conflict. Kiểm tra trình duyệt end-to-end được ghi ở tài liệu tổng sau khi các module tích hợp. Test dùng account cô lập, không ghi mật khẩu thật hoặc token vào tài liệu.
