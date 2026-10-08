# Tài nguyên thương hiệu và mẫu frontend

Ngày 2026-10-08, người dùng chọn **Smart Durian — Brand Kit v1.0 / Durian Connect** cho toàn dự án. Nguồn chuẩn nằm tại [assets/brand/Smart_Durian_Brand_Kit/](../../assets/brand/Smart_Durian_Brand_Kit/); xem [quy ước tích hợp web/mobile](../../assets/brand/README.md). Chưa triển khai giao diện.

| Thư mục | Nội dung |
| --- | --- |
| `assets/brand/Smart_Durian_Brand_Kit/` | Nguồn chung của bộ nhận diện đã chọn: logo, favicon, icon app, pattern, guideline, tokens JSON/CSS. |
| `docs/frontend/references/html/` | Mẫu HTML/CSS và tài nguyên đi kèm dùng để tham khảo giao diện. Mỗi mẫu có thể đặt trong một thư mục riêng để giữ đường dẫn tương đối. |
| `docs/frontend/references/images/` | Ảnh chụp màn hình, mockup và mẫu bố cục tham khảo; có thể chia theo Admin, Manager, Farmer khi có mẫu. |

Các đường dẫn trong bảng tính từ thư mục gốc dự án. File `.gitkeep` giữ lại các thư mục trống trong Git.

## Cách đặt tài nguyên

- Mẫu giao diện tham khảo đặt trong `docs/frontend/references/`, tách khỏi tài nguyên chạy của ứng dụng. Tài nguyên thương hiệu gốc giữ tại `assets/brand/`.
- Logo, favicon, icon app, pattern và tokens giữ tại nguồn chung `assets/brand/`. Chỉ tạo thư mục public trong app khi có tài nguyên thực sự cần dùng; bản sao phục vụ build phải có cách đồng bộ với nguồn chung.
- Tài nguyên tạm đặt tên có hậu tố `-temporary` và ghi trạng thái tạm bên dưới; không coi là nhận diện chính thức.
- Giữ nguyên file gốc được cung cấp. Với tài nguyên bên ngoài, ghi nguồn và quyền sử dụng; chưa rõ quyền thì chỉ ghi nhận làm tham khảo, chưa đưa vào ứng dụng.

## Ghi nhận tài nguyên

Điền thêm một dòng khi đưa tài nguyên vào. Kit còn 46 file sau khi bỏ PNG 180px trùng hoàn toàn; nguồn icon 180px là [apple-touch-icon.png](../../assets/brand/Smart_Durian_Brand_Kit/02_Favicon/apple-touch-icon.png). Không tạo lại hoặc đổi màu logo.

| File/thư mục | Nguồn hoặc người cung cấp | Quyền sử dụng | Mục đích / màn hình | Trạng thái: tham khảo, tạm, chính thức |
| --- | --- | --- | --- | --- |
| `assets/brand/Smart_Durian_Brand_Kit/` | Người dùng cung cấp và xác nhận ngày 2026-10-08 | Người dùng chọn sử dụng trong toàn dự án; kit không kèm file font | Web, React Native, tài liệu/slide | Chính thức được chọn cho dự án |

Chỉ bắt đầu code frontend sau khi người dùng cung cấp mẫu và yêu cầu tiến hành rõ ràng.
