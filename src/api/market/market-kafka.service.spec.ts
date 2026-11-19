import {
  MarketKafkaService,
  SYMBOL_PARTITIONS,
  getPartitionForSymbol,
} from './market-kafka.service';
import { Candlestick, MarketTick } from './market.interface';

describe('MarketKafkaService & Partitioning Logic', () => {
  describe('getPartitionForSymbol (Dedicated Partition Mapping)', () => {
    it('should map core trading pairs to deterministic exclusive partitions', () => {
      expect(getPartitionForSymbol('BTCUSDT')).toBe(0);
      expect(getPartitionForSymbol('ETHUSDT')).toBe(1);
      expect(getPartitionForSymbol('SOLUSDT')).toBe(2);
    });

    it('should be case-insensitive and trim whitespaces', () => {
      expect(getPartitionForSymbol('btcusdt')).toBe(0);
      expect(getPartitionForSymbol(' ethusdt ')).toBe(1);
      expect(getPartitionForSymbol('SoLuSdT')).toBe(2);
    });

    it('should return a valid partition index [0, totalPartitions - 1] for unknown symbols', () => {
      const partition1 = getPartitionForSymbol('ADAUSDT', 3);
      const partition2 = getPartitionForSymbol('DOGEUSDT', 3);
      const partition3 = getPartitionForSymbol('XRPUSDT', 3);

      expect(partition1).toBeGreaterThanOrEqual(0);
      expect(partition1).toBeLessThan(3);
      expect(partition2).toBeGreaterThanOrEqual(0);
      expect(partition2).toBeLessThan(3);
      expect(partition3).toBeGreaterThanOrEqual(0);
      expect(partition3).toBeLessThan(3);
    });
  });

  describe('MarketKafkaService Producer', () => {
    let service: MarketKafkaService;
    let mockProducer: {
      connect: jest.Mock;
      disconnect: jest.Mock;
      send: jest.Mock;
    };

    beforeEach(() => {
      service = new MarketKafkaService();
      mockProducer = {
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        send: jest.fn().mockResolvedValue(undefined),
      };
      // Gán mock producer và đánh dấu isConnected = true
      (service as any).producer = mockProducer;
      (service as any).isConnected = true;
    });

    it('should send tick with dedicated partition index for BTCUSDT (Partition 0)', async () => {
      const tick: MarketTick = {
        symbol: 'BTCUSDT',
        price: '65000.00',
        quantity: '0.50000000',
        timestamp: 1700000000000,
        tradeId: 'T1001',
        isBuyerMaker: false,
      };

      await service.sendTick(tick);

      expect(mockProducer.send).toHaveBeenCalledTimes(1);
      const payload = mockProducer.send.mock.calls[0][0];
      expect(payload.topic).toBe('market.ticks');
      expect(payload.messages[0]).toEqual({
        partition: 0,
        key: 'BTCUSDT',
        value: JSON.stringify(tick),
        timestamp: '1700000000000',
      });
    });

    it('should send tick with dedicated partition index for ETHUSDT (Partition 1)', async () => {
      const tick: MarketTick = {
        symbol: 'ETHUSDT',
        price: '3500.00',
        quantity: '2.00000000',
        timestamp: 1700000000100,
        tradeId: 'T1002',
        isBuyerMaker: true,
      };

      await service.sendTick(tick);

      const payload = mockProducer.send.mock.calls[0][0];
      expect(payload.messages[0].partition).toBe(1);
      expect(payload.messages[0].key).toBe('ETHUSDT');
    });

    it('should send tick with dedicated partition index for SOLUSDT (Partition 2)', async () => {
      const tick: MarketTick = {
        symbol: 'SOLUSDT',
        price: '150.00',
        quantity: '10.00000000',
        timestamp: 1700000000200,
        tradeId: 'T1003',
        isBuyerMaker: false,
      };

      await service.sendTick(tick);

      const payload = mockProducer.send.mock.calls[0][0];
      expect(payload.messages[0].partition).toBe(2);
      expect(payload.messages[0].key).toBe('SOLUSDT');
    });

    it('should send candle with matching dedicated partition for symbol', async () => {
      const candle: Candlestick = {
        symbol: 'ETHUSDT',
        interval: '1m',
        openTime: 1700000000000,
        closeTime: 1700000060000,
        open: '3500.00',
        high: '3520.00',
        low: '3490.00',
        close: '3515.00',
        volume: '150.50000000',
        tradesCount: 42,
        isClosed: true,
      };

      await service.sendCandle(candle);

      expect(mockProducer.send).toHaveBeenCalledTimes(1);
      const payload = mockProducer.send.mock.calls[0][0];
      expect(payload.topic).toBe('market.candles');
      expect(payload.messages[0].partition).toBe(1);
      expect(payload.messages[0].key).toBe('ETHUSDT_1m');
    });

    it('should not throw if broker is not connected', async () => {
      (service as any).isConnected = false;
      const tick: MarketTick = {
        symbol: 'BTCUSDT',
        price: '65000.00',
        quantity: '0.50000000',
        timestamp: 1700000000000,
        tradeId: 'T1',
        isBuyerMaker: false,
      };

      await expect(service.sendTick(tick)).resolves.not.toThrow();
      expect(mockProducer.send).not.toHaveBeenCalled();
    });
  });
});
