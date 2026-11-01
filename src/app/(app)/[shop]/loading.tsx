import { Bone, PageHeaderSkeleton, PanelSkeleton } from "@/components/skeleton";

export default function CockpitLoading() {
  return (
    <div role="status" aria-label="Chargement du cockpit">
      <PageHeaderSkeleton eyebrow="Cockpit" />
      <Bone className="mt-8 h-9 w-56" />
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <PanelSkeleton className="h-[300px]">
          <Bone className="h-3 w-28" />
          <Bone className="mt-5 h-9 w-72 max-w-full" />
          <Bone className="mt-4 h-4 w-full" />
          <Bone className="mt-10 h-2.5 w-full" />
        </PanelSkeleton>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {[0, 1, 2, 3].map((i) => (
            <PanelSkeleton key={i} className="h-[142px]">
              <Bone className="h-3 w-24" />
              <Bone className="mt-6 h-8 w-20" />
            </PanelSkeleton>
          ))}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <PanelSkeleton className="h-[380px]">
          <Bone className="h-4 w-64 max-w-full" />
          <Bone className="mt-6 h-[280px] w-full" />
        </PanelSkeleton>
        <PanelSkeleton className="h-[380px]">
          <Bone className="h-4 w-56 max-w-full" />
          <Bone className="mt-6 h-[280px] w-full" />
        </PanelSkeleton>
      </div>
    </div>
  );
}
