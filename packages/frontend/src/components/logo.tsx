import { cn } from "@/lib/utils";

/**
 * The Stallion Mark — an abstract radial spark.
 * Five curved strokes radiating from center, each curving clockwise,
 * creating a dynamic pinwheel that evokes energy, motion, and
 * multiple agents working in parallel.
 */
export function StallionMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
    >
      {/* Five curved rays — each curves clockwise from center */}
      <path
        d="M16 14.5 C14.5 11, 15 7, 17.5 3.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M17.2 15 C19.5 12.5, 23 11.5, 27 12"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M16.8 17.2 C19 19, 20 22.5, 19 26.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M15 17.5 C13 19.5, 9.5 20.5, 5.5 19.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M14.8 15.5 C12 14.5, 9 12, 7.5 8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* Center dot */}
      <circle cx="16" cy="16" r="2" fill="currentColor" />
    </svg>
  );
}
