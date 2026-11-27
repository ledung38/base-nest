from abc import ABC, abstractmethod

from candle_buffer import OhlcvArrays


class AlphaStrategy(ABC):
    """
    Interface chung cho mọi Alpha Strategy.
    Trả về:
      1  -> MUA (BUY)
     -1  -> BÁN (SELL)
      0  -> KHÔNG GIAO DỊCH (HOLD)
    """

    strategy_code: str

    @abstractmethod
    def evaluate(self, ohlcv: OhlcvArrays) -> int:
        raise NotImplementedError
