import { Provider } from '@nestjs/common';
import { DataSource, DataSourceOptions, getMetadataArgsStorage } from 'typeorm';
import { getDataSourceToken, getRepositoryToken } from './common/typeorm.utils';
import { EntityClassOrSchema } from './interfaces/entity-class-or-schema.type';

export function createTypeOrmProviders(
  entities?: EntityClassOrSchema[],
  connection?: DataSource | DataSourceOptions | string,
): Provider[] {
  return (entities || []).map((entity) => ({
    provide: getRepositoryToken(entity, connection),
    useFactory: (connection: DataSource) => {
      return connection.options.type === 'mongodb'
        ? connection.getMongoRepository(entity)
        : connection.getRepository(entity);
    },
    inject: [getDataSourceToken(connection)],
    /**
     * Extra property to workaround dynamic modules serialisation issue
     * that occurs when "TypeOrm#forFeature()" method is called with the same number
     * of arguments and all entities share the same class names.
     */
    targetEntitySchema: getMetadataArgsStorage().tables.find(
      (item) => item.target === entity,
    ),
  }));
}
