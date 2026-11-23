import { IsOptional } from 'class-validator';
import {
  IsSwaggerNumber,
  IsSwaggerString,
} from 'src/decorator/swagger.decorator';

export class RealtimeTokenRequestDto {
  @IsSwaggerNumber(
    {
      default: 1,
      description:
        'ID của người dùng kết nối (mặc định 1 nếu không truyền trong sandbox)',
    },
    false,
  )
  @IsOptional()
  userId?: number;
}

export class RealtimeSubscribeTokenRequestDto {
  @IsSwaggerString({
    default: 'personal:1',
    description: 'Tên channel cần đăng ký subscribe (ví dụ: personal:1)',
  })
  channel: string;

  @IsSwaggerNumber(
    {
      default: 1,
      description: 'ID người dùng sở hữu kênh private',
    },
    false,
  )
  @IsOptional()
  userId?: number;
}
