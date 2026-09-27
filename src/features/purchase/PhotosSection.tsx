import { Image } from "expo-image";
import { ActivityIndicator, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition, ZoomIn } from "react-native-reanimated";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { media } from "@/theme/tokens";
import { Badge, Button, Icon, PressableScale, Row, Text, toast } from "@/ui";
import { usePurchaseDraft, type ItemDraft, type PhotoDraft } from "./draft";
import { MAX_PHOTOS, pickPhotos, runPhotoUpload } from "./upload";

function Thumb({ item, photo, index }: { item: ItemDraft; photo: PhotoDraft; index: number }) {
  const theme = useTheme();
  const draft = usePurchaseDraft;
  const size = 84;
  const primary = index === 0;
  const makePrimary = () => {
    const photos = [photo, ...item.photos.filter((p) => p.id !== photo.id)];
    draft.getState().updateItem(item.key, { photos });
    haptic.select();
  };
  const remove = () => {
    draft.getState().updatePhoto(item.key, photo.id, null);
    haptic.tap();
  };
  return (
    <Animated.View
      entering={theme.reduceMotion ? undefined : ZoomIn.springify().damping(16)}
      exiting={theme.reduceMotion ? undefined : FadeOut.duration(150)}
      layout={theme.reduceMotion ? undefined : LinearTransition.springify().damping(18)}
      style={{ width: size, gap: 4 }}
    >
      <PressableScale
        onPress={photo.status === "failed" ? () => runPhotoUpload(item.key, photo) : primary ? undefined : makePrimary}
        accessibilityLabel={
          photo.status === "failed" ? `Photo ${index + 1} failed to upload. Tap to try again` : primary ? `Photo ${index + 1}, cover photo` : `Photo ${index + 1}. Tap to make it the cover photo`
        }
        style={{ width: size, height: size, borderRadius: theme.radius.control, overflow: "hidden", backgroundColor: theme.colors.surfaceSunken, borderWidth: primary ? 2 : 1, borderColor: primary ? theme.colors.accent : theme.colors.border }}
      >
        <Image source={{ uri: photo.uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={theme.reduceMotion ? 0 : 150} />
        {photo.status !== "done" ? (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: media.scrim, alignItems: "center", justifyContent: "center", gap: 2 }}>
            {photo.status === "uploading" ? (
              <ActivityIndicator color={media.text} />
            ) : (
              <>
                <Icon name="refresh" tint={media.text} size={22} />
                <Text variant="caption" weight="700" style={{ color: media.text }}>
                  Retry
                </Text>
              </>
            )}
          </View>
        ) : null}
        {primary && photo.status === "done" ? (
          <View style={{ position: "absolute", left: 4, bottom: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: media.scrim }}>
            <Text variant="caption" weight="700" style={{ color: media.text }}>
              Cover
            </Text>
          </View>
        ) : null}
      </PressableScale>
      <PressableScale
        onPress={remove}
        accessibilityLabel={`Remove photo ${index + 1}`}
        hitSlop={8}
        style={{ position: "absolute", top: -8, right: -8, width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name="close" size={16} color="text" />
      </PressableScale>
      {photo.status === "failed" && photo.error ? (
        <Text variant="caption" color="danger" numberOfLines={2}>
          {photo.error}
        </Text>
      ) : null}
    </Animated.View>
  );
}

/** Up to 4 product photos: take or pick, uploads right away, tap to make cover, retry failed ones. */
export function PhotosSection({ item }: { item: ItemDraft }) {
  const theme = useTheme();
  const count = item.photos.length;
  const room = MAX_PHOTOS - count;
  const uploading = item.photos.filter((p) => p.status === "uploading").length;
  const failed = item.photos.filter((p) => p.status === "failed").length;

  const add = async (source: "camera" | "library") => {
    if (room <= 0) {
      haptic.warning();
      toast.info("A product can have 4 photos. Remove one to add another.");
      return;
    }
    try {
      const { photos, denied } = await pickPhotos(source, room);
      if (denied) {
        toast.warning("Allow camera access in Settings to take product photos.");
        return;
      }
      if (!photos.length) return;
      const current = usePurchaseDraft.getState().items.find((i) => i.key === item.key);
      usePurchaseDraft.getState().updateItem(item.key, { photos: [...(current?.photos ?? []), ...photos].slice(0, MAX_PHOTOS) });
      haptic.success();
      photos.forEach((p) => void runPhotoUpload(item.key, p));
    } catch {
      toast.error("Couldn't open the photos. Try again.");
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <Row justify="space-between">
        <Text variant="bodyStrong">Photos</Text>
        <Row gap={2}>
          {uploading ? <Badge label={`Uploading ${uploading}`} tone="info" icon="cloud-upload-outline" /> : null}
          {failed ? <Badge label={`${failed} failed`} tone="danger" /> : null}
          <Text variant="small" color="textMuted" tabular>
            {count}/{MAX_PHOTOS}
          </Text>
        </Row>
      </Row>
      {count ? (
        <Animated.View layout={theme.reduceMotion ? undefined : LinearTransition} style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, paddingTop: 8, paddingRight: 8 }}>
          {item.photos.map((photo, index) => (
            <Thumb key={photo.id} item={item} photo={photo} index={index} />
          ))}
        </Animated.View>
      ) : (
        <Animated.View entering={theme.reduceMotion ? undefined : FadeIn}>
          <Text variant="small" color="textMuted">
            Add up to 4 photos. The first one is the cover buyers see.
          </Text>
        </Animated.View>
      )}
      <Row gap={2}>
        <Button label="Camera" icon="camera-outline" variant="soft" size="sm" onPress={() => add("camera")} style={{ flex: 1 }} accessibilityHint="Take a product photo" />
        <Button label="Gallery" icon="images-outline" variant="soft" size="sm" onPress={() => add("library")} style={{ flex: 1 }} accessibilityHint="Pick product photos" />
      </Row>
      {room <= 0 ? (
        <Text variant="caption" color="textMuted">
          4 of 4 photos added. Remove one to add another.
        </Text>
      ) : null}
    </View>
  );
}
