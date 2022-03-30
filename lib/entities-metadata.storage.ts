import { DataSource, DataSourceOptions } from 'typeorm';
import { EntityClassOrSchema } from './interfaces/entity-class-or-schema.type';

type DataSourceToken = DataSource | DataSourceOptions | string;

export class EntitiesMetadataStorage {
  private static readonly storage = new Map<string, EntityClassOrSchema[]>();

  static addEntitiesByDataSource(
    connection: DataSourceToken,
    entities: EntityClassOrSchema[],
  ): void {
    const connectionToken =
      typeof connection === 'string' ? connection : connection.name;
    if (!connectionToken) {
      return;
    }

    let collection = this.storage.get(connectionToken);
    if (!collection) {
      collection = [];
      this.storage.set(connectionToken, collection);
    }
    entities.forEach((entity) => {
      if (collection!.includes(entity)) {
        return;
      }
      collection!.push(entity);
    });
  }

  static getEntitiesByDataSource(
    connection: DataSourceToken,
  ): EntityClassOrSchema[] {
    const connectionToken =
      typeof connection === 'string' ? connection : connection.name;

    if (!connectionToken) {
      return [];
    }
    return this.storage.get(connectionToken) || [];
  }
}
