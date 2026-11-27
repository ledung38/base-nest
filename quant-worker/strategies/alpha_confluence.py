import numpy as np

from candle_buffer import OhlcvArrays
from strategies.base import AlphaStrategy


def _load_talib():
    import talib  # noqa: PLC0415

    return talib


class AlphaConfluenceStrategy(AlphaStrategy):
    """
    Chiến lược Hợp lưu Đa chỉ báo (Multi-Indicator Confluence) chạy nguyên bản logic TA-Lib:
      1. Xu hướng: EMA(20) vs EMA(100) + HMA(14)
      2. Động lượng: MACD(12, 26, 9) + RSI(days)
      3. Khối lượng: volume[-1] > mean(volume[-20:])
      4. Biến động thấp: ATR(14)[-1] < mean(ATR(14)[-20:])
    """

    strategy_code = "ALPHA_CONFLUENCE_01"

    def __init__(self, rsi_period: int = 14, talib_module=None) -> None:
        self.days = rsi_period
        self._talib = talib_module

    def _get_talib(self):
        if self._talib is None:
            self._talib = _load_talib()
        return self._talib

    def evaluate(self, ohlcv: OhlcvArrays) -> int:
        # Cần tối thiểu 100 nến để EMA(100) và trung bình 20 nến ATR/Volume có giá trị hợp lệ
        if len(ohlcv) < 100:
            return 0

        talib = self._get_talib()
        close_np_float64 = ohlcv.closes
        high_np_float64 = ohlcv.highs
        low_np_float64 = ohlcv.lows
        volume_np_float64 = ohlcv.volumes

        # 1. Xác nhận xu hướng chính: EMA & HMA
        ema50 = talib.EMA(close_np_float64, timeperiod=20)
        ema200 = talib.EMA(close_np_float64, timeperiod=100)
        hma30 = talib.WMA(
            2 * talib.WMA(close_np_float64, timeperiod=14 // 2)
            - talib.WMA(close_np_float64, timeperiod=14),
            timeperiod=int(np.sqrt(14)),
        )

        # 2. Xác nhận động lượng giá: MACD & RSI
        macd, macd_signal, _ = talib.MACD(
            close_np_float64,
            fastperiod=12,
            slowperiod=26,
            signalperiod=9,
        )
        rsi = talib.RSI(close_np_float64, self.days)

        # 3. Kiểm tra khối lượng giao dịch
        avg_volume = np.mean(volume_np_float64[-20:])
        strong_volume = bool(volume_np_float64[-1] > avg_volume)

        # 4. Kiểm tra biến động thấp với ATR
        atr = talib.ATR(high_np_float64, low_np_float64, close_np_float64, timeperiod=14)
        avg_atr = np.mean(atr[-20:])

        # Chặn NaN ở giai đoạn đầu nếu chuỗi chưa đủ hội tụ
        if any(
            np.isnan(val)
            for val in (
                ema50[-1],
                ema200[-1],
                hma30[-1],
                macd[-1],
                macd_signal[-1],
                rsi[-1],
                atr[-1],
                avg_atr,
            )
        ):
            return 0

        low_volatility = bool(atr[-1] < avg_atr)

        bullish = (
            ema50[-1] > ema200[-1]
            and hma30[-1] > ema50[-1]
            and macd[-1] > macd_signal[-1]
            and rsi[-1] > 50
            and strong_volume
            and low_volatility
        )

        bearish = (
            ema50[-1] < ema200[-1]
            and hma30[-1] < ema50[-1]
            and macd[-1] < macd_signal[-1]
            and rsi[-1] < 50
            and strong_volume
            and low_volatility
        )

        if bullish:
            return 1
        if bearish:
            return -1
        return 0
