import { TaskBoard } from "@/components/app/task-board";

export const metadata = {
  title: "Task board — Throughline",
};

export default async function TaskBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TaskBoard requestId={id} />;
}
