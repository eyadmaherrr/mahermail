"use client";

import { useEffect, useState } from "react";
import { avatarColor, parseAddress } from "@/lib/client";

// one hash per address, and remember addresses with no photo so we don't ask twice
const hashes = new Map<string, Promise<string>>();
const noPhoto = new Set<string>();

function gravatarHash(email: string) {
  const key = email.trim().toLowerCase(); // Gravatar requires both trim and lowercase
  let p = hashes.get(key);
  if (!p) {
    p = crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)).then((buf) =>
      Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join(""),
    );
    hashes.set(key, p);
  }
  return p;
}

/** Gravatar photo when the address has one; brand-coloured initials otherwise (and while it loads). */
export default function Avatar({ seed, large }: { seed: string; large?: boolean }) {
  const { name, email } = parseAddress(seed.replace(/^To:\s*/, "").split(",")[0] || "?");
  const address = email.toLowerCase();
  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    setSrc(null);
    setLoaded(false);
    if (!address.includes("@") || noPhoto.has(address) || !globalThis.crypto?.subtle) return;
    gravatarHash(address).then((h) => live && setSrc(`/api/avatar/${h}`)).catch(() => {});
    return () => { live = false; };
  }, [address]);

  const initials = name
    .split(/[\s._-]+/)
    .filter((w) => w && !/^dr$/i.test(w))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

  return (
    <div className={`avatar${large ? " lg" : ""}`} style={{ background: avatarColor(address) }} aria-hidden>
      {initials}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className={loaded ? "on" : undefined}
          onLoad={() => setLoaded(true)}
          onError={() => { noPhoto.add(address); setSrc(null); }}
        />
      )}
    </div>
  );
}
