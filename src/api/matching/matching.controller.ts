import {
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ApiHandleResponse } from 'src/decorator/api.decorator';
import { IsAuthController } from 'src/decorator/auth.decorator';
import { RequestAuth } from 'src/dto/common-request.dto';
import { OrderBookDepth } from './matching.interface';
import { MatchingService } from './matching.service';

@IsAuthController('matching', 'In-Memory Matching Engine & Trades', false)
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Get('/orderbook/:symbol')
  @ApiOperation({
    summary: 'Lấy L2 Orderbook Depth (Sổ lệnh khớp lệnh trong RAM)',
    description:
      'Trả về danh sách các mức giá BIDS và ASKS được gom khối lượng theo thuật toán Price-Time Priority',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 20,
    description: 'Số lượng mức giá tối đa mỗi bên Bids/Asks',
  })
  @ApiHandleResponse({
    summary: 'Get L2 Orderbook Depth',
    type: Object,
    httpStatus: HttpStatus.OK,
  })
  getOrderBookDepth(
    @Param('symbol') symbol: string,
    @Query('limit') limit?: number,
  ): OrderBookDepth {
    return this.matchingService.getOrderBookDepth(
      symbol,
      limit ? Number(limit) : 20,
    );
  }

  @Get('/trades/:symbol')
  @ApiOperation({
    summary: 'Lấy lịch sử giao dịch khớp lệnh gần nhất của 1 cặp coin',
    description: 'Trả về các bản ghi Trade đã quyết toán sổ cái thành công',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 50,
    description: 'Số lượng giao dịch tối đa',
  })
  @ApiHandleResponse({
    summary: 'Get Recent Public Trades',
    type: Object,
    httpStatus: HttpStatus.OK,
  })
  async getRecentTrades(
    @Param('symbol') symbol: string,
    @Query('limit') limit?: number,
  ) {
    return this.matchingService.getRecentTrades(
      symbol,
      limit ? Number(limit) : 50,
    );
  }

  @Get('/my-trades')
  @ApiOperation({
    summary: 'Lấy lịch sử giao dịch khớp lệnh của người dùng hiện tại',
    description: 'Bao gồm các lượt mua và bán (Taker hoặc Maker)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 50,
    description: 'Số lượng giao dịch tối đa',
  })
  @ApiHandleResponse({
    summary: 'Get Current User Trades',
    type: Object,
    httpStatus: HttpStatus.OK,
  })
  async getMyTrades(
    @Req() req: RequestAuth,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user?.userId || 1; // Default sandbox user
    return this.matchingService.getUserTrades(
      userId,
      limit ? Number(limit) : 50,
    );
  }
}
