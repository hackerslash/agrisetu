import { Providers } from "../../components/Providers";
import { AppLayout } from "../../components/layout/AppLayout";
import { GigsContent } from "./GigsContent";

export default function GigsPage() {
  return (
    <Providers>
      <AppLayout title="Gigs" subtitle="Manage your product listings">
        <GigsContent />
      </AppLayout>
    </Providers>
  );
}
