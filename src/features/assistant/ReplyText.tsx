import { View } from "react-native";
import { Text } from "@/ui";
import { visibleBlocks } from "./chat";

/** An assistant reply as paragraphs and bullet rows, with bold where the reply asks for it. */
export function ReplyText({ text, failed }: { text: string; failed?: boolean }) {
  const color = failed ? "danger" : "text";
  return (
    <View style={{ gap: 6 }}>
      {visibleBlocks(text).map((block, i) => {
        const line = (
          <Text variant="body" color={color} selectable style={block.kind === "bullet" ? { flexShrink: 1 } : undefined}>
            {block.spans.map((s, j) => (
              <Text key={j} variant="body" color={color} weight={s.bold ? "700" : undefined}>
                {s.text}
              </Text>
            ))}
          </Text>
        );
        return block.kind === "bullet" ? (
          <View key={i} style={{ flexDirection: "row", gap: 8, marginLeft: block.indent * 16 }}>
            <Text variant="body" color={failed ? "danger" : "accent"} style={{ width: 10 }}>
              •
            </Text>
            {line}
          </View>
        ) : (
          <View key={i}>{line}</View>
        );
      })}
    </View>
  );
}
