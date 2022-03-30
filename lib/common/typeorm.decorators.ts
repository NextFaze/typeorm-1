import { Inject } from '@nestjs/common';
import { DataSource, DataSourceOptions } from 'typeorm';
import { EntityClassOrSchema } from '../interfaces/entity-class-or-schema.type';
import { DEFAULT_CONNECTION_NAME } from '../typeorm.constants';
import {
  getDataSourceToken,
  getEntityManagerToken,
  getRepositoryToken,
} from './typeorm.utils';

export const InjectRepository = (
  entity: EntityClassOrSchema,
  connection: string = DEFAULT_CONNECTION_NAME,
): ReturnType<typeof Inject> => Inject(getRepositoryToken(entity, connection));

export const InjectDataSource: (
  connection?: DataSource | DataSourceOptions | string,
) => ReturnType<typeof Inject> = (
  connection?: DataSource | DataSourceOptions | string,
) => Inject(getDataSourceToken(connection));

export const InjectEntityManager: (
  connection?: DataSource | DataSourceOptions | string,
) => ReturnType<typeof Inject> = (
  connection?: DataSource | DataSourceOptions | string,
) => Inject(getEntityManagerToken(connection));
