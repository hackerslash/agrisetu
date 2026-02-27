import { Providers } from "../../components/Providers";
import { AppLayout } from "../../components/layout/AppLayout";
import { DashboardContent } from "./DashboardContent";

export default function DashboardPage() {
  return (
    <Providers>
      <AppLayout title="Dashboard" showDatePill>
        <DashboardContent />
      </AppLayout>
    </Providers>
  );
}
