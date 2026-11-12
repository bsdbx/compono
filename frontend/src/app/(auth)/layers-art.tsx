/** The stacked layers beside the sign-in and sign-up forms, redrawn from the design. */
export function LayersArt() {
  return (
    <svg
      viewBox="0 0 950 820"
      className="w-[78%] max-w-160"
      fill="none"
      aria-hidden
    >
      <defs>
        <radialGradient id="layers-glow" cx="0.5" cy="0.46" r="0.5">
          <stop offset="0" stopColor="#5e6ad2" stopOpacity="0.22" />
          <stop offset="1" stopColor="#5e6ad2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="layers-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6a6fc4" />
          <stop offset="1" stopColor="#3b3e86" />
        </linearGradient>
        <linearGradient id="layers-under" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5e6ad2" stopOpacity="0.18" />
          <stop offset="1" stopColor="#5e6ad2" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="475" cy="380" rx="470" ry="400" fill="url(#layers-glow)" />
      <path
        d="M70 220V520M860 288V590"
        stroke="#3f3f46"
        strokeDasharray="2 6"
      />
      <polygon
        points="407,337 843,590 524,777 87,524"
        stroke="#2e2e33"
        strokeWidth="1.5"
      />
      <polygon
        points="407,237 843,489 524,675 87,423"
        stroke="#3f3f46"
        strokeWidth="1.5"
        fill="url(#layers-under)"
      />
      <polygon
        points="407,137 843,389 524,573 87,320"
        stroke="#6f74e0"
        strokeWidth="1.5"
        fill="url(#layers-under)"
      />
      <polygon
        points="407,37 843,288 524,472 87,220"
        fill="url(#layers-top)"
        fillOpacity="0.85"
        stroke="#eceeff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <polygon
        points="414,108 720,286 517,401 211,225"
        stroke="#ffffff"
        strokeOpacity="0.3"
        strokeWidth="1.5"
      />
      <polygon
        points="407,137 620,262 470,346 257,222"
        stroke="#ffffff"
        strokeOpacity="0.14"
        strokeWidth="1.5"
      />
      <polygon points="478,290 526,262 628,320 580,348" fill="#8188ea" />
    </svg>
  );
}
