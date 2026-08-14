/**
 * foliate-js exposes an EPUB's dc:title either as a plain string or as a
 * language map ({ lang: title }). Resolves either form into a display string.
 */
export function resolveEpubTitle(
  metadataTitle: unknown,
): string | null {
  if (typeof metadataTitle === "string") {
    const trimmed = metadataTitle.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (metadataTitle && typeof metadataTitle === "object") {
    for (const value of Object.values(metadataTitle)) {
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }
  return null;
}