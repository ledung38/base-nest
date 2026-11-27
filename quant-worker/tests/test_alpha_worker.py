import os
import sys
import unittest
from types import SimpleNamespace

import numpy as np

# Cho phép chạy test trực tiếp từ thư mục quant-worker
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from candle_buffer import CandleBuffer
from signal_contract import build_signal_payload
from strategies.alpha_confluence import AlphaConfluenceStrategy


def _make_candle(open_time: int, close: float, volume: float = 100.0, is_closed: bool = True) -> dict:
    return {
        "symbol": "BTCUSDT",
        "interval": "5m",
        "openTime": open_time,
        "closeTime": open_time + 300_000 - 1,
        "open": f"{close - 10:.2f}",
        "high": f"{close + 15:.2f}",
        "low": f"{close - 15:.2f}",
        "close": f"{close:.2f}",
        "volume": f"{volume:.4f}",
        "tradesCount": 42,
        "isClosed": is_closed,
    }


class TestCandleBuffer(unittest.TestCase):
    def test_dedupes_and_enforces_max_size(self):
        buf = CandleBuffer(max_size=5)
        candles = [_make_candle(1000 + i * 300_000, 60000 + i * 10) for i in range(7)]
        loaded = buf.load_initial("BTCUSDT", "5m", candles)
        self.assertEqual(loaded, 5)
        arr = buf.to_numpy("BTCUSDT", "5m")
        self.assertEqual(len(arr), 5)
        self.assertEqual(arr.open_times[0], 1000 + 2 * 300_000)
        self.assertEqual(arr.closes[-1], 60060.0)

        # Nến trùng openTime phải bị bỏ qua (trả về False)
        self.assertFalse(buf.append_closed(candles[-1]))
        # Nến chưa chốt phải bị bỏ qua
        self.assertFalse(buf.append_closed(_make_candle(999999999, 61000, is_closed=False)))
        # Nến mới đã chốt được thêm vào và đẩy nến cũ nhất ra
        self.assertTrue(buf.append_closed(_make_candle(1000 + 7 * 300_000, 60070)))
        self.assertEqual(buf.count("BTCUSDT", "5m"), 5)


class TestAlphaConfluenceStrategy(unittest.TestCase):
    def _build_ohlcv(self, count: int = 120, last_volume: float = 250.0):
        buf = CandleBuffer(max_size=1000)
        candles = [
            _make_candle(
                1700000000000 + i * 300_000,
                60000.0 + i * 5.0,
                volume=last_volume if i == count - 1 else 100.0,
            )
            for i in range(count)
        ]
        buf.load_initial("BTCUSDT", "5m", candles)
        return buf.to_numpy("BTCUSDT", "5m")

    def test_returns_zero_when_insufficient_bars(self):
        ohlcv = self._build_ohlcv(count=50)
        strategy = AlphaConfluenceStrategy(rsi_period=14, talib_module=SimpleNamespace())
        self.assertEqual(strategy.evaluate(ohlcv), 0)

    def test_triggers_bullish_and_bearish_signals_matching_confluence_rules(self):
        n = 120
        ohlcv = self._build_ohlcv(count=n, last_volume=250.0)

        # Fake TA-Lib trả kết quả thỏa mãn toàn bộ 6 điều kiện BULLISH
        bullish_talib = SimpleNamespace(
            EMA=lambda arr, timeperiod: np.full(n, 65000.0 if timeperiod == 20 else 62000.0),
            WMA=lambda arr, timeperiod: np.full(n, 66000.0),
            MACD=lambda arr, fastperiod, slowperiod, signalperiod: (
                np.full(n, 120.0),
                np.full(n, 80.0),
                np.full(n, 40.0),
            ),
            RSI=lambda arr, days: np.full(n, 62.0),
            ATR=lambda h, l, c, timeperiod: np.array([200.0] * (n - 1) + [120.0]),
        )
        strategy_bull = AlphaConfluenceStrategy(rsi_period=14, talib_module=bullish_talib)
        self.assertEqual(strategy_bull.evaluate(ohlcv), 1)

        # Fake TA-Lib thỏa mãn toàn bộ 6 điều kiện BEARISH
        bearish_talib = SimpleNamespace(
            EMA=lambda arr, timeperiod: np.full(n, 60000.0 if timeperiod == 20 else 64000.0),
            WMA=lambda arr, timeperiod: np.full(n, 59000.0),
            MACD=lambda arr, fastperiod, slowperiod, signalperiod: (
                np.full(n, -120.0),
                np.full(n, -80.0),
                np.full(n, -40.0),
            ),
            RSI=lambda arr, days: np.full(n, 38.0),
            ATR=lambda h, l, c, timeperiod: np.array([200.0] * (n - 1) + [120.0]),
        )
        strategy_bear = AlphaConfluenceStrategy(rsi_period=14, talib_module=bearish_talib)
        self.assertEqual(strategy_bear.evaluate(ohlcv), -1)

        # Nếu biến động cao (ATR[-1] >= avg_atr) -> phải trả về 0
        high_vol_talib = SimpleNamespace(
            **{
                **bullish_talib.__dict__,
                "ATR": lambda h, l, c, timeperiod: np.array([100.0] * (n - 1) + [300.0]),
            }
        )
        strategy_vol = AlphaConfluenceStrategy(rsi_period=14, talib_module=high_vol_talib)
        self.assertEqual(strategy_vol.evaluate(ohlcv), 0)

    def test_build_signal_payload_contract(self):
        candle = _make_candle(1795478400000, 68700.0)
        payload = build_signal_payload("ALPHA_CONFLUENCE_01", candle, 1, 1795478701234)
        self.assertEqual(
            payload["signalId"],
            "ALPHA_CONFLUENCE_01:BTCUSDT:5m:1795478400000",
        )
        self.assertEqual(payload["action"], 1)
        self.assertEqual(payload["interval"], "5m")
        self.assertEqual(payload["refPrice"], "68700.00")


if __name__ == "__main__":
    unittest.main()
