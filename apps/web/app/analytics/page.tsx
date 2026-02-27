import { Providers } from "../../components/Providers";
import { AppLayout } from "../../components/layout/AppLayout";
import { AnalyticsContent } from "./AnalyticsContent";

export default function AnalyticsPage() {
  return (
    <Providers>
      <AppLayout title="Analytics" subtitle="Insights & performance overview">
        <AnalyticsContent />
      </AppLayout>
    </Providers>
  );
}
