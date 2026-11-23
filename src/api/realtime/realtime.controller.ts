import {
  Body,
  Get,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ApiHandleResponse } from 'src/decorator/api.decorator';
import { IsAuthController } from 'src/decorator/auth.decorator';
import { RequestAuth } from 'src/dto/common-request.dto';
import {
  RealtimeSubscribeTokenRequestDto,
  RealtimeTokenRequestDto,
} from 'src/dto/realtime-dto/realtime-token.dto';
import { RealtimeGatewayStatus } from './realtime.interface';
import { RealtimeService } from './realtime.service';

@IsAuthController('realtime', 'Realtime Gateway & Centrifugo Tokens', false)
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Post('/token')
  @ApiOperation({
    summary: 'Sinh JWT Connection Token để client kết nối vào Centrifugo WebSocket',
    description:
      'Client Next.js dùng token này để mở kết nối wss://... tới Centrifugo. Token được ký bằng HMAC-SHA256.',
  })
  @ApiHandleResponse({
    summary: 'Generate Centrifugo connection token',
    type: Object,
    httpStatus: HttpStatus.OK,
  })
  getConnectionToken(
    @Body() dto: RealtimeTokenRequestDto,
    @Req() req: RequestAuth,
  ) {
    const userId = req.user?.userId || dto.userId || 1;
    return this.realtimeService.generateConnectionToken(userId);
  }

  @Post('/subscribe-token')
  @ApiOperation({
    summary: 'Sinh JWT Subscription Token cho các channel riêng tư (như personal:<userId>)',
    description:
      'Bảo vệ kênh dữ liệu nhạy cảm của người dùng (biến động số dư, trạng thái lệnh riêng tư)',
  })
  @ApiHandleResponse({
    summary: 'Generate Centrifugo subscription token',
    type: Object,
    httpStatus: HttpStatus.OK,
  })
  getSubscriptionToken(
    @Body() dto: RealtimeSubscribeTokenRequestDto,
    @Req() req: RequestAuth,
  ) {
    const userId = req.user?.userId || dto.userId || 1;
    return this.realtimeService.generateSubscriptionToken(userId, dto.channel);
  }

  @Get('/status')
  @ApiOperation({
    summary: 'Kiểm tra trạng thái & số liệu vận hành của Realtime Gateway (Centrifugo)',
    description:
      'Giám sát URL WebSocket, số lượng event đã broadcast và các namespaces hỗ trợ',
  })
  @ApiHandleResponse({
    summary: 'Get Realtime Gateway status',
    type: Object,
    httpStatus: HttpStatus.OK,
  })
  getStatus(): RealtimeGatewayStatus {
    return this.realtimeService.getStatus();
  }
}
