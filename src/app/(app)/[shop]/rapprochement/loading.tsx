import { Bone, PageHeaderSkeleton, PanelSkeleton } from "@/components/skeleton";

export default function RapprochementLoading() {
  return (
    <div role="status" aria-label="Chargement du rapprochement">
      <PageHeaderSkeleton eyebrow="Rapprochement" />
      <PanelSkeleton className="mt-6 h-[180px]">
        <Bone className="h-5 w-32" />
        <Bone className="mt-4 h-8 w-64" />
      </PanelSkeleton>
      <PanelSkeleton className="mt-4">
        <Bone className="h-24 w-full" />
        <Bone className="mt-3 h-24 w-full" />
      </PanelSkeleton>
    </div>
  );
}
