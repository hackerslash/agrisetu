import { AppLayout } from "../../components/layout/AppLayout";
import { PaymentsContent } from "./PaymentsContent";

export default function PaymentsPage() {
  return (
    <AppLayout title="Payments" subtitle="Track escrow & payment status">
      <PaymentsContent />
    </AppLayout>
  );
}
