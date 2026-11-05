import * as path from 'path';
import * as winston from 'winston';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DailyRotateFile = require('winston-daily-rotate-file');

export const winstonLogger = winston.createLogger({
  // format của log được kết hợp thông qua format.combine
  format: winston.format.combine(
    winston.format.splat(),
    // Định dạng time cho log
    winston.format.timestamp({
      //   default  Date().toISOString
      //   or format: 'YYYY-MM-DD HH:mm:ss',
    }),
    // thêm màu sắc
    // winston.format.colorize({ all: false }),
    // thiết lập định dạng của log
    winston.format.printf((log) => {
      // nếu log là error hiển thị stack trace còn không hiển thị message của log
      if (log.stack) return `[${log.timestamp}] [${log.level}] [${log.message}]\n ${log.stack}`;
      return `[${log.timestamp}] [${log.level}] ${log.message}`;
    }),
  ),
  transports: [
    new winston.transports.Console(),
    new DailyRotateFile({
      level: 'error',
      filename: path.join(process.cwd() + '/logs', '..', 'logs', `%DATE%.log`),
      datePattern: 'YYYY_MM_DD-HH',
      zippedArchive: true,
      maxFiles: '5d',
    }),
    new DailyRotateFile({
      level: 'info',
      filename: path.join(process.cwd() + '/logs', '..', 'logs', `%DATE%.log`),
      datePattern: 'YYYY_MM_DD-HH',
      zippedArchive: true,
      maxFiles: '5d',
    }),
  ],
});
