import { AppLayout } from "../../../../components/layout/AppLayout";
import { RejectOrderContent } from "./RejectOrderContent";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RejectOrderPage({ params }: Props) {
  const { id } = await params;
  const shortId = id.slice(-3).toUpperCase();
  return (
    <AppLayout
      title="Reject Order"
      subtitle={`ORD-${shortId} · Review and confirm rejection`}
    >
      <RejectOrderContent id={id} />
    </AppLayout>
  );
}
