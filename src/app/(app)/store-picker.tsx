import { router } from "expo-router";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSession } from "@/auth/session";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Card, EmptyState, Header, Icon, IconCircle, Row, Screen, Text } from "@/ui";

export default function StorePicker() {
  const theme = useTheme();
  const me = useSession((s) => s.me);
  const storeId = useSession((s) => s.storeId);
  const selectStore = useSession((s) => s.selectStore);
  const signOut = useSession((s) => s.signOut);
  const stores = me?.stores ?? [];
  return (
    <Screen header={<Header title="Choose your store" subtitle={me?.shopName} back={!!storeId} large={!storeId} />}>
      {stores.length === 0 ? (
        <EmptyState
          icon="storefront-outline"
          title="No store assigned"
          body={me?.actor === "seller" ? "Add a store from Settings on the web, then sign in again." : "Ask the shop owner to give you access to a store."}
          action="Sign out"
          onAction={() => signOut()}
        />
      ) : (
        <View style={{ gap: theme.space[3] }}>
          <Text variant="body" color="textMuted">
            Bills, stock and the offline catalogue follow this store. You can switch any time from the header.
          </Text>
          {stores.map((store, i) => {
            const selected = store.id === storeId;
            return (
              <Animated.View
                key={store.id}
                entering={
                  theme.reduceMotion
                    ? undefined
                    : FadeInDown.delay(i * 60)
                        .springify()
                        .damping(18)
                }
              >
                <Card
                  onPress={() => {
                    selectStore(store.id);
                    if (router.canGoBack()) router.back();
                    else router.replace("/");
                  }}
                  accessibilityLabel={`${store.name}, ${store.city}${selected ? ", current" : ""}`}
                  style={selected ? { borderColor: theme.colors.accent, borderWidth: 2 } : undefined}
                >
                  <Row gap={3}>
                    <IconCircle icon="storefront" tone={selected ? "accent" : "neutral"} size={48} />
                    <View style={{ flex: 1 }}>
                      <Text variant="title">{store.name}</Text>
                      <Text variant="small" color="textMuted">
                        {[store.city, store.state].filter(Boolean).join(", ")}
                      </Text>
                    </View>
                    {selected ? <Icon name="checkmark-circle" color="accent" size={26} /> : <Icon name="chevron-forward" color="textFaint" />}
                  </Row>
                </Card>
              </Animated.View>
            );
          })}
          {!storeId ? <Button label="Sign out" variant="ghost" onPress={() => signOut()} /> : null}
        </View>
      )}
    </Screen>
  );
}
