export function Rotate360Icon({ width = 22 }: { width?: number }) {
  return (
    <svg
      width={width}
      height={width}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
      <polyline points="21 3 21 8 16 8" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    </svg>
  );
}
