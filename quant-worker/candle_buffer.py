from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np


@dataclass(frozen=True)
class OhlcvArrays:
    open_times: np.ndarray
    opens: np.ndarray
    highs: np.ndarray
    lows: np.ndarray
    closes: np.ndarray
    volumes: np.ndarray

    def __len__(self) -> int:
        return len(self.closes)


class CandleBuffer:
    """
    Ring buffer lưu tối đa `max_size` (mặc định 1000) nến ĐÃ CHỐT theo từng cặp (symbol, interval).
    - Tự loại trùng (dedupe) theo `openTime` và luôn giữ thứ tự tăng dần theo thời gian.
    - Trả về mảng contiguous np.float64 sẵn sàng truyền thẳng vào TA-Lib.
    """

    def __init__(self, max_size: int = 1000) -> None:
        self.max_size = max_size
        self._store: Dict[Tuple[str, str], List[dict]] = {}

    def _key(self, symbol: str, interval: str) -> Tuple[str, str]:
        return (symbol.upper(), interval)

    def load_initial(self, symbol: str, interval: str, candles: Iterable[dict]) -> int:
        by_open_time: Dict[int, dict] = {}
        for candle in candles:
            if not candle.get("isClosed", True):
                continue
            open_time = int(candle["openTime"])
            by_open_time[open_time] = candle

        ordered = [by_open_time[t] for t in sorted(by_open_time.keys())]
        if len(ordered) > self.max_size:
            ordered = ordered[-self.max_size :]

        self._store[self._key(symbol, interval)] = ordered
        return len(ordered)

    def append_closed(self, candle: dict) -> bool:
        """
        Thêm 1 cây nến chốt vào buffer.
        Trả về True nếu là nến mới (chưa xuất hiện openTime này), False nếu trùng hoặc chưa chốt.
        """
        if not candle.get("isClosed", False):
            return False

        symbol = str(candle["symbol"]).upper()
        interval = str(candle["interval"])
        open_time = int(candle["openTime"])
        key = self._key(symbol, interval)

        buf = self._store.setdefault(key, [])

        if buf:
            last_open = int(buf[-1]["openTime"])
            if open_time == last_open:
                buf[-1] = candle
                return False
            if open_time < last_open:
                # Chèn/cập nhật nến cũ hơn mà vẫn bảo toàn thứ tự tăng dần
                for idx, existing in enumerate(buf):
                    existing_open = int(existing["openTime"])
                    if existing_open == open_time:
                        buf[idx] = candle
                        return False
                    if existing_open > open_time:
                        buf.insert(idx, candle)
                        if len(buf) > self.max_size:
                            del buf[0]
                        return True
                return False

        buf.append(candle)
        if len(buf) > self.max_size:
            del buf[0]
        return True

    def to_numpy(self, symbol: str, interval: str) -> Optional[OhlcvArrays]:
        buf = self._store.get(self._key(symbol, interval))
        if not buf:
            return None

        return OhlcvArrays(
            open_times=np.array([int(c["openTime"]) for c in buf], dtype=np.int64),
            opens=np.array([float(c["open"]) for c in buf], dtype=np.float64),
            highs=np.array([float(c["high"]) for c in buf], dtype=np.float64),
            lows=np.array([float(c["low"]) for c in buf], dtype=np.float64),
            closes=np.array([float(c["close"]) for c in buf], dtype=np.float64),
            volumes=np.array([float(c["volume"]) for c in buf], dtype=np.float64),
        )

    def count(self, symbol: str, interval: str) -> int:
        return len(self._store.get(self._key(symbol, interval), []))
