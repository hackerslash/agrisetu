import { AppLayout } from "../../components/layout/AppLayout";
import { OrdersContent } from "./OrdersContent";

export default function OrdersPage() {
  return (
    <AppLayout
      title="Orders"
      subtitle="Manage cluster orders assigned to you"
    >
      <OrdersContent />
    </AppLayout>
  );
}
