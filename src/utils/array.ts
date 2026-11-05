export class ArrUtil {
  static getOldListDifferent = (keys: string[], body: any, obj: any): Array<any> => {
    const result = [];
    keys.forEach((key) => {
      if (obj[key] && body[key] != obj[key]) {
        result.push(obj[key]);
      }
    });
    return result;
  };
}
