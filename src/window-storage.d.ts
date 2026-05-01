interface StorageResult {
  key: string;
  value: string;
  shared: boolean;
}

interface StorageDeleteResult {
  key: string;
  deleted: boolean;
  shared: boolean;
}

interface StorageListResult {
  keys: string[];
  prefix?: string;
  shared: boolean;
}

interface ArtifactStorage {
  get(key: string, shared?: boolean): Promise<StorageResult>;
  set(key: string, value: string, shared?: boolean): Promise<StorageResult | null>;
  delete(key: string, shared?: boolean): Promise<StorageDeleteResult | null>;
  list(prefix?: string, shared?: boolean): Promise<StorageListResult | null>;
}

interface Window {
  storage: ArtifactStorage;
}