import { AppLayout } from "../../components/layout/AppLayout";
import { DashboardContent } from "./DashboardContent";

export default function DashboardPage() {
  return (
    <AppLayout title="Dashboard" showDatePill>
      <DashboardContent />
    </AppLayout>
  );
}
