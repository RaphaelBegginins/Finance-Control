import DashboardLayout from "@/components/DashboardLayout";
import FinanceWorkspace, { type FinanceSection } from "./FinanceWorkspace";

export default function Home({ section = "dashboard" }: { section?: FinanceSection }) {
  return <DashboardLayout><FinanceWorkspace section={section} /></DashboardLayout>;
}
