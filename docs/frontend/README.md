# Tài nguyên thương hiệu và mẫu frontend

Các thư mục này chuẩn bị để nhận tài nguyên do người dùng cung cấp. Chưa triển khai giao diện hoặc chọn bộ nhận diện chính thức.

| Thư mục | Nội dung |
| --- | --- |
| `apps/web/public/assets/logos/` | Logo và các biến thể được chọn để dùng trên web: SVG, PNG, WebP. |
| `apps/web/public/assets/images/` | Hình ảnh thương hiệu và hình minh họa được chọn để dùng trên web. |
| `docs/frontend/brand/` | Brand guideline, bảng màu, quy định font chữ, tài liệu và file thiết kế gốc của bộ nhận diện. |
| `docs/frontend/references/html/` | Mẫu HTML/CSS và tài nguyên đi kèm dùng để tham khảo giao diện. Mỗi mẫu có thể đặt trong một thư mục riêng để giữ đường dẫn tương đối. |
| `docs/frontend/references/images/` | Ảnh chụp màn hình, mockup và mẫu bố cục tham khảo; có thể chia theo Admin, Manager, Farmer khi có mẫu. |

Các đường dẫn trong bảng tính từ thư mục gốc dự án. File `.gitkeep` giữ lại các thư mục trống trong Git.

## Cách đặt tài nguyên

- Mẫu tham khảo và file thiết kế gốc đặt trong `docs/frontend/`, tách khỏi tài nguyên chạy của ứng dụng.
- Chỉ đặt logo/hình đã được chọn để sử dụng vào `apps/web/public/assets/`; nội dung ở đây sẽ được công khai khi web được build/host. Không đặt secrets hoặc tài liệu nội bộ ở đây.
- Tài nguyên tạm đặt tên có hậu tố `-temporary` và ghi trạng thái tạm bên dưới; không coi là nhận diện chính thức.
- Giữ nguyên file gốc được cung cấp. Với tài nguyên bên ngoài, ghi nguồn và quyền sử dụng; chưa rõ quyền thì chỉ ghi nhận làm tham khảo, chưa đưa vào ứng dụng.

## Ghi nhận tài nguyên

Điền thêm một dòng khi đưa tài nguyên vào; chưa có tài nguyên nào được lựa chọn.

| File/thư mục | Nguồn hoặc người cung cấp | Quyền sử dụng | Mục đích / màn hình | Trạng thái: tham khảo, tạm, chính thức |
| --- | --- | --- | --- | --- |

Chỉ bắt đầu code frontend sau khi người dùng cung cấp mẫu và yêu cầu tiến hành rõ ràng.
