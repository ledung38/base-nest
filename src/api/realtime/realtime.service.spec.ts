import * as jwt from 'jsonwebtoken';
import { ENV } from 'src/config/environment';
import { RealtimeService } from './realtime.service';

describe('RealtimeService (Centrifugo HTTP Publisher & JWT Tokens)', () => {
  let service: RealtimeService;
  let mockPost: jest.Mock;

  beforeEach(() => {
    service = new RealtimeService();
    mockPost = jest.fn();
    (service as any).axiosClient = {
      post: mockPost,
    };
  });

  describe('JWT Token Generation', () => {
    it('should generate valid Centrifugo connection token with HS256 and sub claim', () => {
      const res = service.generateConnectionToken(101, 3600);

      expect(res.token).toBeDefined();
      expect(res.userId).toBe(101);
      expect(res.expiresIn).toBe(3600);

      const decoded = jwt.verify(
        res.token,
        ENV.CENTRIFUGO.TOKEN_SECRET,
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe('101');
      expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should generate valid subscription token for private channel with channel claim', () => {
      const res = service.generateSubscriptionToken(101, 'personal:101', 1800);

      expect(res.token).toBeDefined();
      expect(res.channel).toBe('personal:101');
      expect(res.userId).toBe(101);

      const decoded = jwt.verify(
        res.token,
        ENV.CENTRIFUGO.TOKEN_SECRET,
      ) as jwt.JwtPayload;

      expect(decoded.sub).toBe('101');
      expect(decoded.channel).toBe('personal:101');
    });
  });

  describe('publish', () => {
    it('should publish message to Centrifugo channel and return true on success', async () => {
      mockPost.mockResolvedValueOnce({
        data: { result: { offset: 12, epoch: 'test' } },
      });

      const success = await service.publish('public:ticks:BTCUSDT', {
        price: '65000.00',
      });

      expect(success).toBe(true);
      expect(mockPost).toHaveBeenCalledWith('/publish', {
        channel: 'public:ticks:BTCUSDT',
        data: { price: '65000.00' },
      });

      const status = service.getStatus();
      expect(status.totalPublished).toBe(1);
      expect(status.totalErrors).toBe(0);
    });

    it('should handle Centrifugo API error cleanly without throwing', async () => {
      mockPost.mockResolvedValueOnce({
        data: { error: { code: 102, message: 'channel not found' } },
      });

      const success = await service.publish('unknown:channel', {});

      expect(success).toBe(false);
      const status = service.getStatus();
      expect(status.totalErrors).toBe(1);
    });

    it('should catch network exceptions gracefully', async () => {
      mockPost.mockRejectedValueOnce(new Error('Connection refused'));

      const success = await service.publish('public:ticks:BTCUSDT', {});

      expect(success).toBe(false);
      const status = service.getStatus();
      expect(status.totalErrors).toBe(1);
    });
  });

  describe('broadcast', () => {
    it('should broadcast message to multiple channels and return true on success', async () => {
      mockPost.mockResolvedValueOnce({
        data: { result: {} },
      });

      const channels = ['public:ticks:BTCUSDT', 'public:ticks:ETHUSDT'];
      const success = await service.broadcast(channels, { ping: true });

      expect(success).toBe(true);
      expect(mockPost).toHaveBeenCalledWith('/broadcast', {
        channels,
        data: { ping: true },
      });
      expect(service.getStatus().totalPublished).toBe(2);
    });

    it('should return true immediately if channels array is empty', async () => {
      const success = await service.broadcast([], {});
      expect(success).toBe(true);
      expect(mockPost).not.toHaveBeenCalled();
    });
  });
});
