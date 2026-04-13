import { VendorSessionGate } from "../components/auth/VendorSessionGate";

export default function Home() {
  return (
    <VendorSessionGate
      unauthenticatedRedirect="/login"
      loadingMessage="Opening vendor portal..."
    />
  );
}
