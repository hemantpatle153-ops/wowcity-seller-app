import qrcode from "qrcode-generator";

/** SVG markup for a QR code (UPI payment links on receipts). */
export function qrSvg(text: string, size = 160) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const cell = size / (count + 8);
  return qr.createSvgTag({ cellSize: cell, margin: cell * 4, scalable: true });
}

/** Module matrix, for drawing the QR natively (react-native-svg) or rasterising for ESC/POS. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}
