import { VendorSessionGate } from "../components/auth/VendorSessionGate";

export default function Home() {
  return (
    <VendorSessionGate
      authenticatedRedirect="/dashboard"
      unauthenticatedRedirect="/login"
      loadingMessage="Opening vendor portal..."
    />
  );
}
