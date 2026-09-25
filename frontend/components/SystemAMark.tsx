"use client";

/**
 * System A mark converted from the supplied artwork to a transparent PNG.
 * Keeping the black background out of the asset lets it sit on the graphite
 * interface without a visible rectangle or photographic edge.
 */
export default function SystemAMark({
  className = "",
  decorative = true,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <span className={`sa-mark ${className}`} aria-hidden={decorative}>
      <img src="/system-a-mark.png" alt={decorative ? "" : "System A"} draggable={false} />
    </span>
  );
}
