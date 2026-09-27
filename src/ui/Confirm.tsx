import { useState } from "react";
import { create } from "zustand";
import { Button } from "./Button";
import { Input } from "./Input";
import { Sheet } from "./Sheet";
import { Text } from "./Text";

type ConfirmRequest = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Ask the person to type this text to enable the button (e.g. shop code for delete). */
  typeToConfirm?: string;
  resolve: (ok: boolean) => void;
};

const useConfirmStore = create<{ request: ConfirmRequest | null; set: (r: ConfirmRequest | null) => void }>((set) => ({ request: null, set: (request) => set({ request }) }));

/** `if (await confirm({ title: "Disable Ravi?", destructive: true })) …` */
export function confirm(options: Omit<ConfirmRequest, "resolve">): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.getState().set({ ...options, resolve }));
}

export function ConfirmHost() {
  const request = useConfirmStore((s) => s.request);
  const set = useConfirmStore((s) => s.set);
  const [typed, setTyped] = useState("");
  const finish = (ok: boolean) => {
    request?.resolve(ok);
    set(null);
    setTyped("");
  };
  const blocked = !!request?.typeToConfirm && typed.trim().toUpperCase() !== request.typeToConfirm.toUpperCase();
  return (
    <Sheet
      visible={!!request}
      onClose={() => finish(false)}
      title={request?.title}
      footer={
        <>
          <Button label={request?.confirmLabel ?? "Confirm"} variant={request?.destructive ? "danger" : "primary"} size="lg" onPress={() => finish(true)} disabled={blocked} fullWidth />
          <Button label={request?.cancelLabel ?? "Cancel"} variant="ghost" onPress={() => finish(false)} fullWidth />
        </>
      }
    >
      {request?.message ? (
        <Text variant="body" color="textMuted">
          {request.message}
        </Text>
      ) : null}
      {request?.typeToConfirm ? <Input label={`Type ${request.typeToConfirm} to confirm`} value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} /> : null}
    </Sheet>
  );
}
