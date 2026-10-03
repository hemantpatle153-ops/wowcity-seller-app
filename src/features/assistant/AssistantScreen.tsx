import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ActivityIndicator, ScrollView, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/api";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, EmptyState, Header, IconButton, Row, Text } from "@/ui";
import { PressableScale } from "@/ui/Pressable";
import { ASSISTANT_NAME, friendlyError, historyFor, SUGGESTIONS, type ChatItem } from "./chat";
import { ReplyText } from "./ReplyText";
import { useVoiceInput } from "./useVoiceInput";

export function AssistantScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ["assistant-status"], queryFn: () => api.assistant.status(), staleTime: 60_000 });
  const [used, setUsed] = useState<number | null>(null);
  const questionsToday = used ?? status.data?.questionsToday ?? 0;
  const limit = status.data?.dailyLimit ?? 0;
  const enabled = status.data?.enabled !== false;
  const voice = useVoiceInput(setDraft);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    if (voice.listening) voice.stop();
    const next: ChatItem[] = [...items, { id: Date.now(), role: "user", content: question }];
    setItems(next);
    setDraft("");
    setBusy(true);
    try {
      const reply = await api.assistant.ask({ messages: historyFor(next) });
      setItems((list) => [...list, { id: Date.now(), role: "assistant", content: reply.answer, toolsUsed: reply.toolsUsed }]);
      if (reply.questionsToday !== null) setUsed(reply.questionsToday);
    } catch (error) {
      setItems((list) => [...list, { id: Date.now(), role: "assistant", content: friendlyError(error), failed: true }]);
    } finally {
      setBusy(false);
    }
  }

  const canSend = enabled && !busy && draft.trim().length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top }}>
      <Header
        title={`Ask ${ASSISTANT_NAME}`}
        subtitle="Your shop's AI assistant"
        back
        right={items.length ? <IconButton icon="refresh-outline" label="New chat" onPress={() => setItems([])} /> : undefined}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: theme.space[4], gap: theme.space[3], flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: !theme.reduceMotion })}
        >
          {!enabled ? (
            <EmptyState icon="sparkles-outline" title={`${ASSISTANT_NAME} isn't switched on yet`} body="Your shop's assistant will appear here once WowCity turns it on." />
          ) : items.length === 0 ? (
            <View style={{ gap: theme.space[3], paddingTop: theme.space[4] }}>
              <View style={{ alignItems: "center", gap: theme.space[2] }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
                  <Text variant="title" color="accentSoftText" weight="800">
                    S
                  </Text>
                </View>
                <Text variant="title" weight="700" align="center">
                  {`Hi, I'm ${ASSISTANT_NAME}`}
                </Text>
                <Text variant="small" color="textMuted" align="center">
                  {"Ask me about your sales, stock, GST, profit, dues and customers, in Hindi, English or Hinglish. I only see your own shop's data."}
                </Text>
              </View>
              <Text variant="caption" color="textMuted" uppercase style={{ marginTop: theme.space[2] }}>
                Try asking
              </Text>
              {SUGGESTIONS.map((suggestion) => (
                <PressableScale
                  key={suggestion}
                  onPress={() => ask(suggestion)}
                  accessibilityLabel={`Ask: ${suggestion}`}
                  scaleTo={0.98}
                  style={{ padding: theme.space[3], borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}
                >
                  <Text variant="body">{suggestion}</Text>
                </PressableScale>
              ))}
            </View>
          ) : (
            items.map((item) => <Bubble key={item.id} item={item} />)
          )}
          {busy ? (
            <Row gap={2} style={{ alignSelf: "flex-start" }}>
              <ActivityIndicator color={theme.colors.accent} />
              <Text variant="small" color="textMuted">
                {ASSISTANT_NAME} is checking your shop…
              </Text>
            </Row>
          ) : null}
        </ScrollView>
        <View style={{ borderTopWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, paddingHorizontal: theme.space[3], paddingTop: theme.space[2], paddingBottom: theme.space[2] + insets.bottom, gap: 4 }}>
          <Row gap={2} align="flex-end">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={enabled ? `Ask ${ASSISTANT_NAME} anything about your shop…` : "Not available yet"}
              placeholderTextColor={theme.colors.textFaint}
              editable={enabled}
              multiline
              maxLength={1000}
              accessibilityLabel={`Message ${ASSISTANT_NAME}`}
              style={{
                flex: 1,
                minHeight: 44,
                maxHeight: 120,
                borderRadius: theme.radius.control,
                borderWidth: 1,
                borderColor: theme.colors.borderStrong,
                backgroundColor: theme.colors.bg,
                color: theme.colors.text,
                paddingHorizontal: 12,
                paddingTop: 11,
                paddingBottom: 11,
                fontSize: theme.type("body").fontSize
              }}
            />
            {voice.available && enabled ? (
              <IconButton
                icon={voice.listening ? "stop" : "mic-outline"}
                label={voice.listening ? "Stop listening" : "Speak your question"}
                variant="soft"
                color={voice.listening ? "danger" : "accent"}
                onPress={() => (voice.listening ? voice.stop() : voice.start(draft))}
              />
            ) : null}
            <IconButton icon="send" label="Send" variant="filled" disabled={!canSend} onPress={() => ask(draft)} />
          </Row>
          {voice.available && enabled ? (
            <Row gap={2} justify="center">
              <Text variant="caption" color={voice.error ? "danger" : "textMuted"} numberOfLines={2} style={{ flexShrink: 1 }}>
                {voice.error ?? (voice.listening ? "Listening… speak now" : "Tap the mic to speak in")}
              </Text>
              {voice.error || voice.listening ? null : (
                <PressableScale
                  onPress={() => voice.setLang(voice.lang === "en-IN" ? "hi-IN" : "en-IN")}
                  accessibilityLabel={`Voice language ${voice.lang === "en-IN" ? "English" : "Hindi"}. Tap to switch.`}
                  style={{ paddingHorizontal: 10, paddingVertical: 2, borderRadius: theme.radius.pill, backgroundColor: theme.colors.accentSoft }}
                >
                  <Text variant="caption" color="accentSoftText" weight="700">
                    {voice.lang === "en-IN" ? "English ⇄" : "हिंदी ⇄"}
                  </Text>
                </PressableScale>
              )}
            </Row>
          ) : null}
          {limit ? (
            <Text variant="caption" color="textFaint" align="center">
              {questionsToday}/{limit} questions today · {ASSISTANT_NAME} can make mistakes, check important numbers in Reports
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({ item }: { item: ChatItem }) {
  const theme = useTheme();
  const mine = item.role === "user";
  return (
    <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "88%", gap: 6 }}>
      <View
        style={{
          paddingHorizontal: theme.space[3],
          paddingVertical: theme.space[2] + 2,
          borderRadius: 18,
          borderBottomRightRadius: mine ? 6 : 18,
          borderBottomLeftRadius: mine ? 18 : 6,
          backgroundColor: mine ? theme.colors.accent : item.failed ? theme.colors.dangerSoft : theme.colors.surface,
          borderWidth: mine ? 0 : 1,
          borderColor: theme.colors.border
        }}
      >
        {mine ? (
          <Text variant="body" color="accentText" selectable>
            {item.content}
          </Text>
        ) : (
          <ReplyText text={item.content} failed={item.failed} />
        )}
      </View>
      {item.toolsUsed?.length ? (
        <Row gap={1} wrap>
          {item.toolsUsed.map((tool) => (
            <Badge key={tool} label={tool} tone="info" icon="checkmark-circle-outline" />
          ))}
        </Row>
      ) : null}
    </View>
  );
}
