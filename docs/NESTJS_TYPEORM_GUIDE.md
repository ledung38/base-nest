# 📚 Cẩm Nang Toàn Diện: NestJS, TypeORM & Custom Decorators Trong FinTrade

> **Mục tiêu**: Hướng dẫn chi tiết cách hoạt động của NestJS, TypeORM, Dependency Injection, các Decorator dựng sẵn trong dự án và các khái niệm cốt lõi của tầng dữ liệu (`DataSource`, `EntityManager`, `QueryRunner`).

---

## 📌 MỤC LỤC
1. [TypeORM là gì? Giải quyết bài toán nào?](#1-typeorm-là-gì-giải-quyết-bài-toán-nào)
2. [Các thành phần cốt lõi trong TypeORM](#2-các-thành-phần-cốt-lõi-trong-typeorm)
   - [Entity là gì?](#21-entity)
   - [Repository Pattern & Data Mapper vs Active Record](#22-repository-pattern--data-mapper-vs-active-record)
   - [DataSource, EntityManager và QueryRunner](#23-datasource-entitymanager-và-queryrunner)
   - [Tại sao phải Inject (`@InjectRepository` / `@Inject`)?](#24-tại-sao-phải-inject)
3. [Giải mã hệ thống Decorator trong NestJS](#3-giải-mã-hệ-thống-decorator-trong-nestjs)
   - [Decorator bản chất là gì?](#31-decorator-bản-chất-là-gì)
   - [Các Decorator cốt lõi của NestJS](#32-các-decorator-cốt-lõi-của-nestjs)
   - [Các Decorator Validation & Transformation](#33-các-decorator-validation--transformation)
4. [Các Custom Decorators đặc thù trong Boilerplate FinTrade](#4-các-custom-decorators-đặc-thù-trong-boilerplate-fintrade)
   - [Cơ chế `applyDecorators`](#41-cơ-chế-applydecorators)
   - [`@IsAuthController`](#42-isauthcontroller)
   - [`@ApiHandleResponse` & `@ApiPaginatedResponse`](#43-apihandleresponse--apipaginatedresponse)
   - [`@IsSwaggerString`, `@IsSwaggerNumber`, `@IsSwaggerEnum`](#44-isswaggerstring-isswaggernumber-isswaggerenum)
   - [Tại sao DTO tài chính cần Decorator riêng?](#45-tại-sao-dto-tài-chính-cần-decorator-riêng)
5. [Thiết kế Mô hình Tài khoản & Dòng tiền (Account & SettleTrade)](#5-thiết-kế-mô-hình-tài-khoản--dòng-tiền-account--settletrade)
   - [Tại sao 1 User có nhiều Account riêng biệt?](#51-tại-sao-1-user-có-nhiều-account-riêng-biệt)
   - [Phân biệt `lockBalance`, `unlockBalance` và `settleTrade`](#52-phân-biệt-lockbalance-unlockbalance-và-settletrade)

---

## 1. TypeORM là gì? Giải quyết bài toán nào?

### 1.1. Khái niệm ORM
**ORM (Object-Relational Mapping)** là kỹ thuật lập trình chuyển đổi dữ liệu giữa hai thế giới không tương thích:
- **Thế giới Lập trình Hướng đối tượng (OOP - TypeScript/Javascript)**: Làm việc với `Class`, `Object`, `Property`, `Reference`.
- **Thế giới Cơ sở dữ liệu Quan hệ (RDBMS - PostgreSQL, MySQL)**: Làm việc với `Table`, `Row`, `Column`, `Foreign Key`.

Hiện tượng không tương thích này trong kỹ thuật gọi là **Object-Relational Impedance Mismatch**.

### 1.2. Bài toán TypeORM giải quyết
Nếu không có TypeORM, khi muốn lấy 1 tài khoản và trừ tiền, bạn phải tự viết SQL thuần:
```typescript
const result = await db.query(
  'SELECT id, user_id, available_balance FROM accounts WHERE user_id = $1 AND currency = $2',
  [userId, 'USDT']
);
const account = result.rows[0];
// Dễ gõ sai chính tả tên cột, không có autocomplete type-safe, không quản lý được migration
```
**Khi dùng TypeORM**:
1. **Type-Safe 100%**: Trình biên dịch TypeScript bắt lỗi ngay khi bạn gõ sai tên trường `account.availableBalance`.
2. **Tự động hóa Migration**: Quản lý lịch sử thay đổi cấu trúc bảng theo thời gian.
3. **Mối quan hệ tự động (Relations)**: Lấy user kèm theo các tài khoản và lịch sử giao dịch một cách tường minh (`relations: ['accounts', 'ledgerEntries']`).
4. **Bảo vệ chống SQL Injection**: Tự động parameterize mọi biến số truyền vào câu lệnh.

---

## 2. Các thành phần cốt lõi trong TypeORM

### 2.1. Entity
Entity là một TypeScript Class đại diện cho **1 bảng (Table)** trong Database, và mỗi instance của class đại diện cho **1 dòng (Row)** trong bảng đó.
- `@Entity('accounts')`: Khai báo class này map với bảng `accounts`.
- `@Column({ name: 'available_balance', type: 'numeric' })`: Map thuộc tính class với cột trong bảng.
- `@ManyToOne()`, `@OneToMany()`: Khai báo liên kết khóa ngoại.

### 2.2. Repository Pattern: Data Mapper vs Active Record
Có 2 phong cách thiết kế ORM chính:
1. **Active Record**: Entity kế thừa `BaseEntity` và có luôn các hàm `save()`, `find()`, `remove()`.
   ```typescript
   const account = await Account.findOneBy({ id: 1 });
   await account.save();
   ```
   *Ưu điểm*: Viết nhanh, tiện.
   *Nhược điểm*: Vi phạm nguyên lý Single Responsibility (Entity vừa chứa dữ liệu vừa chứa logic truy vấn DB), khó viết Mock Unit Test.
2. **Data Mapper (Repository Pattern)**: Tách riêng Entity (chỉ chứa dữ liệu) và Repository (chuyên thực hiện truy vấn DB).
   ```typescript
   const account = await this.accountRepo.findOneBy({ id: 1 });
   await this.accountRepo.save(account);
   ```
   *Ưu điểm*: Chuẩn kiến trúc doanh nghiệp, dễ mock trong Unit Test, linh hoạt khi mở rộng. **NestJS khuyến khích sử dụng Data Mapper**.

### 2.3. DataSource, EntityManager và QueryRunner

| Khái niệm | Bản chất | Khi nào sử dụng? |
| :--- | :--- | :--- |
| **`DataSource`** | Đối tượng đại diện cho **toàn bộ kết nối** tới CSDL (chứa Connection Pool, cấu hình database, danh sách entity). | Thường dùng ở tầng khởi tạo ứng dụng, chạy migration, hoặc bắt đầu một transaction lớn (`this.dataSource.transaction(...)`). |
| **`EntityManager`** | Đơn vị quản lý thực thể (Unit of Work). Nó biết cách lưu, sửa, xóa, tìm kiếm tất cả các entity mà không cần Repository riêng biệt. | Dùng trong Transaction: `manager.save(Account, acc); manager.save(LedgerEntry, le);` đảm bảo tất cả lệnh đều chung 1 ngữ cảnh. |
| **`QueryRunner`** | Đại diện cho **1 kết nối vật lý đơn lẻ (Single DB Connection)** được mượn từ Pool. | Dùng khi cần kiểm soát thủ công tuyệt đối: tự `startTransaction()`, `commitTransaction()`, `rollbackTransaction()`, hoặc dùng **Pessimistic Locking (`SELECT FOR UPDATE`)** rồi giải phóng kết nối (`release()`). |

### 2.4. Tại sao phải Inject (`@InjectRepository` / `@Inject`)?
Đây là nguyên lý **Dependency Injection (DI) & Inversion of Control (IoC)** - cốt lõi của NestJS:
- **Không nên viết**:
  ```typescript
  export class AccountService {
    private accountRepo = new Repository<Account>(...); // TỰ KHỞI TẠO -> BỊ GẮN CHẶT (TIGHT COUPLING)
  }
  ```
  Nếu tự `new`, khi viết Unit Test bạn buộc phải có Database thật đang chạy thì code mới chạy được, không thể test cô lập!
- **Nên viết**:
  ```typescript
  @Injectable()
  export class AccountService {
    constructor(
      @InjectRepository(Account)
      private readonly accountRepo: Repository<Account>,
    ) {}
  }
  ```
  **Lợi ích**:
  1. **Dễ viết Unit Test (Testability)**: Trong file test `account.service.spec.ts`, bạn có thể "tiêm" vào một `mockRepository` giả lập mà không cần kết nối Database thật!
  2. **Quản lý Vòng đời (Singleton)**: NestJS IoC Container tự động khởi tạo Repository 1 lần duy nhất và tái sử dụng cho toàn bộ app, tiết kiệm tài nguyên.

---

## 3. Giải mã hệ thống Decorator trong NestJS

### 3.1. Decorator bản chất là gì?
Trong TypeScript, Decorator thực chất là một **hàm bậc cao (Higher-Order Function)** nhận vào target (class, method, property hoặc parameter) và **bổ sung thêm siêu dữ liệu (Metadata)** hoặc thay đổi hành vi của target đó.
```typescript
function MyDecorator(metadata) {
  return function (target: any, propertyKey: string) {
    Reflect.defineMetadata('custom_key', metadata, target, propertyKey);
  };
}
```

### 3.2. Các Decorator cốt lõi của NestJS
- `@Module({ imports, controllers, providers, exports })`: Khai báo 1 module đóng gói.
- `@Injectable()`: Đánh dấu class này là 1 "Provider" có thể được NestJS IoC container quản lý và tiêm vào các nơi khác.
- `@Controller('accounts')`: Đánh dấu class này xử lý các HTTP request có prefix `/accounts`.
- `@Get()`, `@Post()`, `@Put()`, `@Delete()`: Định tuyến HTTP method.
- `@Req()`, `@Body()`, `@Param('id')`, `@Query()`: Trích xuất dữ liệu từ HTTP Request đưa vào tham số của hàm.
- `@UseGuards(AccessTokenGuard)`: Chặn request lại để kiểm tra xác thực JWT / phân quyền trước khi cho vào controller.

### 3.3. Các Decorator Validation & Transformation
- `class-validator`: `@IsNotEmpty()`, `@IsString()`, `@IsNumber()`, `@IsEnum()`, `@Matches()`.
  $\rightarrow$ Tự động trả về HTTP 400 Bad Request nếu dữ liệu client gửi lên không đúng định dạng.
- `class-transformer`: `@Type(() => Number)`, `@Transform(...)`.
  $\rightarrow$ Chuyển đổi dữ liệu thô từ HTTP (vốn luôn là chuỗi string) thành kiểu dữ liệu mong muốn.

---

## 4. Các Custom Decorators đặc thù trong Boilerplate FinTrade

### 4.1. Cơ chế `applyDecorators`
Để tránh việc 1 method hoặc property phải gắn 6-7 decorator lặp đi lặp lại:
```typescript
// Nếu không gom:
@ApiOkResponse(...)
@ApiDefaultResponse(...)
@HttpCode(200)
@ApiOperation({ summary: '...' })
async myMethod() {}
```
NestJS cung cấp hàm `applyDecorators(...)` để gom nhiều decorator thành **1 decorator duy nhất**.

### 4.2. `@IsAuthController`
Nằm tại [`src/decorator/auth.decorator.ts`](file:///d:/WORKSPACE/dsc/fintech/fintrade-be/src/decorator/auth.decorator.ts):
```typescript
export function IsAuthController(name: string, apiTag: string, isRequire = true) {
  return applyDecorators(
    Controller(name),
    ApiTags(apiTag),
    ...(isRequire ? [ApiBearerAuth(), UseGuards(AccessTokenGuard, PermissionGuard)] : []),
  );
}
```
**Tác dụng**: Chỉ cần viết `@IsAuthController('accounts', 'Accounts', true)`, bạn lập tức có:
1. Gán Route `/accounts`
2. Nhóm Swagger tag `Accounts`
3. Bật ổ khóa Bearer JWT trên Swagger
4. Kích hoạt Guard xác thực Token (`AccessTokenGuard`) và Guard phân quyền Action (`PermissionGuard`).

### 4.3. `@ApiHandleResponse` & `@ApiPaginatedResponse`
Nằm tại [`src/decorator/api.decorator.ts`](file:///d:/WORKSPACE/dsc/fintech/fintrade-be/src/decorator/api.decorator.ts):
- Gom `@ApiOkResponse`, `@ApiDefaultResponse`, `@HttpCode`, `@ApiOperation` vào làm một.
- Tự động map schema chuẩn của `PageDto` với danh sách phân trang `data: [items]`.

### 4.4. `@IsSwaggerString`, `@IsSwaggerNumber`, `@IsSwaggerEnum`
Nằm tại [`src/decorator/swagger.decorator.ts`](file:///d:/WORKSPACE/dsc/fintech/fintrade-be/src/decorator/swagger.decorator.ts):
- Gom Swagger documentation (`@ApiProperty`) cùng với validator (`@IsString`, `@IsNumber`) và transformer.

### 4.5. Tại sao DTO tài chính (`amount`) không dùng `@IsSwaggerString` hay `@IsSwaggerNumber`?
Đây là một chi tiết kiến trúc rất tinh tế:
1. **Nếu dùng `@IsSwaggerNumber`**:
   - Bên trong nó có `Type(() => Number)` $\rightarrow$ Ép chuỗi thành kiểu `number` của Javascript.
   - Nhưng theo **ADR 07 trong `ENGINEERING_LOG.md`**, Javascript `number` dùng chuẩn IEEE 754 float gây lỗi sai số tài chính! Số tiền trong sàn giao dịch bắt buộc phải là dạng chuỗi (`string`) để nạp vào `BigNumber.js` và lưu xuống PostgreSQL dưới dạng `numeric(28, 8)`.
2. **Nếu dùng `@IsSwaggerString`**:
   - Nó chỉ kiểm tra chuỗi (`IsString`), nhưng không kiểm tra xem chuỗi đó có phải là một **con số dương hợp lệ với tối đa 8 số thập phân** hay không. Người dùng gửi lên `"abc"` hay `"-9999"` thì `@IsSwaggerString` vẫn cho qua!
3. **Giải pháp chuẩn hóa**:
   Chúng ta tạo một custom decorator riêng cho tiền tệ tài chính:
   `@IsSwaggerFinancialDecimal({ default: '10000.00000000', description: 'Số tiền nạp' })`.

---

## 5. Thiết kế Mô hình Tài khoản & Dòng tiền (Account & SettleTrade)

### 5.1. Tại sao 1 User có nhiều Account riêng biệt?
Trong hệ thống FinTrade:
- 1 User (người dùng/nhà giao dịch) sở hữu nhiều **Ví tài sản (Accounts)**:
  - 1 Account USDT
  - 1 Account BTC
  - 1 Account ETH
  - 1 Account SOL

**Tại sao không nhét thẳng các cột vào bảng `users` (`users.usdt_balance`, `users.btc_balance`)?**
1. **Chuẩn hóa Cơ sở dữ liệu (Database Normalization)**:
   Nếu để trong bảng `users`, mỗi khi sàn niêm yết thêm 1 đồng coin mới (ví dụ DOGE, BNB, XRP), bạn lại phải chạy migration sửa cấu trúc bảng `users` (`ALTER TABLE users ADD COLUMN doge_balance...`). Điều này cực kỳ rủi ro và làm khóa bảng lớn trong production!
   Với thiết kế bảng `accounts` riêng có khóa `(user_id, currency)` là unique: Khi sàn niêm yết coin mới, chỉ cần insert dòng mới vào bảng `accounts` mà **không cần đụng đến cấu trúc bảng**.
2. **Tách biệt Trách nhiệm (Separation of Concerns)**:
   Bảng `users` chỉ phục vụ đăng nhập, hồ sơ, mật khẩu (Auth Domain).
   Bảng `accounts` và `ledger_entries` phục vụ hạch toán số dư (Financial Domain).
   Hai nghiệp vụ này độc lập về chu kỳ sống và quyền truy cập.

---

### 5.2. Phân biệt `lockBalance`, `unlockBalance` và `settleTrade`

Nhiều người mới làm sàn giao dịch thường nhầm lẫn giữa 3 thao tác này:

```text
[Khi Đặt Lệnh Mua 0.1 BTC giá $60,000 USDT]
  Available USDT: - $6,000  ──(lockBalance)──>  Locked USDT: + $6,000
  (Tiền chưa mất đi, chỉ bị đóng băng để đảm bảo lệnh có tiền thanh toán)

           │
           ├── Lệnh Bị Hủy (User Cancel Order)
           │     Locked USDT: - $6,000  ──(unlockBalance)──>  Available USDT: + $6,000
           │     (Hoàn trả lại trạng thái ban đầu)
           │
           └── Lệnh Khớp Thành Công (Order Filled)
                 Locked USDT: - $6,000 (Trừ vĩnh viễn khỏi ví USDT)
                 Available BTC: + 0.1 BTC (Nhận coin vào ví khả dụng)
                 ──(settleTrade: Quyết toán chuyển giao quyền sở hữu tài sản)──
```

- **`lockBalance`**: Tạm giữ tiền ký quỹ khi người dùng vừa bấm "Đặt lệnh". Tiền vẫn là của user, chỉ chuyển từ ngăn `available` sang ngăn `locked`.
- **`unlockBalance`**: Hoàn tiền ký quỹ về ví khả dụng khi người dùng "Hủy lệnh".
- **`settleTrade`**: Thực hiện **chuyển giao tài sản thật sự khi lệnh khớp**. Người mua bị trừ đứt tiền đang ký quỹ (`locked_balance`) và được cộng coin mới vào ví khả dụng (`available_balance`). Nếu ở đây lại gọi `unlockBalance` thì người mua vừa nhận được coin, lại vừa được hoàn lại tiền USDT $\rightarrow$ Lỗ hổng nhân đôi tiền (Double-Spending)!

