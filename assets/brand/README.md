# Nhận diện Smart Durian dùng chung toàn dự án

Ngày 2026-10-08, người dùng xác nhận **Smart Durian — Brand Kit v1.0 / Durian Connect** là bộ nhận diện sử dụng cho toàn dự án Smart Durian Farm.

Nguồn chuẩn duy nhất: [Smart_Durian_Brand_Kit/](Smart_Durian_Brand_Kit/). Bộ kit do người dùng cung cấp, được chuyển nguyên vẹn từ `docs/frontend/brand/Smart_Durian_Brand_Kit/`; giữ nguyên tên, nội dung và cấu trúc 47 file. Web, React Native và tài liệu sử dụng cùng bộ kit này. Đây là xác nhận lựa chọn thiết kế của dự án; không xác nhận đăng ký nhãn hiệu hoặc cấp quyền phân phối font bên ngoài.

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

## Quy ước tích hợp khi bắt đầu code

Chưa có ứng dụng web/mobile chạy trong đợt sắp xếp này. Các hướng dẫn dưới đây là quy ước cho lần triển khai được người dùng yêu cầu tiếp theo, chưa phải tích hợp đã kiểm thử.

- **React/Vite:** import logo/pattern từ nguồn chung qua module để bundler quản lý URL; import CSS tokens vào stylesheet đầu vào. Ví dụ từ file ngay trong `apps/web/src/`: `../../../assets/brand/Smart_Durian_Brand_Kit/06_Web_Assets/brand.css`. Tạo alias tập trung khi có cấu hình Vite/TypeScript, không rải đường dẫn tương đối sâu qua components.
- **Favicon web:** chỉ sao chép các file thực sự dùng từ `02_Favicon/` vào `apps/web/public/` ở bước cấu hình/build đã được triển khai. Snippet gốc dùng `/favicon.svg`, `/favicon.ico`, `/apple-touch-icon.png`; phải khớp đường dẫn public và base path của web. Không copy cả kit hoặc HTML guideline vào public.
- **React Native:** dùng JSON tokens để tạo theme và PNG qua static import/require trong một module tài nguyên chung của app. CSS không dùng trực tiếp trên React Native. Cấu hình resolver cho thư mục nguồn chung và chọn kích thước launcher icon theo Android/iOS khi khởi tạo app; chưa ghi file native trong đợt này.
- **Tài liệu/slide:** lấy logo/pattern trực tiếp từ kit; không tạo bộ màu hoặc logo riêng khác với web/mobile.
- **Bản sao phục vụ build:** nguồn vẫn là kit chung. Nếu nền tảng cần bản sao vào public/native thì phải có bước đồng bộ rõ ràng; không sửa bản sao độc lập. Chưa tạo bản sao hoặc script build khi apps chưa được triển khai.
- **Cập nhật nhận diện:** thay đổi nguồn chung có chủ đích, đối chiếu `design-tokens.json`, `brand.css` và guideline để tránh lệch màu giữa nền tảng. Không mặc định hai file tokens hiện tự đồng bộ.

## Font và độ nhất quán

Kit chỉ khai báo **Be Vietnam Pro** (400/500/600/700), fallback **Inter**; không kèm file font. Chưa tải font, thêm dependency hoặc gọi dịch vụ font bên ngoài. Khi triển khai, bổ sung font với nguồn/quyền sử dụng và cấu hình tải rõ ràng.

Wordmark SVG có phần chữ dạng `<text>`, vì vậy font cài/tải thực tế ảnh hưởng hình hiển thị. README gốc ghi PNG đã render bằng font fallback, có thể khác khoảng cách chữ. Giữ nguyên bản gốc; nếu cần phiên bản chữ chuyển thành path hoặc xuất lại PNG, xử lý riêng theo yêu cầu thiết kế, không âm thầm thay asset.

## Vị trí các tài nguyên khác

`docs/frontend/references/` giữ các mẫu giao diện tham khảo. `docs/frontend/brand/` chỉ giữ ghi chú tích hợp web và liên kết về nguồn chuẩn, không giữ bản kit thứ hai. `apps/web/public/assets/images/` dành cho hình nội dung được chọn; thư mục `logos/` đã tạo chỉ dùng nếu có nhu cầu xuất/sao chép có kiểm soát khi làm web.
