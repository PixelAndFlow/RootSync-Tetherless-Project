import type { MissionSector } from "../../types/content";
import { SectorIcon } from "./SectorIcon";

interface SectorMapProps {
  sectors: MissionSector[];
  completedSectorIds: string[];
  answeredQuestionIds?: string[];
}

export function SectorMap({ sectors, completedSectorIds, answeredQuestionIds = [] }: SectorMapProps) {
  return <div className="grid gap-2 sm:grid-cols-2">{sectors.map((sector) => {
    const complete = completedSectorIds.includes(sector.id);
    const answered = sector.question_ids.filter((id) => answeredQuestionIds.includes(id)).length;
    return <div className={`rounded-xl border p-3 ${complete ? "border-emerald-300/35 bg-emerald-300/10" : "border-white/10 bg-white/[0.03]"}`} key={sector.id}><div className="flex items-center justify-between gap-2"><SectorIcon className="h-5 w-5 text-[#5A1EE4]" sectorId={sector.id} /><span className={`text-[10px] font-bold uppercase tracking-wider ${complete ? "text-emerald-100" : "text-slate-400"}`}>{complete ? "Secured" : `${answered}/${sector.question_ids.length}`}</span></div><p className="mt-2 text-sm font-bold">{sector.name.en}</p></div>;
  })}</div>;
}
