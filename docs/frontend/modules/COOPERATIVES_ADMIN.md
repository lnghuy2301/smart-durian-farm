# Quản lý hợp tác xã

Branch `feat/web-cooperatives-admin`, kế thừa `feat/web-resources`. Mẫu nguồn: cooperative management_admin list/detail/create/edit; ảnh approve manager_admin thực chất là form sửa HTX nên áp dụng cho editor này.

GET `/cooperatives?q&limit&offset`: q tìm cooperative_name/certificate_number/address, không tìm director. GET `/:id` có thêm lifecycle. Admin/Farmer đọc danh mục; Manager chỉ HTX của mình theo server. Đã có Manager là manager_id khác null; không suy ra Active của tài khoản hay tên/email Manager. director là đại diện HTX, không đồng nhất Manager. Backend chưa cung cấp tổng nông dân/tên Manager/ngày kích hoạt: UI bỏ các trường này.

Admin tạo POST `/cooperatives` và sửa PATCH `/:id`. Form dùng 5 field đúng DTO: cooperative_name/dиректор (field API `director`) tối đa 40, certificate_number 24, address 255, contact_number optional + và 9..13 chữ số tổng <=14. Tất cả bắt buộc; submit trim chuỗi. PATCH chỉ gửi field thay đổi, không gửi lifecycle/id/manager_id. Số chứng nhận unique: 409 giữ form, người dùng kiểm tra trước khi gửi lại. Timeout không retry ngầm; chỉ dẫn kiểm tra list/detail để tránh gửi lại khi kết quả không rõ.

Tạo HTX chưa gắn Manager. Admin gắn Manager qua module duyệt, không có nhập UUID hoặc dropdown fake. Backend không có DELETE thủ công. Detail hiển thị ngày tạo và lifecycle chính xác: cảnh báo 7 ngày, xét xóa 30 ngày; có tham chiếu farm/update-request thì chặn xóa. Không cam kết đến hạn chắc chắn bị xóa. GET `/cooperative-notifications?limit&offset` chỉ Admin: ManagerMissing/DeletionBlocked/CooperativeDeleted, phân trang server riêng và reload thủ công.

Route `/cooperatives/new`, `/:id/edit` có AdminGuard. Khi lỗi quyền, không render form. Mutation hủy lúc rời trang/logout; loading ngăn submit lặp. Manager không có form PATCH Admin; workflow sửa HTX email→SMS sẽ chờ mẫu Manager. Lint/typecheck/build module đã chạy; browser test tạo/sửa/conflict/role có trong tài liệu tổng.
