import { Bone, PageHeaderSkeleton, PanelSkeleton } from "@/components/skeleton";

export default function BriefLoading() {
  return (
    <div role="status" aria-label="Chargement du brief">
      <PageHeaderSkeleton eyebrow="Brief du matin" />
      <PanelSkeleton className="mt-6">
        <Bone className="h-6 w-3/4" />
        <Bone className="mt-6 h-4 w-full" />
        <Bone className="mt-3 h-4 w-11/12" />
        <Bone className="mt-3 h-4 w-4/5" />
      </PanelSkeleton>
    </div>
  );
}
