import { encodeReceipt, EscPos } from "./escpos";
import type { BluetoothTransport, PrinterDevice, ReceiptPrinter } from "./types";

/**
 * Placeholder transport. Bluetooth thermal printing needs a native BLE module (e.g.
 * react-native-ble-plx, or an ESC/POS SPP module for classic Bluetooth printers) in a
 * development/production build — it cannot run in Expo Go or on web. Swap this for the real
 * transport once a printer is available for hardware testing; everything above it (encoding,
 * settings, test print) is ready.
 */
export const unavailableTransport: BluetoothTransport = {
  isSupported: () => false,
  scan: async (): Promise<PrinterDevice[]> => [],
  connect: async () => {
    throw new Error("Bluetooth printing needs the WowCity development build. Use Print (PDF) for now.");
  },
  write: async () => {
    throw new Error("No Bluetooth printer connected.");
  },
  disconnect: async () => undefined
};

let transport: BluetoothTransport = unavailableTransport;

/** Register the native transport (called from the development build's printer module). */
export function setBluetoothTransport(next: BluetoothTransport) {
  transport = next;
}

export function getBluetoothTransport() {
  return transport;
}

/** Chunked writes: BLE characteristics accept small packets. */
async function writeChunked(bytes: Uint8Array, chunk = 180) {
  for (let i = 0; i < bytes.length; i += chunk) await transport.write(bytes.slice(i, i + chunk));
}

export function bluetoothPrinter(address: string, name: string): ReceiptPrinter {
  return {
    kind: "escpos-bluetooth",
    label: name,
    isAvailable: async () => transport.isSupported(),
    print: async (receipt, { paper }) => {
      await transport.connect(address);
      try {
        await writeChunked(encodeReceipt(receipt, paper));
      } finally {
        await transport.disconnect();
      }
    },
    printTest: async ({ paper }) => {
      const p = new EscPos(paper === 58 ? 32 : 48);
      p.align("center").bold(true).line("WowCity Seller").bold(false).line(`Test print · ${paper} mm`).rule().line("0123456789".repeat(5).slice(0, p.columns)).feed(3).cut();
      await transport.connect(address);
      try {
        await writeChunked(p.build());
      } finally {
        await transport.disconnect();
      }
    }
  };
}
