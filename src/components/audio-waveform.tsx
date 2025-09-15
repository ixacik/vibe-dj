export function AudioWaveform({ className = "" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
    >
      <rect x="2" y="6" width="2" height="4" rx="0.5">
        <animate
          attributeName="height"
          values="4;10;4"
          dur="1.2s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="y"
          values="6;3;6"
          dur="1.2s"
          repeatCount="indefinite"
        />
      </rect>
      <rect x="7" y="4" width="2" height="8" rx="0.5">
        <animate
          attributeName="height"
          values="8;12;8"
          dur="1.2s"
          repeatCount="indefinite"
          begin="0.2s"
        />
        <animate
          attributeName="y"
          values="4;2;4"
          dur="1.2s"
          repeatCount="indefinite"
          begin="0.2s"
        />
      </rect>
      <rect x="12" y="5" width="2" height="6" rx="0.5">
        <animate
          attributeName="height"
          values="6;10;6"
          dur="1.2s"
          repeatCount="indefinite"
          begin="0.4s"
        />
        <animate
          attributeName="y"
          values="5;3;5"
          dur="1.2s"
          repeatCount="indefinite"
          begin="0.4s"
        />
      </rect>
    </svg>
  );
}