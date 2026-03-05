import { AppLayout } from "../../components/layout/AppLayout";
import { GigsContent } from "./GigsContent";

export default function GigsPage() {
  return (
    <AppLayout title="Gigs" subtitle="Manage your published and draft gigs">
      <GigsContent />
    </AppLayout>
  );
}
