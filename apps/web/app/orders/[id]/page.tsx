import { Providers } from "../../../components/Providers";
import { AppLayout } from "../../../components/layout/AppLayout";
import { OrderDetailContent } from "./OrderDetailContent";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Providers>
      <AppLayout
        title="Order Detail"
        subtitle="Cluster order details & actions"
      >
        <OrderDetailContent id={id} />
      </AppLayout>
    </Providers>
  );
}
