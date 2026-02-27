import { Providers } from "../../components/Providers";
import { AppLayout } from "../../components/layout/AppLayout";
import { GigsContent } from "./GigsContent";

export default function GigsPage() {
  return (
    <Providers>
      <AppLayout title="Gigs" subtitle="Manage your published and draft gigs">
        <GigsContent />
      </AppLayout>
    </Providers>
  );
}
