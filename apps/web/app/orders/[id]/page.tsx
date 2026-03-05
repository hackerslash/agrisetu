import { AppLayout } from "../../../components/layout/AppLayout";
import { OrderDetailContent } from "./OrderDetailContent";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <AppLayout title="Order Detail" subtitle="View and manage this order">
      <OrderDetailContent id={id} />
    </AppLayout>
  );
}
