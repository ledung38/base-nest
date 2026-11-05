export class StringUtil {
  static capitalizeFirstLetter = (str: string) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  static generateRandomString = (length = 10) => {
    return Math.random().toString(36).substring(2, 2 + length);
  };
}
