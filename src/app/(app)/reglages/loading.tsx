import { Bone, PageHeaderSkeleton, PanelSkeleton } from "@/components/skeleton";

export default function SettingsLoading() {
  return (
    <div role="status" aria-label="Chargement des réglages">
      <PageHeaderSkeleton eyebrow="Réglages" />
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <PanelSkeleton className="h-[560px]">
          <Bone className="h-5 w-40" />
          <Bone className="mt-6 h-10 w-full" />
          <Bone className="mt-4 h-10 w-full" />
        </PanelSkeleton>
        <PanelSkeleton className="h-[420px]">
          <Bone className="h-5 w-32" />
          <Bone className="mt-6 h-10 w-full" />
        </PanelSkeleton>
      </div>
    </div>
  );
}
