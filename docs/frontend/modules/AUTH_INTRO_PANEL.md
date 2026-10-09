# Panel giới thiệu xác thực — ảnh vườn sầu riêng

Ghi chú cập nhật: phần bên dưới ghi nhận lần triển khai panel trái ban đầu. Đợt [tăng cỡ chữ toàn web](../UI_READABILITY.md) được người dùng yêu cầu sau đó điều chỉnh cả typography và khung form; các minimum và chiều rộng mô tả cũ không còn là giá trị hiện tại. Khối tiêu đề đã được nới lên 560 px, giữ tiêu đề 36–48 px.

Ngày 2026-10-09, branch `feat/web-auth-orchard-panel`, kế thừa `fix/web-registration-spacing` 1e74435. Phạm vi chỉ panel trái dùng chung của AuthLayout; toàn bộ markup/logic LoginPage, RegisterPage, ForgotPasswordPage, cột phải và stylesheet chung giữ nguyên.

## Asset và component

Nguồn do người dùng chọn: `docs/frontend/references/stitch_smart_durian_farmer_dashboard/login_register/Vườn sầu riêng chân thực buổi sáng.png`. Đã xem ảnh trước khi dùng: trời sáng phía trên trái, đất nâu phía dưới, thân cây và quả bên phải; không dùng screen.png. Sao chép nguyên bản vào `apps/web/src/assets/auth/durian-orchard-morning.png`; cả hai có SHA-256 `E0141CD227D7AC096BAD99AAACA6A3BA3B3D89DA955647214CAA1CA3A263CE62`. File nguồn trong docs được giữ nguyên, không tải/tạo ảnh khác.

`src/components/AuthIntroPanel.tsx` import asset bằng Vite để dev/build có URL hợp lệ; không dùng URL Windows hoặc đọc ảnh từ docs ở runtime. Ảnh trang trí có alt rỗng; logo vẫn là Brand light với SVG trắng hiện có. Nội dung mới là nhãn SMART DURIAN, tiêu đề Chăm sóc thông minh / Nguồn gốc rõ ràng và mô tả đúng yêu cầu. Không còn ba dòng tính năng/icon, khẩu hiệu vàng, CTA hoặc thẻ bổ sung.

`AuthIntroPanel.css` chỉ chọn class trong panel trái. Ảnh cover, object-position62% center; neutral black gradient30% ở trên,10% giữa,58–65% phía dưới. Không filter hoặc blend màu ảnh. Logo có bóng đen tĩnh nhẹ để đọc trên trời sáng; không sửa asset/logo. Khối copy dùng flex margin-top:auto, padding32px và max-width500px; description tối đa420px. Title trắng36–48px/weight700/line-height1.2; description16–18px/line-height1.6, trắng88%; giữ font toàn dự án. Footer riêng nhỏ, không chồng lên copy. Ở panel rất hẹp, tiêu đề wrap tự nhiên.

## Bảo toàn bố cục và hành vi

Giữ class auth-story nên breakpoint ẩn mobile, padding logo, cơ chế sticky/scroll đăng ký và tỷ lệ hai cột vẫn từ CSS hiện có. Chỉ ảnh/overlay absolute; logo/copy/footer ở flex flow. Không thêm transition/animation, không sửa src/styles.css, theme, thư viện, API, validation hoặc OTP.

Ở màn đăng nhập thấp, chiều cao intrinsic của panel cũ có thể quyết định chiều cao cả hàng Grid. CSS riêng giữ các minimum đo từ baseline (705.359375px;671.015625px khi typography cũ nhỏ hơn;715.453125px/759.96875px ở hai dải tiêu đề cũ wrap). Đây là bảo toàn footprint cũ, không height cắt form. Trong chế độ registration sticky hiện có, minimum được bỏ để giữ đúng height100dvh như trước. Nếu typography/ratio panel thay đổi có chủ đích trong đợt sau, đo lại footprint; không tự dùng các giá trị này để thiết kế cột phải.

## Kiểm chứng

Đã so sánh trước/sau21 trường hợp: Login/Farmer/Manager ở1440×900,1280×720,1280×600,1024×600,901×600,390×844,320×700. Mỗi trường hợp chờ font và animation hiện có kết thúc, so sánh toàn bộ DOM cột phải, computed styles (font/color/spacing/border/gap/transition/animation), bounding rect mọi element và SHA-256 PNG crop cột phải. **Tất cả giống hệt baseline**, gồm vị trí/chiều rộng/chiều cao cột phải và cơ chế scroll. Không tràn ngang; copy không đè footer. Đã xem preview desktop và màn thấp, chỉnh chiều rộng copy để giữ hai dòng title trên desktop thông thường.

Ảnh trước/sau và baseline.json ở `apps/web/test-results/auth-panel/` (ignored), không chứa credentials. Kiểm tra source diff: AuthPages chỉ thay subtree panel trái bằng component và bỏ import Radio không còn dùng; tất cả hàm/form bên phải giữ nguyên. Web lint và build (bao gồm TypeScript) đạt. Không chạy lại backend tests cho thay đổi trình bày này; backend và root .env không thay đổi.

Tái lập: chạy `npm run dev:web`, xem /login và /register, chọn Farmer/Manager ở các viewport trên; kiểm tra ảnh, màu tự nhiên, chữ/footer, panel ẩn ở mobile. Build bằng `npm run build:web`; Vite xuất ảnh vào dist/assets với tên hash. Kiểm tra font/spacing/transition cột phải bằng DevTools hoặc các ảnh baseline; không sử dụng tài khoản/OTP thật để kiểm tra panel.
