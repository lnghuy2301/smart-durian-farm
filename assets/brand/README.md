# Nhận diện Smart Durian dùng chung toàn dự án

Ngày 2026-10-08, người dùng xác nhận **Smart Durian — Brand Kit v1.0 / Durian Connect** là bộ nhận diện sử dụng cho toàn dự án Smart Durian Farm.

Nguồn chuẩn duy nhất: [Smart_Durian_Brand_Kit/](Smart_Durian_Brand_Kit/). Bộ kit do người dùng cung cấp, ban đầu được chuyển nguyên vẹn với 47 file; sau lượt dọn cấu trúc theo yêu cầu còn **46 file**, bỏ một PNG trùng hoàn toàn. Web, React Native và tài liệu sử dụng cùng bộ kit này. Đây là xác nhận lựa chọn thiết kế của dự án; không xác nhận đăng ký nhãn hiệu hoặc cấp quyền phân phối font bên ngoài.

## Cấu trúc và mục đích

| Đường dẫn trong kit | Dùng cho |
| --- | --- |
| `01_Logos/SVG/` | Logo vector ngang/dọc, biểu tượng độc lập; bản màu, trắng, đen, xanh đơn sắc. |
| `01_Logos/PNG/` | Logo PNG nền trong suốt cho mobile, tài liệu và nơi không dùng SVG. |
| `02_Favicon/` | Favicon SVG/ICO/PNG, apple-touch-icon; snippet HTML gốc. |
| `03_App_Icons/` | Icon app SVG/PNG, foreground và màu nền Android adaptive icon. |
| `04_Pattern/` | Pattern SVG/PNG dùng khi bố cục cần họa tiết thương hiệu. |
| `05_Guidelines/design-tokens.json` | Nguồn giá trị màu, font và độ đậm chữ dùng chung các nền tảng. |
| `05_Guidelines/brand-guide.html` | Hướng dẫn có hình xem trực tiếp; đường dẫn tương đối tới logo vẫn giữ nguyên. |
| `06_Web_Assets/brand.css` | CSS custom properties `--sd-*` cho web, tương ứng JSON tokens. |

Đọc [README gốc](Smart_Durian_Brand_Kit/README.md) và [brand guide](Smart_Durian_Brand_Kit/05_Guidelines/brand-guide.html) trước khi sử dụng. Không đổi màu, bóp méo hoặc thêm hiệu ứng vào logo. Dùng logo trắng trên nền xanh thương hiệu; vùng nhỏ dùng biểu tượng độc lập. Giữ khoảng trống ít nhất 25% chiều cao biểu tượng và chiều cao biểu tượng của logo ngang ít nhất 24px, khuyến nghị 32px.

**Icon 180px dùng chung:** [02_Favicon/apple-touch-icon.png](Smart_Durian_Brand_Kit/02_Favicon/apple-touch-icon.png) là nguồn duy nhất cho web và app cần kích thước này. Đã xóa `03_App_Icons/app-icon-180.png` sau khi xác nhận SHA-256 giống hoàn toàn. Các PNG kích thước khác, SVG, ICO, logo biến thể và pattern là tài nguyên có mục đích riêng, được giữ lại.

## Tích hợp hiện tại và quy ước dùng chung

Web tại `apps/web` đã tích hợp kit và được kiểm tra ngày 2026-10-08. Alias `@brand` trong Vite/TypeScript trỏ nguồn chung; Brand component import SVG logo màu/trắng, main.tsx import brand.css, trang auth import pattern. Favicon/apple-touch-icon được tham chiếu trực tiếp từ nguồn chung trong index.html và Vite xử lý vào build. Không nhân bản kit vào public. Xem [triển khai và tái lập](../../docs/frontend/WEB_FOUNDATION_IMPLEMENTATION.md). React Native chưa bắt đầu; các quy ước dưới đây áp dụng khi bổ sung nền tảng hoặc tài nguyên mới.

- **React/Vite:** import logo/pattern từ nguồn chung qua module để bundler quản lý URL; import CSS tokens vào stylesheet đầu vào. Ví dụ từ file ngay trong `apps/web/src/`: `../../../assets/brand/Smart_Durian_Brand_Kit/06_Web_Assets/brand.css`. Tạo alias tập trung khi có cấu hình Vite/TypeScript, không rải đường dẫn tương đối sâu qua components.
- **Favicon web:** Vite hiện xử lý tham chiếu favicon.svg và apple-touch-icon.png trong index.html vào output build. Không sao chép file thủ công; snippet HTML gốc của kit là tham khảo và không đưa nguyên vào app. Nếu đổi base path hoặc bundler, kiểm tra URL favicon trong build tương ứng.
- **React Native:** dùng JSON tokens để tạo theme và PNG qua static import/require trong một module tài nguyên chung của app. CSS không dùng trực tiếp trên React Native. Cấu hình resolver cho thư mục nguồn chung và chọn kích thước launcher icon theo Android/iOS khi khởi tạo app; chưa ghi file native trong đợt này.
- **Tài liệu/slide:** lấy logo/pattern trực tiếp từ kit; không tạo bộ màu hoặc logo riêng khác với web/mobile.
- **Bản sao phục vụ build:** nguồn vẫn là kit chung. Nếu nền tảng cần bản sao vào public/native thì phải có bước đồng bộ rõ ràng; không sửa bản sao độc lập. Web hiện để bundler tạo asset output từ nguồn chung, không có bản sao source.
- **Cập nhật nhận diện:** thay đổi nguồn chung có chủ đích, đối chiếu `design-tokens.json`, `brand.css` và guideline để tránh lệch màu giữa nền tảng. Không mặc định hai file tokens hiện tự đồng bộ.

## Font và độ nhất quán

Kit chỉ khai báo **Be Vietnam Pro** (400/500/600/700), fallback **Inter**; không kèm file font. Web dùng `@fontsource/be-vietnam-pro` 5.3.0, import subset Vietnamese/Latin ở đủ bốn weight trong main.tsx; font phục vụ local, không CDN runtime. License OFL nguyên văn được giữ tại [Be-Vietnam-Pro-OFL.txt](../../apps/web/public/licenses/Be-Vietnam-Pro-OFL.txt). Package-lock khóa phiên bản; `npm ci` và Vite build tái lập asset output. Không thay nguồn font trong kit hoặc tải Inter riêng.

Wordmark SVG có phần chữ dạng `<text>`, vì vậy font cài/tải thực tế ảnh hưởng hình hiển thị. README gốc ghi PNG đã render bằng font fallback, có thể khác khoảng cách chữ. Giữ nguyên bản gốc; nếu cần phiên bản chữ chuyển thành path hoặc xuất lại PNG, xử lý riêng theo yêu cầu thiết kế, không âm thầm thay asset.

## Vị trí các tài nguyên khác

`docs/frontend/references/` giữ các mẫu giao diện tham khảo; [docs/frontend/README.md](../../docs/frontend/README.md) chỉ dẫn nơi đặt mẫu. Đã bỏ `docs/frontend/brand/` vì chỉ lặp liên kết có sẵn và bỏ các thư mục `apps/web/public/assets/` rỗng chưa dùng. Khi triển khai web, tạo public assets cho những hình nội dung hoặc favicon thực sự cần; logo/pattern vẫn lấy từ nguồn chung. Theo yêu cầu dọn trước triển khai, các placeholder app/thư mục tham khảo rỗng cũng đã bỏ; mobile/ai tạo lại khi bắt đầu phần việc đó.
