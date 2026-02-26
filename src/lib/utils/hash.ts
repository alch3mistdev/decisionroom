import crypto from "node:crypto";

export function hashStringToFloat(seed: string, salt = ""): number {
  const digest = crypto
    .createHash("sha256")
    .update(`${seed}:${salt}`)
    .digest("hex")
    .slice(0, 8);

  const value = Number.parseInt(digest, 16);
  return value / 0xffffffff;
}

export function sha1(input: string | Buffer): string {
  return crypto.createHash("sha1").update(input).digest("hex");
}
