import { RequestDetail } from "@/components/app/request-detail";

export const metadata = {
  title: "Request — Throughline",
};

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RequestDetail id={id} />;
}
