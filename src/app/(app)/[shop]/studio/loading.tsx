import { Bone, PageHeaderSkeleton, PanelSkeleton } from "@/components/skeleton";

export default function StudioLoading() {
  return (
    <div role="status" aria-label="Chargement du Studio">
      <PageHeaderSkeleton eyebrow="Studio Ads" />
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <PanelSkeleton className="h-[520px]">
          <Bone className="h-9 w-full" />
          <Bone className="mt-4 h-36 w-full" />
          <Bone className="mt-3 h-36 w-full" />
        </PanelSkeleton>
        <PanelSkeleton className="h-[520px]">
          <Bone className="h-8 w-80 max-w-full" />
          <Bone className="mt-4 h-28 w-full" />
          <Bone className="mt-3 h-28 w-full" />
        </PanelSkeleton>
      </div>
    </div>
  );
}
