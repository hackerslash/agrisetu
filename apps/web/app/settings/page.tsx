import { Providers } from "../../components/Providers";
import { AppLayout } from "../../components/layout/AppLayout";
import { SettingsContent } from "./SettingsContent";

export default function SettingsPage() {
  return (
    <Providers>
      <AppLayout title="Settings" subtitle="Manage your profile & preferences">
        <SettingsContent />
      </AppLayout>
    </Providers>
  );
}
