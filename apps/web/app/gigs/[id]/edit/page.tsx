import { AppLayout } from "../../../../components/layout/AppLayout";
import { GigEditorWrapper } from "../../GigEditorWrapper";

export default async function EditGigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppLayout title="Edit Gig" subtitle="Update your product listing">
      <GigEditorWrapper id={id} />
    </AppLayout>
  );
}
