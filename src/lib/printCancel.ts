/** iOS rejects print and share calls when the person closes the dialog; that's a cancel, not an error. */
export function isPrintCancel(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /cancel|did not complete|dismiss/i.test(message);
}
