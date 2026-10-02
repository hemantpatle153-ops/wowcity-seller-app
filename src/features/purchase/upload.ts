import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { api, errorMessage, MOCK_MODE } from "@/api";
import { uuid } from "@/lib/id";
import { usePurchaseDraft, type PhotoDraft, type PhotoType } from "./draft";

export const MAX_PHOTOS = 4;
const MAX_BYTES = 5 * 1024 * 1024;

function photoType(mime: string | null | undefined, name: string | null | undefined): PhotoType {
  const value = (mime ?? "").toLowerCase();
  if (value === "image/png" || /\.png$/i.test(name ?? "")) return "image/png";
  if (value === "image/webp" || /\.webp$/i.test(name ?? "")) return "image/webp";
  return "image/jpeg"; // the picker re-encodes to JPEG when quality < 1
}

/** Pick photos from the camera or the library; returns drafts ready to upload (at most `room`). */
export async function pickPhotos(source: "camera" | "library", room: number): Promise<{ photos: PhotoDraft[]; denied?: boolean }> {
  if (room <= 0) return { photos: [] };
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7, exif: false };
  let result: ImagePicker.ImagePickerResult;
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { photos: [], denied: true };
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: room > 1, selectionLimit: room, orderedSelection: true });
  }
  if (result.canceled) return { photos: [] };
  const photos = result.assets.slice(0, room).map((asset): PhotoDraft => {
    const contentType = photoType(asset.mimeType, asset.fileName);
    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    return {
      id: uuid(),
      uri: asset.uri,
      fileName: (asset.fileName || `photo-${Date.now()}.${ext}`).slice(-200),
      contentType,
      sizeBytes: asset.fileSize ?? 0,
      status: "uploading"
    };
  });
  return { photos };
}

const uploadError = (status: number) => new Error(`The photo upload failed (${status}). Tap to try again.`);

/**
 * The upload URL is signed for one exact Content-Type and byte count, so the bytes must go up untouched.
 * On a phone the file is sent by the native uploader straight from disk: React Native's fetch with a Blob
 * body can drop the length or change the Content-Type on Android, and storage then rejects the signature (403).
 * In mock mode the fake backend answers the upload host.
 */
async function putPhoto(url: string, uri: string, contentType: string) {
  if (MOCK_MODE && url.startsWith("https://mock.wowcity.local")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { mockFetch } = require("@/mock/server") as { mockFetch: typeof fetch };
    const response = await mockFetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: await (await fetch(uri)).blob() });
    if (!response.ok) throw uploadError(response.status);
    return;
  }
  if (Platform.OS === "web") {
    const response = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: await (await fetch(uri)).blob() });
    if (!response.ok) throw uploadError(response.status);
    return;
  }
  const result = await FileSystem.uploadAsync(url, uri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": contentType }
  });
  if (result.status < 200 || result.status >= 300) throw uploadError(result.status);
}

/** Size of the file exactly as it will be uploaded. */
async function photoSize(photo: PhotoDraft): Promise<number> {
  if (Platform.OS !== "web") {
    const info = await FileSystem.getInfoAsync(photo.uri);
    if (info.exists && !info.isDirectory && info.size) return info.size;
  }
  const blob = await (await fetch(photo.uri)).blob();
  return blob.size || photo.sizeBytes;
}

/**
 * Upload one photo: POST /api/r2/product-image-upload for a presigned URL, then PUT the bytes with the
 * same Content-Type and exact size. Returns the refs to include in the purchase row.
 */
export async function uploadPhoto(productId: string, photo: PhotoDraft): Promise<Pick<PhotoDraft, "bucket" | "objectKey" | "sizeBytes">> {
  const sizeBytes = await photoSize(photo);
  if (!sizeBytes) throw new Error("Couldn't read this photo. Try another one.");
  if (sizeBytes > MAX_BYTES) throw new Error("This photo is bigger than 5 MB. Take it again or pick a smaller one.");
  const presigned = await api.purchases.imageUpload({ productId, fileName: photo.fileName, contentType: photo.contentType, sizeBytes });
  await putPhoto(presigned.uploadUrl, photo.uri, photo.contentType);
  return { bucket: presigned.bucket, objectKey: presigned.objectKey, sizeBytes };
}

/** Upload (or retry) a photo on a card and keep its status in the draft. */
export async function runPhotoUpload(itemKey: string, photo: PhotoDraft) {
  const update = usePurchaseDraft.getState().updatePhoto;
  update(itemKey, photo.id, { status: "uploading", error: undefined });
  try {
    const refs = await uploadPhoto(itemKey, photo);
    update(itemKey, photo.id, { ...refs, status: "done", error: undefined });
  } catch (error) {
    update(itemKey, photo.id, { status: "failed", error: errorMessage(error) });
  }
}
