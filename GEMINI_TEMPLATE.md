# Hướng dẫn dự án: [Tên dự án của bạn]

## 1. Công nghệ & Thư viện chính (Tech Stack)

- **Frontend / Backend:** (Ví dụ: Next.js 14 App Router, TypeScript strict, Tailwind CSS)
- **Database / ORM:** (Ví dụ: PostgreSQL, Prisma ORM)
- **State Management / API:** (Ví dụ: TanStack Query v5, Axios client nội bộ tại `src/libs/api.ts`)

## 2. Cấu trúc thư mục (Architecture)

- `src/app/`: Routing và Pages
- `src/components/ui/`: Các UI component dùng chung (Shadcn UI)
- `src/features/`: Code chia theo tính năng (mỗi feature gồm `api/`, `components/`, `hooks/`)
- `src/services/`: Nghiệp vụ backend / business logic

## 3. Lệnh vận hành (Commands)

- Chạy môi trường dev: `npm run dev`
- Chạy linter & format: `npm run lint` / `npm run format`
- Chạy kiểm thử: `npm run test` (hoặc lệnh test cụ thể: `npm run test:unit`)
- Chạy migration DB: `npx prisma migrate dev`

## 4. Quy ước bắt buộc (DOs & DONTs)

### DO:

- Đặt tên file component theo chuẩn `kebab-case.tsx`, hàm/biến theo `camelCase`.
- Luôn định nghĩa Type/Interface rõ ràng trong thư mục `types/`, không dùng `any`.
- Tái sử dụng các UI components có sẵn trong `src/components/ui/` trước khi tạo mới.

### DONT:

- Không tự ý cài thêm package/thư viện ngoài mà không hỏi trước.
- Không dùng `fetch` trực tiếp, bắt buộc dùng instance `apiClient` từ `src/libs/api.ts`.
- Không hardcode các chuỗi text hiển thị (bắt buộc dùng i18n / file locale nếu có).

HI
