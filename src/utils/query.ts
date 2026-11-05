import { Between, EntityMetadata, FindOptionsSelectByString, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { ObjUtil } from './object';

export class QueryUtil {
  static getCols<T>(entityMetaData: EntityMetadata): any {
    let result: Record<keyof T, boolean> = {} as any;
    for (const key of Object.keys(entityMetaData.propertiesMap)) {
      result = { ...result, [key]: true };
    }
    return result;
  }

  static getInQuery = (val: any) => {
    if (typeof val === 'string' || typeof val === 'number') {
      return In([val]);
    }
    return In(val);
  };

  static getSort = (orderBy: string, sortBy: string) => {
    if (!orderBy || !sortBy) return {};
    return ObjUtil.createObjectFromPath(orderBy, sortBy);
  };

  static bSelect<T>(alias: string, fields: FindOptionsSelectByString<T>) {
    return fields.map((item) => `${alias}.${item as any}`);
  }

  static betweenDate = (from: Date, to: Date) => {
    if (from && to) {
      return Between(from, to); // include equals
    } else if (from || to) {
      return from ? MoreThanOrEqual(from) : LessThanOrEqual(to);
    }
  };
}
