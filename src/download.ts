export function saveBytes(name: string, bytes: Uint8Array, mime: string) {
  const data = new Uint8Array(bytes);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
