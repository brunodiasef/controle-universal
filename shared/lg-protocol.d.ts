export interface LgSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
}

export interface LgClientOptions {
  createSocket(url: string): LgSocketLike;
  loadKey(ip: string): string | null | undefined;
  saveKey(ip: string, key: string): void;
  urls(ip: string): string[];
}

export declare class LgRefused extends Error {}

export declare class LgConnectError extends Error {
  reasons: string[];
}

export interface LgClient {
  connect(ip: string): Promise<void>;
  press(ip: string, key: string): Promise<void>;
  launch(ip: string, appId: string): Promise<void>;
  text(ip: string, text: string): Promise<void>;
  input(ip: string, inputId: string): Promise<void>;
  deleteChars(ip: string, count: number): Promise<void>;
  enter(ip: string): Promise<void>;
  close(): void;
}

export declare function createLgClient(options: LgClientOptions): LgClient;
