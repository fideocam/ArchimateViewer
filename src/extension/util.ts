export function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

export function looksLikeArchimate(xml: string): boolean {
  if (/archimatetool\.com\/archimate/i.test(xml) && /<(?:[\w-]+:)?model[\s>]/i.test(xml)) {
    return true;
  }
  return /opengroup\.org\/xsd\/archimate/i.test(xml) && /<model[\s>]/i.test(xml);
}

/** Archi saves models that embed images as a zip archive instead of plain XML. */
export function looksLikeZipArchive(text: string): boolean {
  return text.startsWith("PK\u0003\u0004");
}
