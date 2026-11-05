import { FindOptionsWhere } from 'typeorm';

export type ConditionWhere<T> = FindOptionsWhere<T>[] | FindOptionsWhere<T>;
