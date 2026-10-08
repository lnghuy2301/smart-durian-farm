# Web Platform — nền tảng dùng chung

Nhánh `feat/web-platform` kế thừa `chore/web-reference-preparation` và backend f20f6c1. React/TypeScript/Vite tại `apps/web`, không thay API/nghiệp vụ backend. Root scripts backend cũ giữ nguyên; lệnh web có hậu tố `:web` riêng để không thay phạm vi kiểm tra trước đây.

## Chạy và cấu hình

Root: `npm install` (hoặc `npm ci` từ lockfile), `npm run dev:web`. Vite bind `127.0.0.1:5173`, cổng cố định. API chạy bằng `npm run dev:api` như trước. `/api` proxy mặc định đến `127.0.0.1:3000`; không cần sửa CORS cho đường proxy cùng origin.

Chép `apps/web/.env.example` thành `apps/web/.env.local` nếu cần thay cấu hình. `VITE_API_BASE_URL` là public base URL gồm `/api`; `WEB_DEV_API_TARGET` chỉ dành cho dev proxy. Vite chỉ tải env trong apps/web, không tải root `.env`. Giữ nguyên root `.env`; không copy JWT_SECRET, SMTP, SMS, MQTT hoặc database credentials sang VITE_*.

Font Be Vietnam Pro 400/500/600/700 dùng package `@fontsource/be-vietnam-pro` (SIL Open Font License) được bundle local, không gọi Google Fonts/CDN khi mở ứng dụng. Logo/pattern/CSS tokens dùng nguồn chuẩn assets/brand qua alias `@brand`. Favicon được Vite xử lý từ nguồn chung trong HTML, không giữ bản sao public. SVG wordmark vẫn là bản gốc có `<text>`; trình duyệt có thể chọn fallback nếu render SVG ở image context không có font bên trong. Không tự sửa logo; hạn chế này cần rà khi dùng bản chữ vector để in/xuất.

## Logic dùng chung

- `src/api/client.ts`: Bearer token, query encoding, request timeout20s, lỗi 400/401/403/404/409/429/503, không retry đọc/ghi/OTP tự động, không gửi cookies. ApiClient theo phiên có dispose để hủy toàn bộ request và từ chối response đến trễ.
- `src/hooks/useResource.ts`: loading/error/retry, AbortController, chặn response request cũ ghi sang trang/query mới; đổi key không hiện dữ liệu cũ trong frame trước effect.
- `src/types/api.ts`: types tường minh từ controller/service/DTO, không tự sinh response từ Swagger. Các module sau thêm contract riêng khi dùng.
- `src/components/ui.tsx`: field, table state, pagination, badge, dialog native có focus trap, format ngày giờ Việt Nam. Không render UUID như tên tài nguyên.
- `src/styles.css`: bố cục thẻ/bảng/form như mẫu Stitch, tokens màu chính thức; responsive và reduced-motion.

## Kiểm tra

`npm run lint:web`, `npm run typecheck:web`, `npm run build:web`, `npm run test:web`. Unit tests kiểm query timezone `+07:00`, phân biệt login401 với phiên hết hạn, không retry mutation409, đóng phiên chặn response cũ. Đây là nền tảng, chưa nghiệm thu login/dashboard ở commit module này; các nhánh sau tích hợp/kiểm trình duyệt bằng API thật.
