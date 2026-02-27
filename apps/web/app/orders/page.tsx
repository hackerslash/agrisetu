import { Providers } from "../../components/Providers";
import { AppLayout } from "../../components/layout/AppLayout";
import { OrdersContent } from "./OrdersContent";

export default function OrdersPage() {
  return (
    <Providers>
      <AppLayout
        title="Orders"
        subtitle="Manage cluster orders assigned to you"
      >
        <OrdersContent />
      </AppLayout>
    </Providers>
  );
}
