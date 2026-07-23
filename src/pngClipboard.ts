export type ClipboardImageWriter = (items: ClipboardItem[]) => Promise<void>;
export type ClipboardItemFactory = (
  data: Record<string, string | Blob | PromiseLike<string | Blob>>,
) => ClipboardItem;

export function writePngToClipboard(
  write: ClipboardImageWriter,
  createItem: ClipboardItemFactory,
  renderPng: () => Promise<Blob>,
): Promise<void> {
  const pngBlob = renderPng();
  try {
    return write([createItem({ 'image/png': pngBlob })]);
  } catch (error: unknown) {
    void pngBlob.catch(() => undefined);
    throw error;
  }
}
