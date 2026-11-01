import { Bone, PageHeaderSkeleton, PanelSkeleton } from "@/components/skeleton";

export default function RadarLoading() {
  return (
    <div role="status" aria-label="Chargement du radar">
      <PageHeaderSkeleton eyebrow="Radar concurrents" />
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <PanelSkeleton className="h-[360px]">
          <Bone className="h-4 w-72 max-w-full" />
          <Bone className="mt-6 h-[260px] w-full" />
        </PanelSkeleton>
        <PanelSkeleton className="h-[360px]">
          <Bone className="h-4 w-48" />
          <Bone className="mt-6 h-12 w-full" />
          <Bone className="mt-3 h-12 w-full" />
          <Bone className="mt-3 h-12 w-full" />
        </PanelSkeleton>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <PanelSkeleton key={i} className="h-[420px] p-0">
            <Bone className="h-[260px] w-full rounded-b-none" />
          </PanelSkeleton>
        ))}
      </div>
    </div>
  );
}
