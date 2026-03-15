export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg width={compact ? 36 : 52} height={compact ? 36 : 52} viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <rect x="6" y="6" width="52" height="52" rx="16" fill="url(#g1)" />
        <path d="M20 22H44L32 42H44" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <defs>
          <linearGradient id="g1" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FF7A1A" />
            <stop offset="1" stopColor="#123B5D" />
          </linearGradient>
        </defs>
      </svg>
      {!compact ? (
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: 0.4 }}>TNA-Nexus</div>
          <div className="muted" style={{ fontSize: 12 }}>Field Operations Control Layer</div>
        </div>
      ) : null}
    </div>
  );
}
