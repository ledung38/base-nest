import * as dayjs from 'dayjs';
import { DateFormatTemplate } from 'src/types/date.type';

export class DateUtil {
  static format = (val: any, format: DateFormatTemplate) => dayjs(val).format(format);

  static getMonthAbbreviation = (month: number) => {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return months[month];
  };

  static formatUSDate = (date: Date) =>
    `${this.getMonthAbbreviation(date.getMonth())}/${date.getDate()}/${date.getFullYear()}`;

  static calculateYearDuration = (startDate: Date, endDate: Date) => {
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();
    let yearDifference = endYear - startYear;

    if (endDate < new Date(endYear, startDate.getMonth(), startDate.getDate())) {
      yearDifference--;
    }

    return yearDifference;
  };
}
