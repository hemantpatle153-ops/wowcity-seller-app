import * as FileSystem from "expo-file-system/legacy";
import { uploadPhoto } from "@/features/purchase/upload";

jest.mock("expo-file-system/legacy", () => ({
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  getInfoAsync: jest.fn(async () => ({ exists: true, isDirectory: false, size: 1234 })),
  uploadAsync: jest.fn(async () => ({ status: 200, body: "", headers: {} }))
}));

const mockImageUpload = jest.fn(async () => ({ uploadUrl: "https://acct.r2.cloudflarestorage.com/b/key?X-Amz-Signature=x", bucket: "b", objectKey: "key" }));
jest.mock("@/api", () => ({
  MOCK_MODE: false,
  api: { purchases: { imageUpload: (...args: unknown[]) => mockImageUpload(...(args as [])) } },
  errorMessage: (e: unknown) => String(e)
}));

jest.mock("@/features/purchase/draft", () => ({ usePurchaseDraft: { getState: () => ({ updatePhoto: jest.fn() }) } }));
jest.mock("expo-image-picker", () => ({}));

const photo = { id: "p1", uri: "file:///cache/photo.jpg", fileName: "photo.jpg", contentType: "image/jpeg" as const, sizeBytes: 999, status: "uploading" as const };

describe("uploadPhoto on a phone", () => {
  beforeEach(() => jest.clearAllMocks());

  it("asks for a link signed for the file's real size and sends the file from disk with the same Content-Type", async () => {
    const refs = await uploadPhoto("prod-1", photo);
    expect(mockImageUpload).toHaveBeenCalledWith({ productId: "prod-1", fileName: "photo.jpg", contentType: "image/jpeg", sizeBytes: 1234 });
    expect(FileSystem.uploadAsync).toHaveBeenCalledWith(expect.stringContaining("r2.cloudflarestorage.com"), "file:///cache/photo.jpg", {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": "image/jpeg" }
    });
    expect(refs).toEqual({ bucket: "b", objectKey: "key", sizeBytes: 1234 });
  });

  it("reports the storage status when the upload is rejected", async () => {
    (FileSystem.uploadAsync as jest.Mock).mockResolvedValueOnce({ status: 403, body: "", headers: {} });
    await expect(uploadPhoto("prod-1", photo)).rejects.toThrow("The photo upload failed (403)");
  });

  it("refuses photos over 5 MB before asking for a link", async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: true, isDirectory: false, size: 6 * 1024 * 1024 });
    await expect(uploadPhoto("prod-1", photo)).rejects.toThrow("bigger than 5 MB");
    expect(mockImageUpload).not.toHaveBeenCalled();
  });
});
