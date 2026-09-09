import { IngestSettings } from "@/components/app/ingest-settings";
import { MembersSettings } from "@/components/app/members-settings";
import { GithubSettings } from "@/components/app/github-settings";
import { Separator } from "@/components/ui/separator";

export const metadata = {
  title: "Settings — Throughline",
};

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-10">
      <MembersSettings />
      <Separator />
      <GithubSettings />
      <Separator />
      <IngestSettings />
    </div>
  );
}
