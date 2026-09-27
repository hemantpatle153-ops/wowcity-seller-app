import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { api, errorMessage } from "@/api";
import type { StockItemDetail } from "@/api/types";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Button, confirm, IconButton, Row, SectionTitle, Text, toast } from "@/ui";
import { MAX_PHOTOS, pickPhotos, uploadPhoto } from "../purchase/upload";

/**
 * Add, remove and choose the cover photo of a product after it was bought in. Photos go straight to
 * storage, then are recorded; the cover is what buyers see first.
 */
export function PhotoManager({ productId, variantId, images }: { productId: string; variantId: string; images: StockItemDetail["images"] }) {
  const theme = useTheme();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const room = MAX_PHOTOS - images.length - uploading;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["stock", "item", variantId] }), qc.invalidateQueries({ queryKey: ["stock"] })]);

  async function add(source: "camera" | "library") {
    const { photos, denied } = await pickPhotos(source, room);
    if (denied) {
      toast.error(source === "camera" ? "Allow camera access in Settings to take photos." : "Allow photo access in Settings.");
      return;
    }
    for (const photo of photos) {
      setUploading((n) => n + 1);
      try {
        const { objectKey } = await uploadPhoto(productId, photo);
        if (!objectKey) throw new Error("The upload did not finish. Try again.");
        await api.products.images.add(productId, { objectKey, contentType: photo.contentType });
        haptic.success();
        toast.success("Photo added");
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setUploading((n) => n - 1);
        await refresh();
      }
    }
  }

  async function run(imageId: string, action: () => Promise<unknown>, done: string) {
    setBusyId(imageId);
    try {
      await action();
      haptic.tap();
      toast.success(done);
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  const tile = { width: 88, height: 110, borderRadius: theme.radius.control + 2, overflow: "hidden" as const, backgroundColor: theme.colors.surfaceSunken, borderWidth: 1, borderColor: theme.colors.border };

  return (
    <View style={{ gap: theme.space[2] }}>
      <Row style={{ justifyContent: "space-between" }}>
        <SectionTitle title="Photos" />
        <Text variant="small" color="textMuted">
          {images.length} of {MAX_PHOTOS}
        </Text>
      </Row>
      <Row gap={2} style={{ flexWrap: "wrap" }}>
        {images.map((image, index) => (
          <View key={image.id} style={{ gap: 4, width: 88 }}>
            <View style={[tile, image.isPrimary ? { borderColor: theme.colors.accent, borderWidth: 2 } : null]} accessibilityLabel={`Photo ${index + 1}${image.isPrimary ? ", cover" : ""}`}>
              {image.url ? <Image source={{ uri: image.url }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} /> : null}
              {image.isPrimary ? (
                <View style={{ position: "absolute", left: 4, top: 4 }}>
                  <Badge label="Cover" tone="accent" />
                </View>
              ) : null}
            </View>
            {busyId === image.id ? (
              <ActivityIndicator color={theme.colors.accent} />
            ) : (
              <Row gap={1} style={{ justifyContent: "center" }}>
                {!image.isPrimary ? <IconButton icon="star-outline" size={18} label={`Make photo ${index + 1} the cover`} onPress={() => run(image.id, () => api.products.images.makeCover(productId, image.id), "Cover photo changed")} /> : null}
                <IconButton
                  icon="trash-outline"
                  size={18}
                  color="danger"
                  label={`Remove photo ${index + 1}`}
                  onPress={async () => {
                    if (await confirm({ title: "Remove this photo?", message: "Buyers will no longer see it.", confirmLabel: "Remove", destructive: true })) {
                      await run(image.id, () => api.products.images.remove(productId, image.id), "Photo removed");
                    }
                  }}
                />
              </Row>
            )}
          </View>
        ))}
        {Array.from({ length: uploading }).map((_, i) => (
          <View key={`uploading-${i}`} style={[tile, { alignItems: "center", justifyContent: "center" }]} accessibilityLabel="Uploading photo">
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ))}
      </Row>
      {room > 0 ? (
        <Row gap={2}>
          <Button label="Take photo" icon="camera-outline" variant="secondary" onPress={() => add("camera")} style={{ flex: 1 }} />
          <Button label="From gallery" icon="images-outline" variant="secondary" onPress={() => add("library")} style={{ flex: 1 }} />
        </Row>
      ) : null}
      <Text variant="small" color="textMuted">
        Up to {MAX_PHOTOS} photos, 5 MB each. The cover photo is shown first to buyers.
      </Text>
    </View>
  );
}
