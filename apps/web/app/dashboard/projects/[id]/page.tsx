import { ProjectDetail } from "@/components/app/project-detail";

export const metadata = {
  title: "Project — Throughline",
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectDetail id={id} />;
}
