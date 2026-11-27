import {
  Body,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ApiHandleResponse } from 'src/decorator/api.decorator';
import { IsAuthController } from 'src/decorator/auth.decorator';
import { CreateBotDto } from 'src/dto/bot-dto/create-bot.dto';
import { RequestAuth } from 'src/dto/common-request.dto';
import { BotService } from './bot.service';

@IsAuthController(
  'bots',
  'Automated Trading Bots (Grid & External Alpha Signals)',
  false,
)
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Post('/')
  @ApiOperation({
    summary: 'Tạo cấu hình bot giao dịch tự động mới',
    description:
      'Hỗ trợ 2 chế độ: GRID_TRADING (Lưới giá tự động) hoặc ALPHA_SIGNAL (Thực thi lệnh theo tín hiệu từ Python Quant Worker)',
  })
  @ApiHandleResponse({
    summary: 'Create trading bot',
    type: Object,
    httpStatus: HttpStatus.CREATED,
  })
  async createBot(@Body() dto: CreateBotDto, @Req() req: RequestAuth) {
    const userId = req.user?.userId || 1;
    return await this.botService.createBot(userId, dto);
  }

  @Get('/')
  @ApiOperation({
    summary: 'Lấy danh sách các bot của người dùng kèm PnL thống kê',
  })
  @ApiHandleResponse({
    summary: 'List user bots',
    type: Object,
    httpStatus: HttpStatus.OK,
  })
  async getUserBots(@Req() req: RequestAuth) {
    const userId = req.user?.userId || 1;
    return await this.botService.getUserBots(userId);
  }

  @Get('/signals/status')
  @ApiOperation({
    summary: 'Giám sát trạng thái & độ trễ pipeline nhận tín hiệu Alpha từ Python Quant Worker',
  })
  @ApiHandleResponse({
    summary: 'Get alpha signal consumer status',
    type: Object,
    httpStatus: HttpStatus.OK,
  })
  getSignalPipelineStatus() {
    return this.botService.getSignalPipelineStatus();
  }

  @Get('/:id')
  @ApiOperation({
    summary: 'Xem chi tiết 1 bot giao dịch',
  })
  @ApiHandleResponse({
    summary: 'Get bot detail',
    type: Object,
    httpStatus: HttpStatus.OK,
  })
  async getBotById(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestAuth,
  ) {
    const userId = req.user?.userId || 1;
    return await this.botService.getBotById(userId, id);
  }

  @Patch('/:id/start')
  @ApiOperation({
    summary: 'Kích hoạt chạy bot (Start)',
    description:
      'Khởi tạo lưới lệnh chờ với Grid Bot, hoặc đăng ký lắng nghe tín hiệu trên RabbitMQ trading.signals với Alpha Signal Bot',
  })
  @ApiHandleResponse({
    summary: 'Start bot',
    type: Object,
    httpStatus: HttpStatus.OK,
  })
  async startBot(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestAuth,
  ) {
    const userId = req.user?.userId || 1;
    return await this.botService.startBot(userId, id);
  }

  @Patch('/:id/stop')
  @ApiOperation({
    summary: 'Tạm dừng bot (Stop)',
    description: 'Hủy toàn bộ lệnh đang treo (Grid) hoặc ngưng nhận tín hiệu (Alpha Signal)',
  })
  @ApiHandleResponse({
    summary: 'Stop bot',
    type: Object,
    httpStatus: HttpStatus.OK,
  })
  async stopBot(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestAuth,
  ) {
    const userId = req.user?.userId || 1;
    return await this.botService.stopBot(userId, id);
  }

  @Delete('/:id')
  @ApiOperation({
    summary: 'Xóa cấu hình bot',
  })
  @ApiHandleResponse({
    summary: 'Delete bot',
    type: Object,
    httpStatus: HttpStatus.OK,
  })
  async deleteBot(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestAuth,
  ) {
    const userId = req.user?.userId || 1;
    await this.botService.deleteBot(userId, id);
    return { success: true };
  }
}
