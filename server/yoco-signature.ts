export async function verifyYocoSignature(
  rawBody: string,
  secret: string,
  headers: Headers,
): Promise<boolean> {
  const id = headers.get("webhook-id") ?? headers.get("svix-id");
  const timestamp =
    headers.get("webhook-timestamp") ?? headers.get("svix-timestamp");
  const signatures =
    headers.get("webhook-signature") ?? headers.get("svix-signature");
  const seconds = Number(timestamp);
  if (
    !id ||
    !timestamp ||
    !signatures ||
    !Number.isFinite(seconds) ||
    Math.abs(Date.now() / 1000 - seconds) > 180
  )
    return false;
  try {
    const bytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (char) =>
      char.charCodeAt(0),
    );
    const key = await crypto.subtle.importKey(
      "raw",
      bytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`),
    );
    const expected =
      "v1," + btoa(String.fromCharCode(...new Uint8Array(signature)));
    return signatures.split(/\s+/).some((candidate) => {
      if (candidate.length !== expected.length) return false;
      let difference = 0;
      for (let i = 0; i < expected.length; i++)
        difference |= expected.charCodeAt(i) ^ candidate.charCodeAt(i);
      return difference === 0;
    });
  } catch {
    return false;
  }
}
