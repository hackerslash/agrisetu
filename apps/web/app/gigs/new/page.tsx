import { AppLayout } from "../../../components/layout/AppLayout";
import { GigEditor } from "../GigEditor";

export default function NewGigPage() {
  return (
    <AppLayout title="New Gig" subtitle="Create a new product listing">
      <GigEditor />
    </AppLayout>
  );
}
