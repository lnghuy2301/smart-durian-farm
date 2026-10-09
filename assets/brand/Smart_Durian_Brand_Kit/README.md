# Smart Durian — Brand Kit v1.0

Logo được chọn: Durian Connect, biểu tượng sầu riêng hình học và một điểm kết nối màu vàng. Đây là phiên bản triển khai từ hướng A đã thảo luận.

## Thư mục
- `01_Logos/SVG/`: logo vector ngang, dọc, biểu tượng độc lập; bản màu, trắng và đơn sắc.
- `01_Logos/PNG/`: bản PNG nền trong suốt, kích thước lớn.
- `02_Favicon/`: SVG, PNG 16/32/48/64, ICO, apple-touch-icon.
- `03_App_Icons/`: SVG, PNG từ 32 đến 1024, foreground Android.
- `04_Pattern/`: họa tiết nền nhẹ SVG và PNG.
- `05_Guidelines/`: hướng dẫn thương hiệu và design-tokens.json.
- `06_Web_Assets/`: CSS tokens cho React.

## Icon dùng chung sau khi dọn cấu trúc

Ngày 2026-10-08, theo yêu cầu làm sạch của người dùng: `03_App_Icons/app-icon-180.png` đã được xóa vì trùng hoàn toàn SHA-256 với [02_Favicon/apple-touch-icon.png](02_Favicon/apple-touch-icon.png). Dùng file còn lại khi web/mobile cần icon 180 × 180; các kích thước app icon khác giữ tại `03_App_Icons/`. Bộ kit hiện có 46 file.

## Màu chính thức
- Brand #166534; Action #15803D; Accent #EAB308.
- Background #F8FAFC; Soft green #F0FDF4; Card #FFFFFF.
- Text #0F172A; Secondary text #64748B; Border #E2E8F0.
- Status: success #15803D; warning #B45309; error #DC2626; info #2563EB.

## Typography
**Be Vietnam Pro** (primary, 400/500/600/700), **Inter** (fallback). The vector wordmarks contain editable SVG text, so install Be Vietnam Pro before production export. PNG images were rendered using the available fallback font, which may slightly differ in letter spacing. No font files are distributed in this kit.

## Usage
- Clear space >= 25% of symbol height around a logo.
- Horizontal logo symbol >= 24px; preferred >= 32px.
- Use stand-alone icon for small spaces and favicon, not tiny horizontal wordmark.
- On dark green #166534 use the solid-white version.
- Avoid stretch, rotation, shadows, gradients, unauthorized color changes or low contrast.
- QR labels must use a real separately generated QR code; no QR is embedded in the logo.

These are initial design assets, not a registered trademark or independently validated small-size logo. Check at actual display sizes before production.
