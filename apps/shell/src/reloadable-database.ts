import {
  type CreateDatabaseInput,
  createDatabase,
  type DatabaseConnection,
} from "@appaloft/persistence-pg";

export interface ReloadableDatabaseConnection extends DatabaseConnection {
  reload(): Promise<void>;
}

type DatabaseHandle = DatabaseConnection["db"];

function createDbProxy(getCurrent: () => DatabaseHandle): DatabaseHandle {
  return new Proxy({} as DatabaseHandle, {
    get(_target, property) {
      const current = getCurrent();
      const value = Reflect.get(current as object, property);
      return typeof value === "function" ? value.bind(current) : value;
    },
    has(_target, property) {
      return property in getCurrent();
    },
    ownKeys() {
      return Reflect.ownKeys(getCurrent() as object);
    },
    getOwnPropertyDescriptor(_target, property) {
      return Reflect.getOwnPropertyDescriptor(getCurrent() as object, property);
    },
  });
}

export async function createReloadableDatabase(
  input: CreateDatabaseInput,
): Promise<ReloadableDatabaseConnection> {
  let current = await createDatabase(input);
  const proxy = createDbProxy(() => current.db);

  return {
    db: proxy,
    get descriptor() {
      return current.descriptor;
    },
    async close(): Promise<void> {
      await current.close();
    },
    async reload(): Promise<void> {
      if (current.descriptor.driver !== "pglite") {
        return;
      }

      await current.close();
      current = await createDatabase(input);
    },
  };
}
