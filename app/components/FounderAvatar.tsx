"use client";

import Image from "next/image";
import { useState } from "react";

type Props = {
  photo?: string;
  initials: string;
  name: string;
  linkedin: string;
  // Card-sized portrait (rounded rectangle) instead of the small circle
  large?: boolean;
};

// Renders the LinkedIn-style profile photo when available, and falls back to
// the initials badge if the image is missing or fails to load.
export default function FounderAvatar({ photo, initials, name, linkedin, large }: Props) {
  const [failed, setFailed] = useState(false);
  const showPhoto = photo && !failed;
  const size = large ? 400 : 72;

  return (
    <a
      className={large ? "avatar avatar-card" : "avatar"}
      href={linkedin}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name} on LinkedIn`}
    >
      {showPhoto ? (
        <Image
          className="avatar-photo"
          src={photo}
          alt={name}
          width={size}
          height={size}
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </a>
  );
}
