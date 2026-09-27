import type { ReceiptData } from "../receipt";

export type PaperWidth = 58 | 80;

export type PrinterDevice = { id: string; name: string; address: string };

/** Anything that can print a receipt: the system print dialog today, ESC/POS over Bluetooth next. */
export interface ReceiptPrinter {
  readonly kind: "system" | "escpos-bluetooth";
  readonly label: string;
  isAvailable(): Promise<boolean>;
  print(receipt: ReceiptData, options: { paper: PaperWidth; format: "thermal" | "a4" }): Promise<void>;
  printTest(options: { paper: PaperWidth }): Promise<void>;
}

/** Raw byte transport to a thermal printer (implemented with a BLE library in a development build). */
export interface BluetoothTransport {
  isSupported(): boolean;
  scan(timeoutMs: number): Promise<PrinterDevice[]>;
  connect(address: string): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  disconnect(): Promise<void>;
}
