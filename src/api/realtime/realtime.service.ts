import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as jwt from 'jsonwebtoken';
import { ENV } from 'src/config/environment';
import {
  CentrifugoBroadcastRequest,
  CentrifugoPublishRequest,
  CentrifugoPublishResponse,
  CentrifugoSubscriptionTokenResponse,
  CentrifugoTokenResponse,
  RealtimeGatewayStatus,
} from './realtime.interface';

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly axiosClient: AxiosInstance;
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly tokenSecret: string;
  private readonly wsUrl: string;

  private totalPublished = 0;
  private totalErrors = 0;
  private lastPublishTimestamp: number | null = null;

  constructor() {
    this.apiUrl = ENV.CENTRIFUGO.API_URL;
    this.apiKey = ENV.CENTRIFUGO.API_KEY;
    this.tokenSecret = ENV.CENTRIFUGO.TOKEN_SECRET;
    this.wsUrl = `ws://localhost:${ENV.CENTRIFUGO.PORT}/connection/websocket`;

    this.axiosClient = axios.create({
      baseURL: this.apiUrl,
      timeout: 3000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `apikey ${this.apiKey}`,
      },
    });
  }

  /**
   * Bắn dữ liệu vào 1 channel duy nhất trên Centrifugo
   */
  async publish(channel: string, data: any): Promise<boolean> {
    try {
      const payload: CentrifugoPublishRequest = { channel, data };
      const res = await this.axiosClient.post<CentrifugoPublishResponse>(
        '/publish',
        payload,
      );

      if (res.data?.error) {
        this.totalErrors += 1;
        this.logger.warn(
          `Centrifugo publish error on channel [${channel}]: ${res.data.error.message} (code: ${res.data.error.code})`,
        );
        return false;
      }

      this.totalPublished += 1;
      this.lastPublishTimestamp = Date.now();
      return true;
    } catch (err) {
      this.totalErrors += 1;
      this.logger.warn(
        `Failed to publish to Centrifugo channel [${channel}]: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Bắn đồng thời dữ liệu vào nhiều channels (Broadcast)
   */
  async broadcast(channels: string[], data: any): Promise<boolean> {
    if (!channels || channels.length === 0) return true;

    try {
      const payload: CentrifugoBroadcastRequest = { channels, data };
      const res = await this.axiosClient.post<CentrifugoPublishResponse>(
        '/broadcast',
        payload,
      );

      if (res.data?.error) {
        this.totalErrors += 1;
        this.logger.warn(
          `Centrifugo broadcast error on [${channels.join(', ')}]: ${res.data.error.message}`,
        );
        return false;
      }

      this.totalPublished += channels.length;
      this.lastPublishTimestamp = Date.now();
      return true;
    } catch (err) {
      this.totalErrors += 1;
      this.logger.warn(
        `Failed to broadcast to Centrifugo: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Sinh JWT Connection Token HMAC-SHA256 để client Next.js kết nối vào Centrifugo WebSocket
   */
  generateConnectionToken(
    userId: number | string,
    expireSeconds = 86400,
  ): CentrifugoTokenResponse {
    const sub = String(userId);
    const exp = Math.floor(Date.now() / 1000) + expireSeconds;

    const token = jwt.sign(
      {
        sub,
        exp,
      },
      this.tokenSecret,
      { algorithm: 'HS256' },
    );

    return {
      token,
      wsUrl: this.wsUrl,
      userId: Number(userId),
      expiresIn: expireSeconds,
    };
  }

  /**
   * Sinh JWT Subscription Token HMAC-SHA256 để client đăng ký các channel riêng tư (như 'personal:<userId>')
   */
  generateSubscriptionToken(
    userId: number | string,
    channel: string,
    expireSeconds = 86400,
  ): CentrifugoSubscriptionTokenResponse {
    const sub = String(userId);
    const exp = Math.floor(Date.now() / 1000) + expireSeconds;

    const token = jwt.sign(
      {
        sub,
        channel,
        exp,
      },
      this.tokenSecret,
      { algorithm: 'HS256' },
    );

    return {
      token,
      channel,
      userId: Number(userId),
      expiresIn: expireSeconds,
    };
  }

  /**
   * Trả về thông tin trạng thái & số liệu vận hành của Realtime Gateway
   */
  getStatus(): RealtimeGatewayStatus {
    return {
      connected: true,
      apiUrl: this.apiUrl,
      wsUrl: this.wsUrl,
      totalPublished: this.totalPublished,
      totalErrors: this.totalErrors,
      lastPublishTimestamp: this.lastPublishTimestamp,
      channels: {
        publicNamespaces: ['public:ticks:*', 'public:orderbook:*', 'public:trades:*', 'public:candles:*'],
        personalNamespace: 'personal:<user_id>',
      },
    };
  }
}
