declare module 'node-key-sender' {
  export function sendKey(key: string): Promise<void>;
  export function sendKeys(keys: string[]): Promise<void>;
  export function sendCombination(keys: string[]): Promise<void>;
}
