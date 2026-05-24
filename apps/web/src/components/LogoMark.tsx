type Props = {
  size?: number;
  className?: string;
};

// Composed from the two Figma asset layers (cookpot body + lid edge) on 8:9534.
// Stroke uses currentColor so the icon adopts the wrapping <span> text color.
export default function LogoMark({ size = 40, className = '' }: Props) {
  const iconSize = Math.round(size * 0.6);
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-primary text-white ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <g
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17 21c.265 0 .52-.105.707-.293A1 1 0 0 0 18 20v-5.35c0-.46.317-.846.728-1.043a3.5 3.5 0 1 0-2.683-6.412A3.5 3.5 0 0 0 12 3a3.5 3.5 0 0 0-4.045 4.195 3.5 3.5 0 1 0-2.683 6.412c.41.197.728.583.728 1.043V20a1 1 0 0 0 1 1h10Z" />
          <path d="M9 17h6" />
        </g>
      </svg>
    </span>
  );
}
