# Bàn giao các module — đọc đầu session

## Trạng thái và nguyên tắc

Cập nhật Trees 2026-10-04: nhánh tích hợp mới nhất `feat/trees-management`, base HTX `2752454`. Chủ Farmer tạo/sửa trực tiếp; Admin đề xuất Create/Update cần đúng chủ duyệt. Manager đọc Farm hiện thuộc HTX mình; Farmer nhận việc chỉ đọc cây trong Zone có phân công Accepted và hiệu lực [start,end). Backend sinh mã DRN-UUID bất biến; không chuyển Zone/hard-delete. Dead/Removed có thể khôi phục Active, giữ snapshot metadata và version. Một Pending Update/cây; chủ sửa trong khi chờ làm đề xuất lỗi thời (409). Đọc TREES_IMPLEMENTATION.md và collection Trees 20 request JSON trực tiếp. 77/77 tests (8 Trees + 69 hồi quy), lint/typecheck/build đạt; fake providers, không tin thật/ghi DB. Tất cả vẫn in-memory, nhánh chỉ local, chưa push/merge.

Cập nhật HTX 2026-10-04: `feat/cooperatives-management`, commit 2752454, base Assignments c9dbe67, được kế thừa trong Trees. Admin tạo HTX chưa có Manager/sửa trực tiếp; Manager sửa tên, director, địa chỉ, số liên hệ HTX mình sau email tài khoản → SMS điện thoại tài khoản. Chỉ Admin sửa chứng nhận. Gắn Manager qua USERS approve, không tháo/chuyển Manager. Cảnh báo ngày 7, xóa ngày 30 nếu không Manager và không tham chiếu nghiệp vụ; có liên kết thì giữ và cảnh báo Admin. Worker 60 giây và kiểm tra khi truy cập API HTX. Metadata/timer/request/notifications trong bộ nhớ, restart mất dữ liệu; không schema/migration/seed mới. Đọc COOPERATIVES_IMPLEMENTATION.md và collection Cooperatives 20 request JSON trực tiếp.

SMS HTX thật dùng TWILIO_HTX_VERIFY_SERVICE_SID riêng và HTX_SMS_ALLOWED_PHONES (tối đa 20 số), cùng account credentials nhưng không đổi service/allowlist Farmer. SMTP dùng cùng EmailSender USERS. Sau đợt HTX, người dùng yêu cầu thêm hai khóa trống vào `.env` local; đã thêm, không thay giá trị cũ/commit secret. Đợt Trees không sửa `.env`. Thiếu cấu hình HTX thì SMS HTX thật trả 503, Auth cũ vẫn chạy. Mock HTX/outbox tách reset; test-sms chỉ đúng Manager trong bước SmsPending và SMS_PROVIDER=mock.

Trees đã triển khai theo quyết định được duyệt, bao gồm Admin đề xuất tạo và phục hồi trạng thái có lịch sử. Lịch sử metadata cây cần quyền đọc Zone hiện tại; lịch sử phân công riêng vẫn giữ sau end, và Cultivation history/correction sẽ áp dụng policy riêng của tác giả. Device movement và Cultivation details/hash-chain vẫn cần bàn riêng.

Kiểm tra HTX: **69/69 tests**, lint/typecheck/build đạt (14 tests HTX + 55 hồi quy), fake providers, không đọc .env thật/gửi tin/ghi DB. Postman 20 request đã parse JSON hợp lệ, không scripts/variables. Npm wrapper Windows EPERM nên checks chạy trực tiếp công cụ local tương đương theo guide HTX. Nhánh HTX chỉ local, chưa push/merge; cần xác nhận rõ quyền gửi branch lên origin, không suy từ lệnh triển khai thành quyền push.

Cập nhật 2026-10-04: Zones trên `feat/zones-management` (e7bb204) kế thừa Farm; USERS_ZONES trên `feat/zone-assignments` kế thừa Zones. Chủ Farmer tạo/sửa Zone; Admin đề xuất cần chủ duyệt; Manager đọc theo HTX. Tổng diện tích Zone <= Farm, kiểm tra cả duyệt Farm shrink. Tiêu chuẩn Active khi gắn mới; Inactive giữ liên kết cũ. Phân công: chủ đề xuất; Admin cần chủ chấp thuận; người nhận Farmer phải nhận việc. Quyền theo [start,end), một Farmer mỗi Zone, giữ snapshot lịch sử riêng, policy correction 15 ngày từ end_date. Đọc ZONES_IMPLEMENTATION.md và ASSIGNMENTS_IMPLEMENTATION.md. Nhật ký/IoT chưa triển khai; helper quyền đã sẵn sàng cho các module đó.

Nhánh Zones đạt **48/48 tests, lint/typecheck/build**. Collection Zones có 13 request JSON trực tiếp. Không dùng secrets .env thật hoặc gửi tin trong checks. User đã xác nhận test SMTP/Manager approval và Twilio thành công.

Nhánh tích hợp Assignments đạt **55/55 tests, lint/typecheck/build**. Collection Assignments có 19 request JSON trực tiếp, gồm các luồng tùy chọn. Cả hai branch hiện chỉ commit local: auto-review đã chặn push Zones vì cần xác nhận gửi code/docs lên origin `https://github.com/lnghuy2301/smart-durian-farm.git`. Không thử cách khác để vượt chặn; chỉ push sau khi người dùng cho phép rõ việc gửi hai branch này. Không tự merge.

Cập nhật Farm ngày 2026-10-02: đã triển khai tạo/sửa duyệt chéo Admin–chủ Farmer, gia nhập thêm Manager HTX duyệt, rời duyệt đối ứng và thông báo Manager qua API. Farm có thể độc lập; một Manager một HTX; is_owner chỉ thành true khi Farm được chấp nhận. Nhánh `feat/farm-approval-workflow` từ `feat/standard-materials`; đọc FARMS_IMPLEMENTATION.md và FARMS_WORKFLOW_DESIGN.md. **44/44 tests + lint/typecheck/build** đã đạt, fake transports, không gửi tin thật/ghi DB. Postman Farm có 18 request URL/JSON trực tiếp; Twilio giữ đúng 4.

Đã fetch origin/main ngày 2026-10-02: 7594c9d đã merge Auth ban đầu; Twilio/USERS chưa có trong main. Các nhánh mới kế thừa nhau để không bỏ code đã hoàn thành; không tự merge. Khi phụ thuộc được merge, module tiếp theo bắt đầu từ main cập nhật. Người dùng muốn module đơn giản trước, mỗi module một branch và tài liệu/Postman; gặp nghiệp vụ khó/chưa rõ phải dừng hỏi.

Tất cả nghiệp vụ hiện lưu trong bộ nhớ. Chưa tạo bảng/seed/collection hoặc sửa ERD; chỉ sau khi USERS hoàn tất mới bàn persistence. Farmer email profile/opt-in và reset email dự phòng chưa làm. Twilio collection giữ đúng 4 request. .env chứa secret local, không commit. ERD XML/JSON, MQTT và các file SpeedSMS bị người dùng xóa phải giữ ngoài commit backend.

## Các nhánh

| Module | Branch/base | Tài liệu | Postman |
|---|---|---|---|
| USERS | feat/users-registration-approval ← feat/twilio-verify | USERS_IMPLEMENTATION.md | Users-Local-Test |
| Vật tư | feat/agricultural-materials ← USERS | MATERIALS_IMPLEMENTATION.md | Materials-Local-Test |
| Tiêu chuẩn | feat/farming-standards ← Vật tư | STANDARDS_IMPLEMENTATION.md | Standards-Local-Test |
| Liên kết tiêu chuẩn–vật tư | feat/standard-materials ← Tiêu chuẩn | STANDARD_MATERIALS_IMPLEMENTATION.md | Standard-Materials-Local-Test |
| Farm / duyệt thay đổi và membership | feat/farm-approval-workflow ← Bridge | FARMS_IMPLEMENTATION.md | Farms-Local-Test |
| Zone | feat/zones-management ← Farm | ZONES_IMPLEMENTATION.md | Zones-Local-Test |
| Phân công USERS_ZONES | feat/zone-assignments ← Zones | ASSIGNMENTS_IMPLEMENTATION.md | Assignments-Local-Test |
| HTX độc lập / xác minh sửa của Manager | feat/cooperatives-management ← Assignments | COOPERATIVES_IMPLEMENTATION.md | Cooperatives-Local-Test |
| Trees / metadata và duyệt Admin | feat/trees-management ← HTX 2752454 | TREES_IMPLEMENTATION.md | Trees-Local-Test |

Vật tư/Tiêu chuẩn có Admin tạo/sửa/Inactive và user Active đọc/search/pagination. Bridge có Admin gắn/bỏ gắn, user Active đọc theo tiêu chuẩn; kiểm tra FK/cặp duy nhất và dùng đúng cùng store catalogs. Không kho/tồn hàng. Tiêu chuẩn gắn Zone sau, không gắn Farm. Hai catalog không hard-delete, không tự tạo UNIQUE tên/code ngoài ERD. Farm dùng đúng cùng Auth/USERS/HTX store; membership không sửa trực tiếp qua update, không áp dụng dữ liệu khi còn Pending.

Checkout feat/trees-management để test toàn bộ chuỗi hiện tại. PR phụ thuộc theo thứ tự USERS → Vật tư → Tiêu chuẩn → Bridge → Farm → Zones → Assignments → HTX → Trees; so sánh mỗi branch với parent để review chỉ module đó. Khi parent merge main, cập nhật base PR phù hợp; không tự merge hoặc rebase làm mất thay đổi người dùng.

## Tái lập ở session khác

1. Đọc file này, IMPLEMENTATION_NOTES.md, tài liệu module và ERD mới; git status/branch, fetch remote.
2. Checkout nhánh cuối chuỗi để có code tích hợp; không checkout làm mất sửa dở của người dùng. Kiểm tra migration/seed vẫn chưa được tạo.
3. Node 20.19+, npm ci ở root nếu chưa có dependencies. Không Copy-Item ghi đè .env hiện có; thêm khóa thiếu từ .env.example.
4. AUTH_MODE=mock, NODE_ENV=development, AUTH_TEST_ADMIN_PHONE/PASSWORD đầy đủ; DATABASE_URL/MONGODB_URI cần config nhưng danh mục không gọi DB. Email/SMS thật chỉ cần khi chủ động test luồng tương ứng.
5. npm run dev:api; Swagger /api/docs. Import collection module, nhập JSON trực tiếp; copy JWT vào Authorization và UUID vào URL bằng tay. Restart xóa dữ liệu danh mục/đăng ký/Farm/yêu cầu/thông báo. Test Farm tạo/sửa cần Farmer/Admin, không cần SMTP. Gia nhập cần Manager đã xác minh email và được Admin approve qua USERS.
6. npm run lint, npm run typecheck, npm run build, npm test. Tests dùng fake transports, không đọc .env. Nếu npm wrapper EPERM trên Windows, chạy công cụ local tương đương trong guide HTX. Stage đúng file module và commit local; chỉ push khi được phép gửi branch lên origin, không tự merge.

Test Zones/Assignments: Farm phải Accepted và có standard Active. Chủ có thể phân công mình (vẫn cần accept) hoặc Farmer khác đăng ký bằng số mẫu không cần SIM. Pending không cấp quyền. Chủ end trực tiếp; Admin End proposal cần chủ duyệt. Hết phân công chỉ đọc own history/snapshot, không đọc Zone hiện tại nếu không sở hữu. Không xóa lịch sử, không gia hạn cửa sổ correction bằng phân công mới. Không có biến .env mới; Twilio/Users collection của người dùng không sửa.

Test Trees: chuẩn bị Zone như trên, nhập zone_id vào Create. Lấy Tree id/tree_code từ response; proposal id dùng riêng cho approve/reject. Mã không do client nhập; tra mã vẫn cần JWT. Đọc TREES_IMPLEMENTATION.md để chạy kiểm thử và 20 bước Postman. Không QR public hoặc nghiệp vụ Cultivation trong batch này.

## Quyết định cần hỏi trước module phụ thuộc

- Farm và quản lý HTX độc lập đã triển khai theo quy tắc chốt. Xóa/chuyển chủ Farm và hủy yêu cầu Farm chưa có. Schema lưu yêu cầu/duyệt/thông báo lâu dài vẫn cần chốt trước persistence, không tự thêm bảng từ metadata Map.
- Zone/USERS_ZONES đã chốt quyền, không hỏi lại. Cultivation giữ quyền đọc lịch sử riêng và correction của chính tác giả trong 15 ngày sau kết thúc; không cấp tạo nhật ký/điều khiển sau hết phân công. Trees đợt đầu không chuyển Zone; Device movement và details lựa chọn chưa cung cấp.
- IoT: command_id, timeout và ACK thiếu correlation cần thống nhất firmware.
- Database: cardinality/nullability/unique/deletion rules còn cần chốt, không suy từ store demo thành schema mới.
