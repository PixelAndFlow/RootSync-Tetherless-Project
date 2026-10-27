interface SectorIconProps {
  className?: string;
  sectorId: string;
}

export function SectorIcon({ className = "h-7 w-7 text-[#5A1EE4]", sectorId }: SectorIconProps) {
  const iconProps = {
    "aria-hidden": true,
    className,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  if (sectorId === "sector_1") return <svg {...iconProps}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  if (sectorId === "sector_2") return <svg {...iconProps}><path d="M12 3 4 6v5c0 5 3.4 8.74 8 10 4.6-1.26 8-5 8-10V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
  if (sectorId === "sector_3") return <svg {...iconProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h2M8 17h5" /><circle cx="16.5" cy="16.5" r="2.5" /><path d="m18.4 18.4 1.6 1.6" /></svg>;
  return <svg {...iconProps}><path d="M6 3v18" /><path d="M6 4h11l-2 4 2 4H6" /><path d="m15 17 1.2 2.4L19 20.5l-2 1.5.6 2.5-2.6-1.3-2.5 1.3.5-2.5-2-1.5 2.8-1.1L15 17Z" /></svg>;
}
