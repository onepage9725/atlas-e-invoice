import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { getCaseCommissionStructure, type CommissionStructure } from "../lib/commissionStructures";
import { SalesCaseModal, type ProjectOption, type SalesCaseRecord } from "./SalesCaseModal";

type ProjectRecord = {
  id: string;
  project_name: string | null;
  developer_name: string | null;
  state_area: string | null;
  location: string | null;
  company_commission: number | null;
  agent_commission: number | null;
  pre_leader_override: number | null;
  leader_override: number | null;
  direct_commission: number | null;
  holding_commission: number | null;
  commission_structures: CommissionStructure[] | null;
  default_commission_structure_id: string | null;
};

type SignedLoCaseRecord = SalesCaseRecord;

type ProfileRecord = {
  id: string;
  name: string | null;
  email: string | null;
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getCurrentMonthRange = () => {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    from: toDateInputValue(firstDay),
    to: toDateInputValue(lastDay),
  };
};

const toComparableDate = (value: string | null) => {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return toDateInputValue(parsedDate);
};

const normalizeCaseStatus = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

const formatDate = (value: string | null) => {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleDateString("en-MY");
};

const formatAmount = (value: number) =>
  value.toLocaleString("en-MY", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });

const normalizeCaseForModal = (record: SalesCaseRecord): SalesCaseRecord => ({
  ...record,
  spa_price: record.spa_price ?? null,
  nett_price: record.nett_price ?? null,
  booking_fee: record.booking_fee ?? null,
});

export function ProjectCasePage() {
  const defaultRange = getCurrentMonthRange();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [signedLoCases, setSignedLoCases] = useState<SignedLoCaseRecord[]>([]);
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>(defaultRange.from);
  const [dateTo, setDateTo] = useState<string>(defaultRange.to);
  const [selectedCase, setSelectedCase] = useState<SalesCaseRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setError(null);

      const [projectResult, caseResult, profileResult] = await Promise.all([
        supabase
          .from("projects")
          .select(
            "id, project_name, developer_name, state_area, location, company_commission, agent_commission, pre_leader_override, leader_override, direct_commission, holding_commission, commission_structures, default_commission_structure_id"
          )
          .eq("is_hidden", false),
        supabase
          .from("sales_cases")
          .select("*")
          .in("status", ["Approve", "Paid"])
          .not("signed_lo_date", "is", null)
          .order("signed_lo_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, name, email"),
      ]);

      if (projectResult.error) {
        setError(projectResult.error.message);
        return;
      }

      if (caseResult.error) {
        setError(caseResult.error.message);
        return;
      }

      if (profileResult.error) {
        setError(profileResult.error.message);
        return;
      }

      setProjects((projectResult.data as ProjectRecord[]) ?? []);
      setSignedLoCases((caseResult.data as SignedLoCaseRecord[]) ?? []);
      setProfiles((profileResult.data as ProfileRecord[]) ?? []);
    };

    void loadData();
  }, []);

  const profileLabelById = useMemo(() => {
    const map = new Map<string, string>();
    profiles.forEach((profile) => {
      map.set(profile.id, profile.name || profile.email || "-");
    });
    return map;
  }, [profiles]);

  const dateFilteredCases = useMemo(() => {
    return signedLoCases.filter((record) => {
      const recordDate = toComparableDate(record.signed_lo_date ?? record.created_at ?? null);
      if (!recordDate) {
        return false;
      }

      if (dateFrom && recordDate < dateFrom) {
        return false;
      }

      if (dateTo && recordDate > dateTo) {
        return false;
      }

      return true;
    });
  }, [dateFrom, dateTo, signedLoCases]);

  const signedLoCountByProjectId = useMemo(() => {
    const map = new Map<string, number>();

    dateFilteredCases.forEach((record) => {
      if (!record.project_id) {
        return;
      }

      map.set(record.project_id, (map.get(record.project_id) ?? 0) + 1);
    });

    return map;
  }, [dateFilteredCases]);

  const projectOptions = useMemo(() => {
    return projects
      .map((project) => ({
        ...project,
        signedLoCount: signedLoCountByProjectId.get(project.id) ?? 0,
      }))
      .sort((left, right) => right.signedLoCount - left.signedLoCount);
  }, [projects, signedLoCountByProjectId]);

  const visibleCases = useMemo(() => {
    if (selectedProjectId === "all") {
      return dateFilteredCases;
    }

    return dateFilteredCases.filter((record) => record.project_id === selectedProjectId);
  }, [dateFilteredCases, selectedProjectId]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((project) => {
      map.set(project.id, project.project_name || "Unnamed project");
    });
    return map;
  }, [projects]);

  const projectById = useMemo(() => {
    const map = new Map<string, ProjectRecord>();
    projects.forEach((project) => map.set(project.id, project));
    return map;
  }, [projects]);

  const totalAgentComm = useMemo(() => {
    return visibleCases.reduce((sum, record) => {
      const project = record.project_id ? projectById.get(record.project_id) ?? null : null;
      const commissionStructure = getCaseCommissionStructure(record, project);
      const agentPercentage =
        (commissionStructure?.agent_commission ?? 0) +
        (commissionStructure?.pre_leader_override ?? 0) +
        (commissionStructure?.leader_override ?? 0);

      return sum + (Number(record.nett_price ?? 0) * agentPercentage) / 100;
    }, 0);
  }, [projectById, visibleCases]);

  const totalCompanyComm = useMemo(() => {
    return visibleCases.reduce((sum, record) => {
      const project = record.project_id ? projectById.get(record.project_id) ?? null : null;
      const commissionStructure = getCaseCommissionStructure(record, project);
      const companyPercentage = Math.max(
        (commissionStructure?.company_commission ?? 0) - (commissionStructure?.campaign_contribution ?? 0),
        0
      );

      return sum + (Number(record.nett_price ?? 0) * companyPercentage) / 100;
    }, 0);
  }, [projectById, visibleCases]);

  const totalCampaignComm = useMemo(() => {
    return visibleCases.reduce((sum, record) => {
      const status = normalizeCaseStatus(record.status);

      if (status === "pending" || status === "reject" || status === "cancel") {
        return sum;
      }

      const project = record.project_id ? projectById.get(record.project_id) ?? null : null;
      const commissionStructure = getCaseCommissionStructure(record, project);
      const campaignPercentage = commissionStructure?.campaign_contribution ?? 0;

      return sum + (Number(record.nett_price ?? 0) * campaignPercentage) / 100;
    }, 0);
  }, [projectById, visibleCases]);

  const totalSignedLoCases = visibleCases.length;
  const allApprovedSignedLoCases = dateFilteredCases.length;

  const getCaseCommAmounts = (record: SignedLoCaseRecord) => {
    const project = record.project_id ? projectById.get(record.project_id) ?? null : null;
    const commissionStructure = getCaseCommissionStructure(record, project);
    const nettPrice = Number(record.nett_price ?? 0);
    const agentPercentage =
      (commissionStructure?.agent_commission ?? 0) +
      (commissionStructure?.pre_leader_override ?? 0) +
      (commissionStructure?.leader_override ?? 0);
    const companyPercentage = Math.max(
      (commissionStructure?.company_commission ?? 0) - (commissionStructure?.campaign_contribution ?? 0),
      0
    );
    const campaignPercentage = commissionStructure?.campaign_contribution ?? 0;

    return {
      agentComm: (nettPrice * agentPercentage) / 100,
      companyComm: (nettPrice * companyPercentage) / 100,
      campaignComm: (nettPrice * campaignPercentage) / 100,
    };
  };

  return (
    <div className="px-4 pb-8 pt-20 md:ml-[220px] md:w-[calc(100%-220px)] md:px-8 md:pb-12 md:pt-24">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Project Case</h2>
        <p className="mt-1 text-sm text-gray-500">View signed LO case totals by project and inspect each signed LO record.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total Signed LO Cases</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{totalSignedLoCases}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Current Project Filter</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {selectedProjectId === "all" ? "All Projects" : projectNameById.get(selectedProjectId) || "Unknown project"}
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total Agent Comm</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">RM {formatAmount(totalAgentComm)}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total Company Comm</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">RM {formatAmount(totalCompanyComm)}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Cash for Campaign</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">RM {formatAmount(totalCampaignComm)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Filter by Date</h3>
            <p className="text-xs text-gray-500">Default range is current month (first day to last day).</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const nextRange = getCurrentMonthRange();
                setDateFrom(nextRange.from);
                setDateTo(nextRange.to);
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
            >
              Reset to This Month
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedProjectId("all")}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              selectedProjectId === "all"
                ? "border-primary bg-primary text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            All Projects ({allApprovedSignedLoCases})
          </button>
          {projectOptions.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => setSelectedProjectId(project.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                selectedProjectId === project.id
                  ? "border-primary bg-primary text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {(project.project_name || "Unnamed project") + ` (${project.signedLoCount})`}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-4 py-3">Signed LO Date</th>
                <th className="px-4 py-3">Booking Date</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Agent Comm</th>
                <th className="px-4 py-3">Company Comm</th>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Created By</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleCases.map((record) => {
                const { agentComm, companyComm, campaignComm } = getCaseCommAmounts(record);

                return (
                  <tr key={record.id} className="border-b border-gray-50 text-gray-700">
                    <td className="px-4 py-3">{formatDate(record.signed_lo_date)}</td>
                    <td className="px-4 py-3">{formatDate(record.booking_date)}</td>
                    <td className="px-4 py-3">
                      <p>{projectNameById.get(record.project_id || "") || "Unknown project"}</p>
                      <p className="mt-0.5 text-xs text-gray-500">Unit: {record.unit_number || "-"}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">RM {formatAmount(agentComm)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">RM {formatAmount(companyComm)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">RM {formatAmount(campaignComm)}</td>
                    <td className="px-4 py-3">{profileLabelById.get(record.created_by || "") || "-"}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedCase(normalizeCaseForModal(record))}
                        className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
              {visibleCases.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                    No signed LO cases found for this project.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCase && (
        <SalesCaseModal
          userId={selectedCase.created_by ?? ""}
          projects={projects as ProjectOption[]}
          initialCase={selectedCase}
          readOnly
          onClose={() => setSelectedCase(null)}
          onSaved={() => {
            setSelectedCase(null);
          }}
        />
      )}
    </div>
  );
}