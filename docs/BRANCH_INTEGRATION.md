# Tích hợp tất cả branch vào main local

Ngày 2026-10-05, theo yêu cầu rõ của người dùng kiểm tra tất cả branch và merge main. Đã fetch --all trước kiểm tra: 18 branch local (kể cả main), 12 remote branch refs origin (không tính origin/HEAD symbolic). Không xóa branch, không push, không sửa .env hoặc commit thay đổi riêng ERD/MQTT/Postman.

## Inventory các branch local trước tích hợp

| Branch | Tip lúc kiểm tra | Kết quả |
|---|---|---|
| chore/project-foundation | 6ad9ed0 | Merge riêng; giữ placeholders, giải quyết hai conflict docs |
| docs/project-spec | 374a04c | Đã nằm trong chuỗi tích hợp |
| feat/backend-foundation | df72ef6 | Đã nằm trong chuỗi tích hợp |
| feat/database-connections | 1672c54 | Đã nằm trong chuỗi tích hợp |
| feat/auth | 7c12931 | Đã nằm trong chuỗi tích hợp |
| feat/speedsms-integration | e1ce7f4 | Đã nằm trong chuỗi tích hợp, Twilio là provider hiện dùng |
| feat/twilio-verify | e121a9a | Đã nằm trong chuỗi tích hợp |
| feat/users-registration-approval | a930355 | Đã nằm trong chuỗi tích hợp |
| feat/agricultural-materials | 53b76ef | Đã nằm trong chuỗi tích hợp |
| feat/farming-standards | bfd3553 | Đã nằm trong chuỗi tích hợp |
| feat/standard-materials | 113da8f | Đã nằm trong chuỗi tích hợp |
| feat/farm-approval-workflow | f1b34d7 | Đã nằm trong chuỗi tích hợp |
| feat/zones-management | e7bb204 | Đã nằm trong chuỗi tích hợp |
| feat/zone-assignments | c9dbe67 | Đã nằm trong chuỗi tích hợp |
| feat/cooperatives-management | 2752454 | Đã nằm trong chuỗi tích hợp |
| feat/trees-management | d39c5ce | Đã nằm trong chuỗi tích hợp |
| feat/tree-harvests-management | 15368a3 | Merge đầu chuỗi, mang toàn bộ module |
| main | cb85142 | Cập nhật origin/main rồi tích hợp branches |

12 remote refs đã fetch: origin/main (7594c9d), origin/docs/project-spec và origin/feat/{backend-foundation,database-connections,auth,speedsms-integration,twilio-verify,users-registration-approval,agricultural-materials,farming-standards,standard-materials,farm-approval-workflow}. Các remote feature tips khớp local và đã nằm trong chuỗi Harvests. Origin/main có commit merge Auth riêng nên phải tích hợp thêm, không chỉ suy từ code giống nhau.

## Cách tích hợp và giải quyết conflict

Workspace gốc ở feat/tree-harvests-management có các thay đổi riêng chưa commit. Tạo backup/main-before-integration-20261005 tại cb85142 và worktree tạm .worktrees/main-integration-20261005 checkout main để merge, không stash/reset/clean workspace người dùng.

1. main fast-forward tới origin/main 7594c9d.
2. Merge --no-ff feat/tree-harvests-management tạo commit 0f13195, tích hợp toàn bộ branch module là ancestor của Harvests. Không cần merge từng branch tổ tiên tạo nhiều commit rỗng hoặc đưa phiên bản cũ trở lại.
3. Merge --no-ff chore/project-foundation vì 6ad9ed0 chưa là ancestor. Giữ ai/.gitkeep, apps/api/.gitkeep, apps/mobile/.gitkeep, apps/web/.gitkeep. Hai add/add conflict duy nhất là IMPLEMENTATION_NOTES.md và IMPLEMENTATION_PLAN.md: giữ phiên bản mới chứa toàn bộ quyết định/module hiện tại thay cho kế hoạch folder-only năm đầu; các quyết định cũ về lock_at, Manager cardinality, correction đã được các module/tài liệu mới xử lý. Không conflict code.
4. Cập nhật README/handoff/notes/plan và guide này trong commit tích hợp để session sau bắt đầu từ main. Quyền merge local này thay thế lệnh không tự merge trong các ghi chú lịch sử, không tự mở quyền push/merge trên GitHub.
5. Kiểm tra tất cả refs/heads và refs/remotes (trừ origin/HEAD) là ancestor main, lint/typecheck/build và 89/89 tests dùng fake providers. Không đọc .env thật, gửi tin hoặc ghi DB. Sau kiểm tra, kết thúc commit merge, bỏ worktree tạm và chuyển workspace gốc sang main, giữ nguyên sửa đổi riêng.

## Tái lập và kiểm tra

Đọc AGENTS.md nếu có, git status/branch/log, MODULE_HANDOFF.md, notes/plan/spec, ERD XML/JSON và guide module liên quan. New module tạo branch riêng từ **main local đã tích hợp**. Không dùng origin/main cũ làm base mất các module chỉ local. Không xóa branch cũ hoặc rebase lịch sử tích hợp nếu chưa có yêu cầu.

Các lệnh Git kiểm tra: branch -avv, log --graph --decorate --oneline --all, branch --no-merged main; với remote refs dùng merge-base --is-ancestor <ref> main. Git có thể cần -c safe.directory=D:/PROJECT/Smart-Durian-Farm trên Windows này, không thay global config.

Validation từ apps/api (local tools tương đương khi npm wrapper EPERM):

```powershell
node ../../node_modules/eslint/bin/eslint.js src test integration
node ../../node_modules/typescript/bin/tsc --noEmit
node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json
node ../../node_modules/typescript/bin/tsc --outDir .test-dist
node --test --test-reporter=spec .test-dist/test
```

Không tạo bảng/migration/seed; nghiệp vụ vẫn trong RAM. File ERD mới và MQTT/Postman riêng chưa commit vẫn nằm ở workspace gốc; tree commit main chỉ có bản đã tracked trước đó. .env ignored giữ nguyên. Main local đã tích hợp không đồng nghĩa GitHub main đã cập nhật: chưa push. Quyền gửi code/docs lên https://github.com/lnghuy2301/smart-durian-farm.git vẫn cần người dùng cho phép rõ.
