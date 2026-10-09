# Cỡ chữ và cân đối bố cục web — 2026-10-09

Branch `fix/web-typography-balance` kế thừa `feat/web-auth-orchard-panel`. Người dùng đã duyệt thiết kế hiện tại và yêu cầu tăng chữ vừa phải trên toàn bộ web, đồng thời điều chỉnh khung và bố cục theo các mẫu đã có. Thay đổi này áp dụng cho đăng nhập, đăng ký, khôi phục mật khẩu và các trang Farmer/Admin/Manager.

## Hệ thống cỡ chữ

Font Be Vietnam Pro, trọng lượng, màu thương hiệu, ảnh và logo giữ nguyên. Các biến cỡ chữ thuộc ứng dụng web tại `apps/web/src/styles.css`, không sửa bộ nhận diện nguồn dùng chung cho mobile. Dùng `rem` để tôn trọng cỡ chữ mặc định của trình duyệt; bảng dưới tính tại mặc định 16 px.

| Nhóm | Trước | Sau | Biến CSS |
| --- | --- | --- | --- |
| Nội dung, nhãn form và dữ liệu bảng | 14 px | 16 px | `--sd-font-body` |
| Nút, menu, tên mục trong hoạt động | 13 px | 15 px | `--sd-font-control` |
| Hướng dẫn form, tiêu đề cột, thông tin chi tiết | 12 px | 14 px | `--sd-font-caption` |
| Badge, ghi chú bảng, thông tin ứng viên | 11 px | 13 px | `--sd-font-sm` |
| Footer, nhãn nhỏ, thời gian cập nhật | 10 px | 12 px | `--sd-font-xs` |
| Tiêu đề cấp 1 | 30 px desktop / 24 px mobile | 32 px desktop / 26 px mobile | `--sd-font-heading-lg` / quy tắc mobile |
| Tiêu đề cấp 2 / cấp 3 | 19 / 16 px | 21 / 18 px | `--sd-font-heading-md` / `--sd-font-heading-sm` |

Số thống kê chỉ tăng nhẹ: 35 → 38 px desktop, 30 → 32 px mobile; số đo cảm biến 34 → 36 px. Line-height số lớn giảm từ 1.6 về 1.4 để thẻ không bị cao quá mức. Nội dung thông thường giữ line-height 1.65.

Panel ảnh xác thực giữ tiêu đề 36–48 px và chiều rộng khối chữ 560 px để không tái xuất hiện lỗi xuống dòng ở chữ “minh” trên desktop rộng. Mô tả tăng từ 16–18 lên 17–19 px, rộng tối đa 460 px; nhãn và footer tăng từ 11 lên 13 px. Ảnh, overlay, logo và nội dung người dùng đã chỉnh giữ nguyên.

## Điều chỉnh khung và responsive

- Hai cột xác thực vẫn bằng nhau; form đăng nhập rộng tối đa 440 px, đăng ký 460 px. Không đặt chiều cao cố định hoặc overflow cắt form. Giữ khoảng đệm đáy đăng ký và hiệu ứng chuyển Farmer/Manager, mở/đóng email hiện có.
- Input cao tối thiểu 52 px, nút chính 48 px; nút hiện mật khẩu cao 44 px để nằm giữa input. Các kích thước là minimum, cho phép nội dung làm khung cao hơn.
- Sidebar rộng 260 px thay vì 245 px; cột nội dung dùng cùng biến `--sd-sidebar-width`. Danh sách menu tự cuộn trên màn hình thấp, khối tài khoản/đăng xuất ở dưới; breakpoint đóng/mở menu vẫn 900 px.
- Panel desktop tăng padding từ 24 lên 26 px; mobile từ 17 lên 20 px. Form hai cột dùng `minmax(0, 1fr)` và gap 22 px; modal rộng tối đa 660 px, vẫn cuộn bên trong khi cần.
- Dashboard chuyển thành một cột ở chiều rộng ≤1050 px để tránh ép chữ bên cạnh sidebar. Thẻ Farmer về hai cột ở dải này và một cột ở ≤700 px. Giữ các thẻ, thứ tự nội dung và liên kết từ mẫu đã duyệt.
- Heading, nhóm nút và nội dung dài được phép xuống dòng; bảng rộng cuộn trong `.table-scroll`, không làm cả trang tràn ngang. Ở ≤380 px, icon của nút chọn vai trò ở trên nhãn, form giảm padding ngang về 20 px để nhãn Manager vẫn đọc được.
- Bộ lọc và nút tìm kiếm xếp thành từng hàng đầy đủ chiều rộng ở ≤700 px. `.table-scroll` có `position: relative` để nhãn cột ẩn dành cho trình đọc màn hình nằm trong vùng bảng; phần tử absolute này không làm tăng chiều rộng cuộn của cả trang khi bảng rộng hơn viewport.
- Panel giới thiệu dùng minimum 720 px / 700 px ở desktop hẹp thay cho các giá trị đo theo typography cũ; đăng ký sticky vẫn bỏ minimum ở viewport đủ cao. Logo, chữ và footer nằm trong flex flow.

## Tái lập và kiểm tra

Chạy từ thư mục gốc trong hai terminal riêng:

```powershell
npm run dev:api
npm run dev:web
```

Mở `http://127.0.0.1:5173`. Kiểm tra `/login`, `/register` với cả Farmer và Manager, `/forgot-password`; sau đăng nhập kiểm tra dashboard ba vai trò, bảng danh sách/chi tiết, form tạo/sửa HTX, dialog duyệt Manager và giám sát IoT. Dùng tài khoản test theo hướng dẫn [Auth](modules/AUTH.md); không gửi OTP thật nếu chỉ cần kiểm tra trình bày.

Các viewport chính: 1440×900, 1024×600, 390×844, 320×700; kiểm tra thêm tiêu đề panel ở 2559×1398. Quan sát chữ không bị cắt, không chồng khung/footer, nút có khoảng đệm, không cuộn ngang toàn trang. Bảng có thể cuộn ngang riêng. Mở menu mobile và xác nhận nút đăng xuất vẫn tiếp cận được. Đổi Farmer/Manager nhiều lần để kiểm tra hiệu ứng cũ; các luồng gửi/xác minh OTP được kiểm thử tự động bằng nhà cung cấp giả lập.

```powershell
npm run lint:web
npm run typecheck:web
npm run test:web
npm run build:web
npm run test:web:e2e
npm run format:check -w apps/web
```

Browser suite dùng Nest/Vite, RAM và MQTT loopback cô lập, email capture và SMS mock; không đọc `.env` gốc hoặc gửi tin thật. Ảnh kiểm thử ở `apps/web/test-results/` được Git ignore. Backend, API, validation, quyền, session và các hiệu ứng không đổi; không thêm thư viện.

## Kết quả kiểm chứng

- Web lint, 8 unit tests, build kèm TypeScript và kiểm tra định dạng đều đạt. Bộ browser chuẩn hoàn tất 22/22 luồng, gồm đăng ký, OTP, duyệt/từ chối Manager, scope HTX, session và IoT.
- Rà bố cục riêng 151 trường hợp bằng Edge/Playwright trên Nest/Vite cô lập: 25 trường hợp xác thực ở 5 viewport, 112 trang/danh sách/chi tiết/form theo ba vai trò ở 4 viewport, 6 menu mobile và 8 dialog duyệt Manager. Không tràn ngang toàn trang, không chồng thẻ/panel, không tràn ngang trong các control/thẻ được đo; mô tả panel không chồng footer. Tiêu đề panel giữ hai dòng ở desktop rộng.
- Đã xem ảnh đăng nhập, đăng ký/OTP desktop và 320 px, dashboard Farmer/Manager, menu Admin và dialog duyệt mobile. Ảnh đối chiếu CSS trước/sau và báo cáo đo nằm trong `apps/web/test-results/typography/`; bộ kiểm tra bổ sung là công cụ tạm trong `test-results`, không thay đổi bộ test của dự án. Để tái lập trên checkout mới, dùng bộ browser chuẩn và ma trận kiểm tra thủ công nêu trên. Khi rà nhiều form OTP liên tiếp, chỉ bộ dựng preview cô lập làm mới bộ đếm email giả lập; giới hạn của backend thực được giữ nguyên.
- Thay đổi runtime chỉ ở `src/styles.css` và `src/components/AuthIntroPanel.css`. Giữ nguyên chỉnh sửa tiêu đề hiện có của người dùng trong `AuthIntroPanel.tsx`, `.env`, tài nguyên nguồn và các thay đổi tài liệu/Postman riêng.
