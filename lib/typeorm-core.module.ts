import {
  DynamicModule,
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
  Provider,
  Type,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { defer, lastValueFrom, of, tap } from 'rxjs';
import { DataSource, DataSourceOptions } from 'typeorm';
import {
  generateString,
  getDataSourceName,
  getDataSourceToken,
  getEntityManagerToken,
  handleRetry,
} from './common/typeorm.utils';
import { EntitiesMetadataStorage } from './entities-metadata.storage';
import { EntityClassOrSchema } from './interfaces/entity-class-or-schema.type';
import {
  TypeOrmDataSourceFactory,
  TypeOrmModuleAsyncOptions,
  TypeOrmModuleOptions,
  TypeOrmOptionsFactory,
} from './interfaces/typeorm-options.interface';
import { TYPEORM_MODULE_ID, TYPEORM_MODULE_OPTIONS } from './typeorm.constants';

@Global()
@Module({})
export class TypeOrmCoreModule implements OnApplicationShutdown {
  private readonly logger = new Logger('TypeOrmModule');

  private static connectionManager = new Map<string, DataSource>();

  constructor(
    @Inject(TYPEORM_MODULE_OPTIONS)
    private readonly options: TypeOrmModuleOptions,
    private readonly moduleRef: ModuleRef,
  ) {}

  static forRoot(options: TypeOrmModuleOptions = {}): DynamicModule {
    const typeOrmModuleOptions = {
      provide: TYPEORM_MODULE_OPTIONS,
      useValue: options,
    };
    const connectionProvider = {
      provide: getDataSourceToken(options as DataSourceOptions) as string,
      useFactory: async () => await this.createDataSourceFactory(options),
    };
    const entityManagerProvider = this.createEntityManagerProvider(
      options as DataSourceOptions,
    );
    return {
      module: TypeOrmCoreModule,
      providers: [
        entityManagerProvider,
        connectionProvider,
        typeOrmModuleOptions,
      ],
      exports: [entityManagerProvider, connectionProvider],
    };
  }

  static forRootAsync(options: TypeOrmModuleAsyncOptions): DynamicModule {
    const connectionProvider = {
      provide: getDataSourceToken(options as DataSourceOptions) as string,
      useFactory: async (typeOrmOptions: TypeOrmModuleOptions) => {
        if (options.name) {
          return await this.createDataSourceFactory(
            {
              ...typeOrmOptions,
              name: options.name,
            },
            options.connectionFactory,
          );
        }
        return await this.createDataSourceFactory(
          typeOrmOptions,
          options.connectionFactory,
        );
      },
      inject: [TYPEORM_MODULE_OPTIONS],
    };
    const entityManagerProvider = {
      provide: getEntityManagerToken(options as DataSourceOptions) as string,
      useFactory: (connection: DataSource) => connection.manager,
      inject: [getDataSourceToken(options as DataSourceOptions)],
    };

    const asyncProviders = this.createAsyncProviders(options);
    return {
      module: TypeOrmCoreModule,
      imports: options.imports,
      providers: [
        ...asyncProviders,
        entityManagerProvider,
        connectionProvider,
        {
          provide: TYPEORM_MODULE_ID,
          useValue: generateString(),
        },
      ],
      exports: [entityManagerProvider, connectionProvider],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.options.keepDataSourceAlive) {
      return;
    }
    const connection = this.moduleRef.get<DataSource>(
      getDataSourceToken(this.options as DataSourceOptions) as Type<DataSource>,
    );
    try {
      connection && (await connection.destroy());
    } catch (e) {
      this.logger.error(e?.message);
    }
  }

  private static createAsyncProviders(
    options: TypeOrmModuleAsyncOptions,
  ): Provider[] {
    if (options.useExisting || options.useFactory) {
      return [this.createAsyncOptionsProvider(options)];
    }
    const useClass = options.useClass as Type<TypeOrmOptionsFactory>;
    return [
      this.createAsyncOptionsProvider(options),
      {
        provide: useClass,
        useClass,
      },
    ];
  }

  private static createAsyncOptionsProvider(
    options: TypeOrmModuleAsyncOptions,
  ): Provider {
    if (options.useFactory) {
      return {
        provide: TYPEORM_MODULE_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject || [],
      };
    }
    // `as Type<TypeOrmOptionsFactory>` is a workaround for microsoft/TypeScript#31603
    const inject = [
      (options.useClass || options.useExisting) as Type<TypeOrmOptionsFactory>,
    ];
    return {
      provide: TYPEORM_MODULE_OPTIONS,
      useFactory: async (optionsFactory: TypeOrmOptionsFactory) =>
        await optionsFactory.createTypeOrmOptions(options.name),
      inject,
    };
  }

  private static createEntityManagerProvider(
    options: DataSourceOptions,
  ): Provider {
    return {
      provide: getEntityManagerToken(options) as string,
      useFactory: (connection: DataSource) => connection.manager,
      inject: [getDataSourceToken(options)],
    };
  }

  private static async createDataSourceFactory(
    options: TypeOrmModuleOptions,
    connectionFactory?: TypeOrmDataSourceFactory,
  ): Promise<DataSource> {
    const connectionToken = getDataSourceName(options as DataSourceOptions);
    const createDataSource = (dataSourceOptions: DataSourceOptions) =>
      new DataSource(dataSourceOptions).initialize();
    const createTypeORMDataSource = connectionFactory ?? createDataSource;
    return await lastValueFrom(
      defer(() => {
        try {
          if (options.keepDataSourceAlive) {
            const connectionName = getDataSourceName(
              options as DataSourceOptions,
            );
            if (this.connectionManager.has(connectionName)) {
              const connection = this.connectionManager.get(connectionName);
              if (connection?.isInitialized) {
                return of(connection);
              }
            }
          }
        } catch {}

        if (!options.type) {
          return createTypeORMDataSource(options as DataSourceOptions);
        }
        if (!options.autoLoadEntities) {
          return createTypeORMDataSource(options as DataSourceOptions);
        }

        let entities = options.entities;
        if (entities) {
          entities = (entities as EntityClassOrSchema[]).concat(
            EntitiesMetadataStorage.getEntitiesByDataSource(connectionToken),
          );
        } else {
          entities =
            EntitiesMetadataStorage.getEntitiesByDataSource(connectionToken);
        }
        return createTypeORMDataSource({
          ...options,
          entities,
        } as DataSourceOptions);
      }).pipe(
        tap((connection) => {
          if (options.keepDataSourceAlive) {
            const connectionName = getDataSourceName(
              options as DataSourceOptions,
            );
            this.connectionManager.set(connectionName, connection);
          }
        }),
        handleRetry(
          options.retryAttempts,
          options.retryDelay,
          connectionToken,
          options.verboseRetryLog,
          options.toRetry,
        ),
      ),
    );
  }
}
