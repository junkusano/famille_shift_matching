export function convertDriveUrlToDirectView(url: string | null | undefined): string | null {
  if (!url || url.trim() === "") return null; // ← null, undefined, 空文字を一律で null に
  const match = url.match(/\/file\/d\/([^/]+)\//);
  if (match && match[1]) {
    return `https://drive.google.com/uc?export=view&id=${match[1]}`;
  }
  return url;
}
