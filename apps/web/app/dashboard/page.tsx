import { Providers } from "../../components/Providers";
import { AppLayout } from "../../components/layout/AppLayout";
import { DashboardContent } from "./DashboardContent";

export default function DashboardPage() {
  return (
    <Providers>
      <AppLayout title="Dashboard" subtitle="Overview of your vendor activity">
        <DashboardContent />
      </AppLayout>
    </Providers>
  );
}
