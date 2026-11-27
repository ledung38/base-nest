import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OrderRabbitmqService } from 'src/api/order/order-rabbitmq.service';
import { TradeDomainEvent } from 'src/api/order/order.interface';
import { BotTypeEnum } from 'src/constant/trading.enum';
import { CreateBotDto } from 'src/dto/bot-dto/create-bot.dto';
import { BotConfig } from 'src/entities/bot-config.entity';
import { Repository } from 'typeorm';
import { SignalPipelineStatus } from './bot.interface';
import { SignalConsumerService } from './signal-consumer.service';
import { GridTradingWorker } from './workers/grid-trading.worker';

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);
  private readonly BOT_EVENT_QUEUE = 'bots.events.queue';

  constructor(
    @InjectRepository(BotConfig)
    private readonly botConfigRepo: Repository<BotConfig>,
    private readonly gridWorker: GridTradingWorker,
    private readonly signalWorker: SignalConsumerService,
    private readonly rabbitmqService: OrderRabbitmqService,
  ) {}

  async onModuleInit() {
    // 1. Phục hồi các bot đang chạy khi khởi động server
    await this.restoreActiveBots();

    // 2. Đăng ký consumer lắng nghe sự kiện khớp lệnh (trade.executed) cho Grid Bot
    await this.rabbitmqService.registerEventConsumer(
      this.BOT_EVENT_QUEUE,
      'trade.*',
      async (routingKey, payload) => {
        if (routingKey === 'trade.executed') {
          await this.gridWorker.handleTradeExecuted(
            payload as TradeDomainEvent,
          );
        }
      },
    );

    // 3. Đăng ký consumer lắng nghe tín hiệu Alpha từ Python quant-worker trên queue trading.signals
    await this.rabbitmqService.registerSignalConsumer((payload) =>
      this.signalWorker.handleSignal(payload),
    );
  }

  /**
   * Khôi phục các bot đang ở trạng thái isActive = true
   */
  async restoreActiveBots(): Promise<void> {
    try {
      const activeBots = await this.botConfigRepo.find({
        where: { isActive: true },
      });

      for (const bot of activeBots) {
        if (bot.botType === BotTypeEnum.GRID_TRADING) {
          await this.gridWorker.startBot(bot);
        } else if (bot.botType === BotTypeEnum.ALPHA_SIGNAL) {
          await this.signalWorker.startBot(bot);
        }
      }

      this.logger.log(
        `Restored and activated ${activeBots.length} bots from database.`,
      );
    } catch (err) {
      this.logger.error('Failed to restore active bots on startup:', err);
    }
  }

  /**
   * Tạo cấu hình Bot mới
   */
  async createBot(userId: number, dto: CreateBotDto): Promise<BotConfig> {
    const bot = this.botConfigRepo.create({
      userId,
      name: dto.name,
      botType: dto.botType,
      symbol: dto.symbol.toUpperCase(),
      parameters: dto.parameters,
      isActive: false,
      realizedPnl: '0.00000000',
      totalTradesCount: 0,
      lastSignal: null,
      lastRunAt: null,
    });

    const savedBot = await this.botConfigRepo.save(bot);

    if (dto.autoStart) {
      return await this.startBot(userId, savedBot.id);
    }

    return savedBot;
  }

  /**
   * Lấy danh sách Bot của người dùng
   */
  async getUserBots(userId: number): Promise<BotConfig[]> {
    return this.botConfigRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Lấy chi tiết 1 bot
   */
  async getBotById(userId: number, botId: number): Promise<BotConfig> {
    const bot = await this.botConfigRepo.findOne({
      where: { id: botId, userId },
    });

    if (!bot) {
      throw new NotFoundException('Không tìm thấy bot giao dịch');
    }

    return bot;
  }

  /**
   * Kích hoạt chạy bot (Start)
   */
  async startBot(userId: number, botId: number): Promise<BotConfig> {
    const bot = await this.getBotById(userId, botId);

    if (bot.isActive) {
      throw new BadRequestException('Bot đã và đang hoạt động');
    }

    if (bot.botType === BotTypeEnum.GRID_TRADING) {
      await this.gridWorker.startBot(bot);
    } else if (bot.botType === BotTypeEnum.ALPHA_SIGNAL) {
      await this.signalWorker.startBot(bot);
    }

    bot.isActive = true;
    bot.lastRunAt = new Date();
    return await this.botConfigRepo.save(bot);
  }

  /**
   * Tạm dừng bot (Stop)
   */
  async stopBot(userId: number, botId: number): Promise<BotConfig> {
    const bot = await this.getBotById(userId, botId);

    if (!bot.isActive) {
      return bot;
    }

    if (bot.botType === BotTypeEnum.GRID_TRADING) {
      await this.gridWorker.stopBot(bot.id);
    } else if (bot.botType === BotTypeEnum.ALPHA_SIGNAL) {
      await this.signalWorker.stopBot(bot.id);
    }

    bot.isActive = false;
    return await this.botConfigRepo.save(bot);
  }

  /**
   * Xóa cấu hình bot
   */
  async deleteBot(userId: number, botId: number): Promise<void> {
    const bot = await this.getBotById(userId, botId);
    if (bot.isActive) {
      await this.stopBot(userId, botId);
    }
    await this.botConfigRepo.delete({ id: botId });
  }

  /**
   * Thống kê pipeline nhận tín hiệu từ Python quant-worker
   */
  getSignalPipelineStatus(): SignalPipelineStatus {
    return this.signalWorker.getStatus();
  }
}
