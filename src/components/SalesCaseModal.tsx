import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import {
  createCaseNotifications,
  getNotificationProfileLabel,
  notifyCaseAudience,
} from "../lib/notifications";
import {
  getDefaultProjectCommissionStructure,
  getCaseCommissionStructure,
  getCommissionStructureLabel,
  getDirectCommissionPercentage,
  type CommissionStructure,
} from "../lib/commissionStructures";
import { buildCommissionStructureByTotalPercentage } from "../lib/salesCasePayouts";

export type ProjectOption = {
  id: string;
  project_name: string | null;
  company_commission: number | null;
  agent_commission: number | null;
  pre_leader_override: number | null;
  leader_override: number | null;
  direct_commission: number | null;
  holding_commission: number | null;
  commission_structures: CommissionStructure[] | null;
  default_commission_structure_id: string | null;
};

export const CREATOR_CASE_STATUS_OPTIONS = ["Pending", "Signed LO", "Cancel"] as const;
export const ADMIN_CASE_STATUS_OPTIONS = ["Claimable", "Approve", "Paid", "Reject"] as const;
export const DISPLAY_ONLY_CASE_STATUS_OPTIONS = ["Completed"] as const;
export const ALL_CASE_STATUS_OPTIONS = [
  ...CREATOR_CASE_STATUS_OPTIONS,
  ...ADMIN_CASE_STATUS_OPTIONS,
  ...DISPLAY_ONLY_CASE_STATUS_OPTIONS,
] as const;
export const MANAGE_CASE_STATUS_OPTIONS = [
  ...CREATOR_CASE_STATUS_OPTIONS,
  "Claimable",
  "Reject",
] as const;
export const REVIEW_CASE_STATUSES = ["Claimable"] as const;

export type SalesCaseStatus =
  | (typeof CREATOR_CASE_STATUS_OPTIONS)[number]
  | (typeof ADMIN_CASE_STATUS_OPTIONS)[number]
  | (typeof DISPLAY_ONLY_CASE_STATUS_OPTIONS)[number];

export const MEMBER_SIGNED_SPA_OPTIONS = ["None", "Submit"] as const;
export const ADMIN_SIGNED_SPA_OPTIONS = ["Complete", "Reject"] as const;
export const MANAGE_SIGNED_SPA_OPTIONS = ["None", "Submit", "Complete", "Reject"] as const;

export type SignedSpaStatus =
  | (typeof MEMBER_SIGNED_SPA_OPTIONS)[number]
  | (typeof ADMIN_SIGNED_SPA_OPTIONS)[number];

const normalizeSignedSpaStatus = (
  value: string | null | undefined,
  fallback: SignedSpaStatus = "None"
): SignedSpaStatus => {
  const normalizedValue = (value ?? "").trim();
  const validOptions = new Set<string>([
    ...MEMBER_SIGNED_SPA_OPTIONS,
    ...ADMIN_SIGNED_SPA_OPTIONS,
  ]);

  return validOptions.has(normalizedValue)
    ? (normalizedValue as SignedSpaStatus)
    : fallback;
};

const getScopedSignedSpaStatus = (
  value: string | null | undefined,
  options: readonly SignedSpaStatus[],
  fallback: SignedSpaStatus = "None"
): SignedSpaStatus => {
  const normalized = normalizeSignedSpaStatus(value, fallback);
  const optionSet = new Set<string>(options);

  if (optionSet.has(normalized)) {
    return normalized;
  }

  return optionSet.has(fallback) ? fallback : "None";
};

export const normalizeCaseStatus = (status: string | null | undefined): SalesCaseStatus => {
  const validStatuses = new Set<string>([
    ...CREATOR_CASE_STATUS_OPTIONS,
    ...ADMIN_CASE_STATUS_OPTIONS,
    ...DISPLAY_ONLY_CASE_STATUS_OPTIONS,
  ]);

  return validStatuses.has(status ?? "") ? (status as SalesCaseStatus) : "Pending";
};

export const getCaseStatusClasses = (status: string | null | undefined) => {
  switch (normalizeCaseStatus(status)) {
    case "Signed LO":
      return "bg-blue-50 text-blue-700 border-blue-100";
    case "Claimable":
      return "bg-amber-50 text-amber-700 border-amber-100";
    case "Approve":
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    case "Paid":
      return "bg-green-50 text-green-700 border-green-100";
    case "Completed":
      return "bg-green-50 text-green-700 border-green-100";
    case "Reject":
      return "bg-violet-50 text-violet-700 border-violet-100";
    case "Cancel":
      return "bg-red-50 text-red-700 border-red-100";
    default:
      return "bg-slate-50 text-slate-700 border-slate-100";
  }
};

export const hasCaseWorkflowColumns = (
  record: Partial<SalesCaseRecord> | null | undefined
) => Boolean(record && ("status" in record || "lo_draft_url" in record || "signed_lo_date" in record));

export const isCaseLockedForEditing = (status: string | null | undefined) => {
  const normalizedStatus = normalizeCaseStatus(status);
  return normalizedStatus === "Approve" || normalizedStatus === "Paid";
};

type StatusSelectProps = {
  value: SalesCaseStatus;
  options: readonly SalesCaseStatus[];
  onChange: (status: SalesCaseStatus) => void;
};

type SignedSpaSelectProps = {
  value: SignedSpaStatus;
  options: readonly SignedSpaStatus[];
  onChange: (status: SignedSpaStatus) => void;
  disabled?: boolean;
};

function StatusSelect({ value, options, onChange }: StatusSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedStatus = normalizeCaseStatus(value);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm font-medium shadow-sm transition focus:outline-none focus:ring-1 focus:ring-primary ${getCaseStatusClasses(selectedStatus)}`}
      >
        <span>{selectedStatus}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Case Status"
          className="absolute z-20 mt-2 w-full space-y-2 rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
        >
          {options.map((statusOption) => {
            const isSelected = statusOption === selectedStatus;

            return (
              <button
                key={statusOption}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(statusOption);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition hover:opacity-90 ${getCaseStatusClasses(statusOption)}`}
              >
                <span>{statusOption}</span>
                {isSelected ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const getSignedSpaStatusClasses = (status: SignedSpaStatus) => {
  switch (status) {
    case "Submit":
      return "bg-blue-50 text-blue-700 border-blue-100";
    case "Complete":
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    case "Reject":
      return "bg-red-50 text-red-700 border-red-100";
    default:
      return "bg-slate-50 text-slate-700 border-slate-100";
  }
};

function SignedSpaSelect({ value, options, onChange, disabled = false }: SignedSpaSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedStatus = getScopedSignedSpaStatus(value, options, "None");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
          if (disabled) {
            return;
          }

          setIsOpen((prev) => !prev);
        }}
        disabled={disabled}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm font-medium shadow-sm transition focus:outline-none focus:ring-1 focus:ring-primary ${getSignedSpaStatusClasses(selectedStatus)} ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
      >
        <span>{selectedStatus}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && !disabled && (
        <div
          role="listbox"
          aria-label="Signed SPA"
          className="absolute z-20 mt-2 w-full space-y-2 rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
        >
          {options.map((statusOption) => {
            const isSelected = statusOption === selectedStatus;

            return (
              <button
                key={statusOption}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(statusOption);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition hover:opacity-90 ${getSignedSpaStatusClasses(statusOption)}`}
              >
                <span>{statusOption}</span>
                {isSelected ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type ProfileOption = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  rank: string | null;
  recruit_by: string | null;
};

type CommissionRow = {
  id: string;
  profileId: string;
  label: string;
  rank: string;
  percentage: number;
  amount: number;
  type: "agent" | "pre_leader" | "leader";
};

export type SalesCasePayoutStatus = "Pending" | "Approve" | "Reject" | "Paid";

export type SalesCasePayoutType = "standard" | "tier_upgrade_top_up";

export type SalesCasePayoutRecord = {
  id: string;
  sales_case_id: string;
  profile_id: string;
  payout_type: SalesCasePayoutType;
  source_commission_structure_id: string | null;
  source_commission_structure_label: string | null;
  target_commission_structure_id: string | null;
  target_commission_structure_label: string | null;
  agent_commission_percentage: number;
  pre_leader_override_percentage: number;
  leader_override_percentage: number;
  total_amount: number;
  payout_status: SalesCasePayoutStatus;
  payment_receipt_url: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  created_at: string;
};

export type SalesCaseRecord = {
  id: string;
  project_id: string | null;
  booking_date: string | null;
  spa_price: number | null;
  nett_price: number | null;
  booking_fee: number | null;
  unit_number: string | null;
  customer_name: string | null;
  customer_id: string | null;
  customer_contact_number: string | null;
  customer_email: string | null;
  customer_address: string | null;
  customer_details: CustomerDetail[] | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_ic_passport: string | null;
  emergency_contact_number: string | null;
  emergency_contact_email: string | null;
  race: string | null;
  buyer_type: string | null;
  booking_form_url: string | null;
  customer_ic_url: string | null;
  booking_receipt_url: string | null;
  lo_draft_url: string | null;
  signed_spa_url: string | null;
  signed_lo_date: string | null;
  signed_spa_status: SignedSpaStatus | null;
  commission_structure: CommissionStructure | null;
  status: SalesCaseStatus | null;
  created_by: string | null;
  involved_profile_id: string | null;
  involved_user_ids: string[] | null;
  delete_requested: boolean | null;
  delete_requested_by: string | null;
  delete_requested_at: string | null;
  edited_at: string | null;
  edited_by: string | null;
  edit_reviewed_at: string | null;
  edit_reviewed_by: string | null;
  commission_review_sent_at: string | null;
  commission_review_sent_by: string | null;
  created_at: string;
};

type CustomerDetail = {
  name: string;
  id: string;
  contactNumber: string;
  email: string;
  address: string;
  icUrl: string;
};

type SalesCaseModalProps = {
  userId: string;
  projects: ProjectOption[];
  initialCase: SalesCaseRecord | null;
  readOnly?: boolean;
  allowCaseOwnerSelection?: boolean;
  enableWorkflowFields?: boolean;
  allowStatusEdit?: boolean;
  allowLoDraftUpload?: boolean;
  signedSpaOptions?: readonly SignedSpaStatus[];
  lockSignedSpaWhenComplete?: boolean;
  statusOptions?: readonly SalesCaseStatus[];
  paidReceiptRows?: Array<{
    id: string;
    memberLabel: string;
    receiptUrl: string;
    paidAt: string | null;
    grossAmount: number;
  }>;
  onDelete?: () => void;
  onClose: () => void;
  onSaved: () => void;
};

const getStoredInvolvedProfileId = (record: SalesCaseRecord | null) => {
  if (!record) {
    return "";
  }

  return record.involved_profile_id ?? "";
};

const getTodayDate = () => new Date().toISOString().slice(0, 10);

const createEmptyCustomerDetail = (): CustomerDetail => ({
  name: "",
  id: "",
  contactNumber: "",
  email: "",
  address: "",
  icUrl: "",
});

const normalizeCustomerDetails = (value: unknown): CustomerDetail[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const typedItem = item as Record<string, unknown>;

      return {
        name: typeof typedItem.name === "string" ? typedItem.name : "",
        id: typeof typedItem.id === "string" ? typedItem.id : "",
        contactNumber:
          typeof typedItem.contactNumber === "string" ? typedItem.contactNumber : "",
        email: typeof typedItem.email === "string" ? typedItem.email : "",
        address: typeof typedItem.address === "string" ? typedItem.address : "",
        icUrl: typeof typedItem.icUrl === "string" ? typedItem.icUrl : "",
      };
    })
    .filter((item): item is CustomerDetail => Boolean(item));
};

const sanitizeCustomerDetails = (customers: CustomerDetail[]) =>
  customers
    .map((customer) => ({
      name: customer.name.trim(),
      id: customer.id.trim(),
      contactNumber: customer.contactNumber.trim(),
      email: customer.email.trim(),
      address: customer.address.trim(),
      icUrl: customer.icUrl.trim(),
    }))
    .filter(
      (customer) =>
        customer.name ||
        customer.id ||
        customer.contactNumber ||
        customer.email ||
        customer.address ||
        customer.icUrl
    );

const getInitialCustomerDetails = (record: SalesCaseRecord | null): CustomerDetail[] => {
  if (!record) {
    return [createEmptyCustomerDetail()];
  }

  const fromJson = normalizeCustomerDetails(record.customer_details);

  if (fromJson.length > 0) {
    if (!fromJson[0].icUrl && record.customer_ic_url) {
      fromJson[0].icUrl = record.customer_ic_url;
    }

    return fromJson;
  }

  return [
    {
      name: record.customer_name ?? "",
      id: record.customer_id ?? "",
      contactNumber: record.customer_contact_number ?? "",
      email: record.customer_email ?? "",
      address: record.customer_address ?? "",
      icUrl: record.customer_ic_url ?? "",
    },
  ];
};

const createEmptyForm = () => ({
  caseOwnerId: "",
  bookingDate: getTodayDate(),
  projectId: "",
  involvedUserId: "",
  spaPrice: "",
  nettPrice: "",
  bookingFee: "",
  unitNumber: "",
  customers: [createEmptyCustomerDetail()],
  emergencyContactName: "",
  emergencyContactRelationship: "",
  emergencyContactIcPassport: "",
  emergencyContactNumber: "",
  emergencyContactEmail: "",
  race: "Malay",
  raceOther: "",
  buyerType: "Loan",
  bookingFormName: "",
  customerIcName: "",
  bookingReceiptName: "",
  status: "Pending" as SalesCaseStatus,
  signedSpaStatus: "None" as SignedSpaStatus,
  signedSpaName: "",
  loDraftName: "",
  signedLoDate: "",
});

const formatNumberInput = (value: number | null) => (value === null ? "" : value.toString());
const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024;

const isFileTooLarge = (file: File | null | undefined) =>
  Boolean(file && file.size > MAX_UPLOAD_SIZE_BYTES);

const getFileSizeError = (label: string) =>
  `${label} exceeds the 100MB file size limit. Please upload a file smaller than 100MB.`;

function toNumberOrNull(value: string) {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

const shouldRetryWithoutExtendedContactColumns = (message: string) =>
  /Could not find the 'customer_address' column|Could not find the 'customer_details' column|Could not find the 'customer_ic_url' column|Could not find the 'booking_receipt_url' column|Could not find the 'emergency_contact_|Could not find the 'signed_spa_url' column|Could not find the 'signed_lo_date' column|Could not find the 'signed_spa_status' column/i.test(message);

const isRowLevelSecurityError = (message: string) =>
  /row-level security policy|violates row-level security|new row violates row-level security/i.test(message);

const stripExtendedContactColumns = <T extends Record<string, unknown>>(payload: T) => {
  const {
    customer_address,
    customer_details,
    customer_ic_url,
    booking_receipt_url,
    emergency_contact_name,
    emergency_contact_relationship,
    emergency_contact_ic_passport,
    emergency_contact_number,
    emergency_contact_email,
    signed_spa_url,
    signed_lo_date,
    signed_spa_status,
    ...legacyPayload
  } = payload;

  void customer_address;
  void customer_details;
  void customer_ic_url;
  void booking_receipt_url;
  void emergency_contact_name;
  void emergency_contact_relationship;
  void emergency_contact_ic_passport;
  void emergency_contact_number;
  void emergency_contact_email;
  void signed_spa_url;
  void signed_lo_date;
  void signed_spa_status;

  return legacyPayload;
};

export function SalesCaseModal({
  userId,
  projects,
  initialCase,
  readOnly = false,
  allowCaseOwnerSelection = false,
  enableWorkflowFields = true,
  allowStatusEdit = true,
  allowLoDraftUpload = true,
  signedSpaOptions,
  lockSignedSpaWhenComplete = false,
  statusOptions = CREATOR_CASE_STATUS_OPTIONS,
  paidReceiptRows = [],
  onDelete,
  onClose,
  onSaved,
}: SalesCaseModalProps) {
  const [formData, setFormData] = useState(createEmptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingFormFile, setBookingFormFile] = useState<File | null>(null);
  const [customerIcFiles, setCustomerIcFiles] = useState<Array<File | null>>([]);
  const [bookingReceiptFile, setBookingReceiptFile] = useState<File | null>(null);
  const [loDraftFile, setLoDraftFile] = useState<File | null>(null);
  const [signedSpaFile, setSignedSpaFile] = useState<File | null>(null);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);

  const isEditing = Boolean(initialCase);
  const isReadOnly = readOnly && isEditing;
  const showWorkflowFields = enableWorkflowFields && isEditing;
  const currentStatus = normalizeCaseStatus(initialCase?.status);
  const isSignedSpaLocked =
    lockSignedSpaWhenComplete &&
    isEditing &&
    normalizeSignedSpaStatus(initialCase?.signed_spa_status, "None") === "Complete";

  useEffect(() => {
    const fetchProfiles = async () => {
      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("id, name, email, role, rank, recruit_by")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setProfiles((data as ProfileOption[]) ?? []);
    };

    fetchProfiles();
  }, []);

  const profilesById = useMemo(() => {
    const map = new Map<string, ProfileOption>();
    profiles.forEach((profile) => map.set(profile.id, profile));
    return map;
  }, [profiles]);

  const currentUserRole = (profilesById.get(userId)?.role ?? "").toLowerCase();
  const isAdminRole = currentUserRole === "admin" || currentUserRole === "super_admin";
  const effectiveSignedSpaOptions = useMemo<readonly SignedSpaStatus[]>(() => {
    if (signedSpaOptions && signedSpaOptions.length > 0) {
      return signedSpaOptions;
    }

    return isAdminRole ? MANAGE_SIGNED_SPA_OPTIONS : MEMBER_SIGNED_SPA_OPTIONS;
  }, [isAdminRole, signedSpaOptions]);

  useEffect(() => {
    if (!initialCase) {
      setFormData(createEmptyForm());
      setBookingFormFile(null);
      setCustomerIcFiles([null]);
      setBookingReceiptFile(null);
      setLoDraftFile(null);
      setSignedSpaFile(null);
      return;
    }

    const raceValue = initialCase.race ?? "Malay";
    const isOtherRace =
      raceValue !== "Malay" && raceValue !== "Chinese" && raceValue !== "Indian";

    setFormData({
      caseOwnerId: initialCase.created_by ?? "",
      bookingDate: initialCase.booking_date ?? "",
      projectId: initialCase.project_id ?? "",
      involvedUserId: getStoredInvolvedProfileId(initialCase),
      spaPrice: formatNumberInput(initialCase.spa_price),
      nettPrice: formatNumberInput(initialCase.nett_price),
      bookingFee: formatNumberInput(initialCase.booking_fee),
      unitNumber: initialCase.unit_number ?? "",
      customers: getInitialCustomerDetails(initialCase),
      emergencyContactName: initialCase.emergency_contact_name ?? "",
      emergencyContactRelationship: initialCase.emergency_contact_relationship ?? "",
      emergencyContactIcPassport: initialCase.emergency_contact_ic_passport ?? "",
      emergencyContactNumber: initialCase.emergency_contact_number ?? "",
      emergencyContactEmail: initialCase.emergency_contact_email ?? "",
      race: isOtherRace ? "Other" : raceValue,
      raceOther: isOtherRace ? raceValue : "",
      buyerType: initialCase.buyer_type ?? "Loan",
      bookingFormName: initialCase.booking_form_url
        ? initialCase.booking_form_url.split("/").pop() ?? ""
        : "",
      customerIcName: initialCase.customer_ic_url
        ? initialCase.customer_ic_url.split("/").pop() ?? ""
        : "",
      bookingReceiptName: initialCase.booking_receipt_url
        ? initialCase.booking_receipt_url.split("/").pop() ?? ""
        : "",
      status: normalizeCaseStatus(initialCase.status),
      signedSpaStatus: isSignedSpaLocked
        ? "Complete"
        : getScopedSignedSpaStatus(initialCase.signed_spa_status, effectiveSignedSpaOptions, "None"),
      signedSpaName: initialCase.signed_spa_url
        ? initialCase.signed_spa_url.split("/").pop() ?? ""
        : "",
      loDraftName: initialCase.lo_draft_url
        ? initialCase.lo_draft_url.split("/").pop() ?? ""
        : "",
      signedLoDate: initialCase.signed_lo_date ?? "",
    });
    setBookingFormFile(null);
    setCustomerIcFiles(Array(getInitialCustomerDetails(initialCase).length).fill(null));
    setBookingReceiptFile(null);
    setLoDraftFile(null);
    setSignedSpaFile(null);
  }, [effectiveSignedSpaOptions, initialCase, isSignedSpaLocked]);

  useEffect(() => {
    setCustomerIcFiles((prev) => {
      const targetLength = formData.customers.length;

      if (prev.length === targetLength) {
        return prev;
      }

      if (prev.length > targetLength) {
        return prev.slice(0, targetLength);
      }

      return [...prev, ...Array(targetLength - prev.length).fill(null)];
    });
  }, [formData.customers.length]);

  const caseOwnerId = initialCase?.created_by ?? (allowCaseOwnerSelection ? formData.caseOwnerId : userId);
  const creatorProfile = caseOwnerId ? profilesById.get(caseOwnerId) ?? null : null;
  const selectedProject = projects.find((project) => project.id === formData.projectId) ?? null;
  const selectedCommissionStructure = useMemo(() => {
    if (!selectedProject) {
      return null;
    }

    return initialCase
      ? getCaseCommissionStructure(initialCase, selectedProject)
      : getDefaultProjectCommissionStructure(selectedProject);
  }, [initialCase, selectedProject]);
  const selectedInvolvedProfile = formData.involvedUserId
    ? profilesById.get(formData.involvedUserId) ?? null
    : null;
  const caseOwnerOptions = useMemo(
    () =>
      profiles.filter(
        (profile) =>
          profile.role !== "admin" &&
          profile.role !== "super_admin"
      ),
    [profiles]
  );
  const involvedOptions = useMemo(
    () =>
      profiles.filter(
        (profile) =>
          profile.id !== caseOwnerId &&
          profile.role !== "admin"
      ),
    [caseOwnerId, profiles]
  );

  const getProfileLabel = (profile: ProfileOption | null) =>
    profile?.name || profile?.email || "-";

  const getLeaderChain = (
    profile: ProfileOption | null,
    visitedIds = new Set<string>()
  ) => {
    if (!profile) {
      return { preLeader: null, leader: null };
    }

    if (visitedIds.has(profile.id)) {
      return { preLeader: null, leader: null };
    }

    const nextVisitedIds = new Set(visitedIds);
    nextVisitedIds.add(profile.id);

    if (profile.rank === "leader") {
      return { preLeader: null, leader: profile };
    }

    const recruiter = profile.recruit_by ? profilesById.get(profile.recruit_by) ?? null : null;
    if (!recruiter) {
      return { preLeader: null, leader: null };
    }

    if (recruiter.rank === "leader") {
      return { preLeader: null, leader: recruiter };
    }

    if (recruiter.rank === "pre_leader") {
      const leader = recruiter.recruit_by ? profilesById.get(recruiter.recruit_by) ?? null : null;
      return { preLeader: recruiter, leader };
    }

    if (recruiter.rank === "agent") {
      return getLeaderChain(recruiter, nextVisitedIds);
    }

    return { preLeader: null, leader: null };
  };


  const commissionRows = useMemo(() => {
    if (!selectedProject || !selectedCommissionStructure) {
      return [] as CommissionRow[];
    }

    const directPercentage = getDirectCommissionPercentage(selectedCommissionStructure);
    const directCommissionStructure = buildCommissionStructureByTotalPercentage(
      selectedCommissionStructure,
      directPercentage,
      `${selectedCommissionStructure.id}-direct`,
      selectedCommissionStructure.label,
    );

    if (!directCommissionStructure) {
      return [] as CommissionRow[];
    }

    const nettPrice = toNumberOrNull(formData.nettPrice) ?? 0;
    const participants = [creatorProfile, selectedInvolvedProfile].filter(
      (profile, index, array): profile is ProfileOption =>
        Boolean(profile) && array.findIndex((item) => item?.id === profile?.id) === index
    );

    if (participants.length === 0) {
      return [] as CommissionRow[];
    }

    const splitAgentPercentage = (directCommissionStructure.agent_commission ?? 0) / participants.length;
    const splitPreLeaderPercentage =
      (directCommissionStructure.pre_leader_override ?? 0) / participants.length;
    const splitLeaderPercentage = (directCommissionStructure.leader_override ?? 0) / participants.length;

    const rowsByKey = new Map<string, CommissionRow>();

    const appendRow = (
      profile: ProfileOption | null,
      type: CommissionRow["type"],
      percentage: number
    ) => {
      if (!profile || percentage === 0) {
        return;
      }

      const key = `${profile.id}-${type}`;
      const existing = rowsByKey.get(key);
      const nextPercentage = (existing?.percentage ?? 0) + percentage;

      rowsByKey.set(key, {
        id: key,
        profileId: profile.id,
        label: getProfileLabel(profile),
        rank: profile.rank || "member",
        percentage: nextPercentage,
        amount: nettPrice * (nextPercentage / 100),
        type,
      });
    };

    participants.forEach((participant) => {
      appendRow(participant, "agent", splitAgentPercentage);

      const chain = getLeaderChain(participant);

      if (participant.rank === "agent") {
        if (chain.preLeader) {
          appendRow(chain.preLeader, "pre_leader", splitPreLeaderPercentage);
        } else {
          appendRow(chain.leader, "pre_leader", splitPreLeaderPercentage);
        }
        appendRow(chain.leader, "leader", splitLeaderPercentage);
        return;
      }

      if (participant.rank === "pre_leader") {
        appendRow(participant, "pre_leader", splitPreLeaderPercentage);
        appendRow(chain.leader, "leader", splitLeaderPercentage);
        return;
      }

      if (participant.rank === "leader") {
        appendRow(participant, "leader", splitPreLeaderPercentage + splitLeaderPercentage);
      }
    });

    return Array.from(rowsByKey.values());
  }, [creatorProfile, selectedCommissionStructure, selectedInvolvedProfile, selectedProject, formData.nettPrice]);

  const commissionTypeLabel = {
    agent: "Agent Commission",
    pre_leader: "Pre Leader Override",
    leader: "Leader Override",
  } as const;

  const formatCommissionAmount = (value: number) =>
    `RM ${value.toLocaleString("en-MY", {
      minimumFractionDigits: Math.round(value) === value ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;

  const formatCommissionPercentage = (value: number) =>
    Number(value.toFixed(3)).toLocaleString("en-MY", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    });

  const sanitizeFileName = (fileName: string) => {
    const extensionIndex = fileName.lastIndexOf(".");
    const hasExtension = extensionIndex > 0;
    const baseName = hasExtension ? fileName.slice(0, extensionIndex) : fileName;
    const extension = hasExtension ? fileName.slice(extensionIndex).toLowerCase() : "";
    const normalizedBaseName = baseName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    return `${normalizedBaseName || "file"}${extension}`;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCustomerChange = (
    index: number,
    field: keyof CustomerDetail,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      customers: prev.customers.map((customer, customerIndex) =>
        customerIndex === index ? { ...customer, [field]: value } : customer
      ),
    }));
  };

  const addCustomerDetail = () => {
    setFormData((prev) => ({
      ...prev,
      customers: [...prev.customers, createEmptyCustomerDetail()],
    }));
  };

  const removeCustomerDetail = (index: number) => {
    setFormData((prev) => {
      if (prev.customers.length <= 1) {
        return prev;
      }

      return {
        ...prev,
        customers: prev.customers.filter((_, customerIndex) => customerIndex !== index),
      };
    });
  };

  const handleBookingFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;

    if (isFileTooLarge(file)) {
      setError(getFileSizeError("Booking form"));
      return;
    }

    setError(null);
    setBookingFormFile(file);
    setFormData((prev) => ({ ...prev, bookingFormName: file ? file.name : "" }));
  };

  const handleLoDraftChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;

    if (isFileTooLarge(file)) {
      setError(getFileSizeError("LO Draft"));
      return;
    }

    setError(null);
    setLoDraftFile(file);
    setFormData((prev) => ({ ...prev, loDraftName: file ? file.name : prev.loDraftName }));
  };

  const handleSignedSpaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;

    if (isFileTooLarge(file)) {
      setError(getFileSizeError("Signed SPA"));
      return;
    }

    setError(null);
    setSignedSpaFile(file);
    setFormData((prev) => ({ ...prev, signedSpaName: file ? file.name : prev.signedSpaName }));
  };

  const handleCustomerIcChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;

    if (isFileTooLarge(file)) {
      setError(getFileSizeError("Customer I/C"));
      return;
    }

    setError(null);

    setCustomerIcFiles((prev) => {
      const next = [...prev];
      next[index] = file;
      return next;
    });
  };

  const handleBookingReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;

    if (isFileTooLarge(file)) {
      setError(getFileSizeError("Booking receipt"));
      return;
    }

    setError(null);
    setBookingReceiptFile(file);
    setFormData((prev) => ({ ...prev, bookingReceiptName: file ? file.name : "" }));
  };

  const getStoragePathFromUrl = (url: string, bucket: string) => {
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = url.indexOf(marker);
    if (index === -1) return null;
    return url.slice(index + marker.length);
  };

  const deleteBookingFormFromStorage = async (url: string | null) => {
    if (!url) return;
    const path = getStoragePathFromUrl(url, "cases");
    if (!path) return;
    await supabase.storage.from("cases").remove([path]);
  };

  const uploadBookingForm = async () => {
    if (!bookingFormFile) return initialCase?.booking_form_url ?? null;
    const filePath = `${userId}/${Date.now()}-${sanitizeFileName(bookingFormFile.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("cases")
      .upload(filePath, bookingFormFile, { upsert: true });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from("cases").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const uploadLoDraft = async () => {
    if (!enableWorkflowFields) return null;
    if (!loDraftFile) return initialCase?.lo_draft_url ?? null;
    const filePath = `${userId}/${Date.now()}-${sanitizeFileName(loDraftFile.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("cases")
      .upload(filePath, loDraftFile, { upsert: true });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from("cases").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const uploadSignedSpa = async () => {
    if (!enableWorkflowFields) return null;
    if (!signedSpaFile) return initialCase?.signed_spa_url ?? null;
    const filePath = `${userId}/${Date.now()}-${sanitizeFileName(signedSpaFile.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("cases")
      .upload(filePath, signedSpaFile, { upsert: true });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from("cases").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const uploadCustomerIcs = async () => {
    const nextUrls = [...formData.customers.map((customer) => customer.icUrl || "")];

    for (let index = 0; index < customerIcFiles.length; index += 1) {
      const customerIcFile = customerIcFiles[index];

      if (!customerIcFile) {
        continue;
      }

      const filePath = `${userId}/${Date.now()}-${index}-${sanitizeFileName(customerIcFile.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("cases")
        .upload(filePath, customerIcFile, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage.from("cases").getPublicUrl(filePath);
      nextUrls[index] = data.publicUrl;
    }

    return nextUrls;
  };

  const uploadBookingReceipt = async () => {
    if (!bookingReceiptFile) return initialCase?.booking_receipt_url ?? null;
    const filePath = `${userId}/${Date.now()}-${sanitizeFileName(bookingReceiptFile.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("cases")
      .upload(filePath, bookingReceiptFile, { upsert: true });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from("cases").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isReadOnly) {
      return;
    }

    setError(null);

    if (!userId) {
      setError("Missing user session.");
      return;
    }

    if (!formData.projectId) {
      setError("Please select a project.");
      return;
    }

    if (!formData.bookingDate) {
      setError("Please select the booking date.");
      return;
    }

    if (!isEditing && allowCaseOwnerSelection && !formData.caseOwnerId) {
      setError("Please select the case agent before proceeding.");
      return;
    }

    if (formData.race === "Other" && !formData.raceOther.trim()) {
      setError("Please specify the race.");
      return;
    }

    const normalizedCustomers = sanitizeCustomerDetails(formData.customers);

    if (normalizedCustomers.length === 0) {
      setError("Please add at least one customer detail.");
      return;
    }

    if (normalizedCustomers.some((customer) => !customer.name || !customer.id)) {
      setError("Each customer must have a name and IC/Passport.");
      return;
    }

    if (!isEditing && !bookingFormFile) {
      setError("Please attach the booking form PDF.");
      return;
    }

    if (!isEditing && customerIcFiles.some((file) => !file)) {
      setError("Please attach the customer I/C document for each customer.");
      return;
    }

    if (!isEditing && !bookingReceiptFile) {
      setError("Please attach the booking receipt.");
      return;
    }

    setIsSubmitting(true);

    try {
      let bookingFormUrl: string | null = initialCase?.booking_form_url ?? null;
      let customerIcUrls: string[] = formData.customers.map((customer) => customer.icUrl || "");
      let bookingReceiptUrl: string | null = initialCase?.booking_receipt_url ?? null;
      let loDraftUrl: string | null = initialCase?.lo_draft_url ?? null;
      let signedSpaUrl: string | null = initialCase?.signed_spa_url ?? null;

      try {
        bookingFormUrl = await uploadBookingForm();
      } catch (uploadError) {
        const uploadMessage = uploadError instanceof Error ? uploadError.message : String(uploadError ?? "");

        if (isRowLevelSecurityError(uploadMessage)) {
          setError("Booking form upload is blocked by Supabase storage policy. Please update storage.objects policy for bucket 'cases'.");
          setIsSubmitting(false);
          return;
        }

        throw uploadError;
      }

      try {
        loDraftUrl = await uploadLoDraft();
      } catch (uploadError) {
        const uploadMessage = uploadError instanceof Error ? uploadError.message : String(uploadError ?? "");

        if (isRowLevelSecurityError(uploadMessage)) {
          setError("LO Draft upload is blocked by Supabase storage policy. Please update storage.objects policy for bucket 'cases'.");
          setIsSubmitting(false);
          return;
        }

        throw uploadError;
      }

      try {
        signedSpaUrl = await uploadSignedSpa();
      } catch (uploadError) {
        const uploadMessage = uploadError instanceof Error ? uploadError.message : String(uploadError ?? "");

        if (isRowLevelSecurityError(uploadMessage)) {
          setError("Signed SPA upload is blocked by Supabase storage policy. Please update storage.objects policy for bucket 'cases'.");
          setIsSubmitting(false);
          return;
        }

        throw uploadError;
      }

      try {
        customerIcUrls = await uploadCustomerIcs();
      } catch (uploadError) {
        const uploadMessage = uploadError instanceof Error ? uploadError.message : String(uploadError ?? "");

        if (isRowLevelSecurityError(uploadMessage)) {
          setError("Customer I/C upload is blocked by Supabase storage policy. Please update storage.objects policy for bucket 'cases'.");
          setIsSubmitting(false);
          return;
        }

        throw uploadError;
      }

      try {
        bookingReceiptUrl = await uploadBookingReceipt();
      } catch (uploadError) {
        const uploadMessage = uploadError instanceof Error ? uploadError.message : String(uploadError ?? "");

        if (isRowLevelSecurityError(uploadMessage)) {
          setError("Booking receipt upload is blocked by Supabase storage policy. Please update storage.objects policy for bucket 'cases'.");
          setIsSubmitting(false);
          return;
        }

        throw uploadError;
      }

      const nextStatus = enableWorkflowFields && isEditing ? formData.status : "Pending";
      const nextSignedSpaStatus = isSignedSpaLocked
        ? "Complete"
        : getScopedSignedSpaStatus(formData.signedSpaStatus, effectiveSignedSpaOptions, "None");
      const nextCommissionStructure = selectedCommissionStructure;

      if (!nextCommissionStructure) {
        setError("Unable to determine the commission structure for this case.");
        setIsSubmitting(false);
        return;
      }

      if (enableWorkflowFields && nextStatus === "Signed LO" && !Boolean(loDraftFile || loDraftUrl)) {
        setError("Please upload the LO Draft successfully before changing the status to Signed LO.");
        setIsSubmitting(false);
        return;
      }

      const requiresSignedSpaAttachment =
        nextSignedSpaStatus === "Submit" || nextSignedSpaStatus === "Complete";

      if (enableWorkflowFields && requiresSignedSpaAttachment && !Boolean(signedSpaFile || signedSpaUrl)) {
        setError("Please upload the Signed SPA attachment before setting Signed SPA status to Submit or Complete.");
        setIsSubmitting(false);
        return;
      }

      const hasSignedLoAttachment = Boolean(loDraftFile || loDraftUrl);
      const signedLoDate = formData.signedLoDate.trim();

      const customersWithIc = normalizedCustomers.map((customer, index) => ({
        ...customer,
        icUrl: customerIcUrls[index] || "",
      }));

      if (enableWorkflowFields && hasSignedLoAttachment && !signedLoDate) {
        setError("Please select the Signed LO date after uploading the LO Draft.");
        setIsSubmitting(false);
        return;
      }

      if (enableWorkflowFields && nextStatus === "Signed LO" && !signedLoDate) {
        setError("Please select the Signed LO date before setting the case to Signed LO.");
        setIsSubmitting(false);
        return;
      }

      const directInvolvedIds = Array.from(
        new Set(
          [
            caseOwnerId,
            formData.involvedUserId || null,
          ].filter(Boolean)
        )
      ) as string[];

      const primaryCustomer = normalizedCustomers[0];

      const payload: {
        project_id: string;
        booking_date: string;
        spa_price: number | null;
        nett_price: number | null;
        booking_fee: number | null;
        unit_number: string;
        customer_name: string;
        customer_id: string;
        customer_contact_number: string;
        customer_email: string;
        customer_address: string;
        customer_details?: CustomerDetail[];
        emergency_contact_name: string;
        emergency_contact_relationship: string;
        emergency_contact_ic_passport: string;
        emergency_contact_number: string;
        emergency_contact_email: string;
        race: string;
        buyer_type: string;
        booking_form_url: string | null;
        customer_ic_url: string | null;
        booking_receipt_url: string | null;
        commission_structure: CommissionStructure;
        lo_draft_url?: string | null;
        signed_spa_url?: string | null;
        signed_lo_date?: string | null;
        signed_spa_status?: SignedSpaStatus;
        status?: SalesCaseStatus;
        created_by: string;
        involved_profile_id: string | null;
        involved_user_ids: string[];
        edited_at?: string | null;
        edited_by?: string | null;
        edit_reviewed_at?: string | null;
        edit_reviewed_by?: string | null;
      } = {
        project_id: formData.projectId,
        booking_date: formData.bookingDate,
        spa_price: toNumberOrNull(formData.spaPrice),
        nett_price: toNumberOrNull(formData.nettPrice),
        booking_fee: toNumberOrNull(formData.bookingFee),
        unit_number: formData.unitNumber,
        customer_name: normalizedCustomers.map((customer) => customer.name).join(" / "),
        customer_id: normalizedCustomers.map((customer) => customer.id).join(" / "),
        customer_contact_number: primaryCustomer.contactNumber,
        customer_email: primaryCustomer.email,
        customer_address: primaryCustomer.address,
        customer_details: customersWithIc,
        emergency_contact_name: formData.emergencyContactName,
        emergency_contact_relationship: formData.emergencyContactRelationship,
        emergency_contact_ic_passport: formData.emergencyContactIcPassport,
        emergency_contact_number: formData.emergencyContactNumber,
        emergency_contact_email: formData.emergencyContactEmail,
        race: formData.race === "Other" ? formData.raceOther : formData.race,
        buyer_type: formData.buyerType,
        booking_form_url: bookingFormUrl,
        customer_ic_url: customerIcUrls[0] || null,
        booking_receipt_url: bookingReceiptUrl,
        commission_structure: nextCommissionStructure,
        created_by: caseOwnerId,
        involved_profile_id: formData.involvedUserId || null,
        involved_user_ids: directInvolvedIds,
      };

      if (enableWorkflowFields) {
        payload.lo_draft_url = loDraftUrl;
        payload.signed_spa_url = signedSpaUrl;
        payload.signed_lo_date = signedLoDate || null;
        payload.status = nextStatus;
        payload.signed_spa_status = nextSignedSpaStatus;
      }

      if (isEditing && initialCase) {
        const previousStatus = normalizeCaseStatus(initialCase.status);
        payload.edited_at = new Date().toISOString();
        payload.edited_by = userId;
        payload.edit_reviewed_at = null;
        payload.edit_reviewed_by = null;

        let { error: updateError } = await supabase
          .from("sales_cases")
          .update(payload)
          .eq("id", initialCase.id);

        if (updateError && shouldRetryWithoutExtendedContactColumns(updateError.message)) {
          const { error: retryError } = await supabase
            .from("sales_cases")
            .update(stripExtendedContactColumns(payload))
            .eq("id", initialCase.id);
          updateError = retryError;
        }

        if (updateError) {
          setError(updateError.message);
          setIsSubmitting(false);
          return;
        }

        if (bookingFormFile && initialCase.booking_form_url) {
          await deleteBookingFormFromStorage(initialCase.booking_form_url);
        }

        if (customerIcFiles[0] && initialCase.customer_ic_url) {
          await deleteBookingFormFromStorage(initialCase.customer_ic_url);
        }

        if (bookingReceiptFile && initialCase.booking_receipt_url) {
          await deleteBookingFormFromStorage(initialCase.booking_receipt_url);
        }

        if (enableWorkflowFields && loDraftFile && initialCase.lo_draft_url) {
          await deleteBookingFormFromStorage(initialCase.lo_draft_url);
        }

        if (enableWorkflowFields && signedSpaFile && initialCase.signed_spa_url) {
          await deleteBookingFormFromStorage(initialCase.signed_spa_url);
        }

        try {
          const actorLabel = getNotificationProfileLabel(userId, profiles);
          const isCancelling = nextStatus === "Cancel" && previousStatus !== "Cancel";
          const hasNewLoDraft = enableWorkflowFields && Boolean(loDraftFile);
          const amountLabel = formatCommissionAmount(toNumberOrNull(formData.spaPrice) ?? 0);
          const title = isCancelling
            ? "Sales case cancelled"
            : hasNewLoDraft
              ? "Signed LO draft uploaded"
              : "Sales case updated";
          const message = isCancelling
            ? `${actorLabel} cancelled the sales case for ${selectedProject?.project_name || "Unnamed project"}, ${formData.unitNumber ? `Unit ${formData.unitNumber}` : "Unit -"}, SPA ${amountLabel}.`
            : hasNewLoDraft
              ? `${actorLabel} uploaded a signed LO draft for ${selectedProject?.project_name || "Unnamed project"}, ${formData.unitNumber ? `Unit ${formData.unitNumber}` : "Unit -"}, SPA ${amountLabel}.`
              : `${actorLabel} updated the sales case for ${selectedProject?.project_name || "Unnamed project"}, ${formData.unitNumber ? `Unit ${formData.unitNumber}` : "Unit -"}, SPA ${amountLabel}.`;

          await notifyCaseAudience({
            actorUserId: userId,
            salesCaseId: initialCase.id,
            caseOwnerId,
            involvedProfileId: formData.involvedUserId || null,
            title,
            message,
            profiles,
            commissionRows: commissionRows.map((row) => ({ profileId: row.profileId, type: row.type })),
          });
        } catch (notificationError) {
          console.error("Failed to create notifications for updated sales case", notificationError);
        }
      } else {
        let { data: insertedCase, error: submitError } = await supabase
          .from("sales_cases")
          .insert([payload])
          .select("id")
          .single();

        if (submitError && shouldRetryWithoutExtendedContactColumns(submitError.message)) {
          const retryResult = await supabase
            .from("sales_cases")
            .insert([stripExtendedContactColumns(payload)])
            .select("id")
            .single();
          insertedCase = retryResult.data;
          submitError = retryResult.error;
        }

        if (submitError && isRowLevelSecurityError(submitError.message)) {
          const rlsSafePayload = {
            ...payload,
            involved_user_ids: directInvolvedIds,
          };

          const retryResult = await supabase
            .from("sales_cases")
            .insert([rlsSafePayload])
            .select("id")
            .single();

          insertedCase = retryResult.data;
          submitError = retryResult.error;

          if (submitError && shouldRetryWithoutExtendedContactColumns(submitError.message)) {
            const retryLegacyResult = await supabase
              .from("sales_cases")
              .insert([stripExtendedContactColumns(rlsSafePayload)])
              .select("id")
              .single();

            insertedCase = retryLegacyResult.data;
            submitError = retryLegacyResult.error;
          }

          if (submitError && isRowLevelSecurityError(submitError.message)) {
            const creatorOwnedInvolvedIds = Array.from(
              new Set(
                [
                  userId,
                  caseOwnerId !== userId ? caseOwnerId : null,
                  formData.involvedUserId || null,
                ].filter(Boolean)
              )
            ) as string[];

            const creatorOwnedPayload = {
              ...rlsSafePayload,
              created_by: userId,
              involved_profile_id:
                caseOwnerId !== userId
                  ? caseOwnerId
                  : formData.involvedUserId || null,
              involved_user_ids: creatorOwnedInvolvedIds,
            };

            const retryCreatorOwnedResult = await supabase
              .from("sales_cases")
              .insert([creatorOwnedPayload])
              .select("id")
              .single();

            insertedCase = retryCreatorOwnedResult.data;
            submitError = retryCreatorOwnedResult.error;

            if (submitError && shouldRetryWithoutExtendedContactColumns(submitError.message)) {
              const retryCreatorOwnedLegacyResult = await supabase
                .from("sales_cases")
                .insert([stripExtendedContactColumns(creatorOwnedPayload)])
                .select("id")
                .single();

              insertedCase = retryCreatorOwnedLegacyResult.data;
              submitError = retryCreatorOwnedLegacyResult.error;
            }
          }
        }

        if (submitError) {
          setError(submitError.message);
          setIsSubmitting(false);
          return;
        }

        if (!insertedCase) {
          setError("Case was created but no case id was returned. Please refresh and check your latest case.");
          setIsSubmitting(false);
          return;
        }

        try {
          await createCaseNotifications({
            actorUserId: userId,
            salesCaseId: insertedCase.id,
            caseOwnerId,
            involvedProfileId: formData.involvedUserId || null,
            projectName: selectedProject?.project_name ?? null,
            unitNumber: formData.unitNumber || null,
            spaPrice: toNumberOrNull(formData.spaPrice),
            profiles,
            commissionRows: commissionRows.map((row) => ({ profileId: row.profileId, type: row.type })),
          });
        } catch (notificationError) {
          console.error("Failed to create notifications for new sales case", notificationError);
        }
      }

      setIsSubmitting(false);
      onSaved();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      setError(message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              {isReadOnly ? "View Sales Case" : isEditing ? "Edit Sales Case" : "New Sales Case"}
            </h3>
            <p className="text-xs text-gray-500">
              {isReadOnly
                ? "Review the case details below."
                : isEditing
                  ? "Update the case details."
                  : "Fill in the case details below."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-5">
          <fieldset disabled={isReadOnly} className="space-y-6 disabled:opacity-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isEditing && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Case Agent
                </label>
                <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
                  {getProfileLabel(creatorProfile)}
                </div>
              </div>
            )}
            {!isEditing && allowCaseOwnerSelection && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Case Agent
                </label>
                <select
                  name="caseOwnerId"
                  value={formData.caseOwnerId}
                  onChange={handleChange}
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white"
                  required
                >
                  <option value="" disabled>
                    Select member
                  </option>
                  {caseOwnerOptions.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {getProfileLabel(profile)}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-gray-500">
                  Choose the member who owns this case before filling in the rest of the form.
                </p>
              </div>
            )}
            {showWorkflowFields && (
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Case Status</label>
                  {allowStatusEdit ? (
                    <StatusSelect
                      value={formData.status}
                      options={statusOptions}
                      onChange={(status) => setFormData((prev) => ({ ...prev, status }))}
                    />
                  ) : (
                    <div
                      className={`rounded-lg border px-3 py-2.5 text-sm font-medium ${getCaseStatusClasses(currentStatus)}`}
                    >
                      {currentStatus}
                    </div>
                  )}
                  {allowStatusEdit && (
                    <p className="mt-2 text-xs text-gray-500">
                      Upload the LO Draft before setting the case to Signed LO.
                    </p>
                  )}

                </div>

                {(allowLoDraftUpload || initialCase?.lo_draft_url || isReadOnly) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">LO Draft (PDF)</label>
                    {allowLoDraftUpload ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:bg-gray-50">
                          <Upload className="w-4 h-4 text-gray-500" />
                          Upload LO Draft
                          <input
                            type="file"
                            accept="application/pdf"
                            onChange={handleLoDraftChange}
                            className="hidden"
                          />
                        </label>
                        <span className="text-xs text-gray-500">
                          {loDraftFile?.name || formData.loDraftName || "No file selected"}
                        </span>
                        {initialCase?.lo_draft_url && (
                          <a
                            href={initialCase.lo_draft_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs rounded-md border border-blue-200 px-2 py-1 text-blue-700 hover:text-blue-800"
                          >
                            View
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700">
                        {initialCase?.lo_draft_url ? (
                          <a
                            href={initialCase.lo_draft_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            View LO Draft
                          </a>
                        ) : (
                          <span className="text-gray-500">No file</span>
                        )}
                      </div>
                    )}

                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Signed LO Date</label>
                      <input
                        type="date"
                        name="signedLoDate"
                        value={formData.signedLoDate}
                        onChange={handleChange}
                        className="w-full rounded-lg border border-gray-200 p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white"
                        required={Boolean((allowLoDraftUpload && loDraftFile) || formData.status === "Signed LO")}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {showWorkflowFields && (
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Signed SPA</label>
                  <SignedSpaSelect
                    value={formData.signedSpaStatus}
                    options={isSignedSpaLocked ? (["Complete"] as const) : effectiveSignedSpaOptions}
                    onChange={(status) => setFormData((prev) => ({ ...prev, signedSpaStatus: status }))}
                    disabled={isSignedSpaLocked || isReadOnly}
                  />
                  <p className="mt-2 text-xs text-gray-600">
                    Signed SPA attachment is optional and can be submitted later.
                  </p>
                  {isSignedSpaLocked && (
                    <p className="mt-1 text-xs text-amber-700">
                      Signed SPA is marked as Complete and cannot be changed.
                    </p>
                  )}
                </div>

                {(allowLoDraftUpload || initialCase?.signed_spa_url || isReadOnly) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Signed SPA Attachment (PDF)</label>
                    {allowLoDraftUpload ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:bg-white/70 bg-white/50">
                          <Upload className="w-4 h-4 text-gray-500" />
                          Upload Signed SPA
                          <input
                            type="file"
                            accept="application/pdf"
                            onChange={handleSignedSpaChange}
                            className="hidden"
                          />
                        </label>
                        <span className="text-xs text-gray-600">
                          {signedSpaFile?.name || formData.signedSpaName || "No file selected"}
                        </span>
                        {initialCase?.signed_spa_url && (
                          <a
                            href={initialCase.signed_spa_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs rounded-md border border-blue-200 px-2 py-1 text-blue-700 hover:text-blue-800"
                          >
                            View
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700">
                        {initialCase?.signed_spa_url ? (
                          <a
                            href={initialCase.signed_spa_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            View Signed SPA
                          </a>
                        ) : (
                          <span className="text-gray-500">No file</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Booking Date</label>
              <input
                type="date"
                name="bookingDate"
                value={formData.bookingDate}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
              <select
                name="projectId"
                value={formData.projectId}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white"
                required
              >
                <option value="" disabled>
                  Select project
                </option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.project_name || "Untitled project"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Involved Salesperson
              </label>
              <select
                name="involvedUserId"
                value={formData.involvedUserId}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white"
              >
                <option value="">None</option>
                {involvedOptions.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {getProfileLabel(profile)}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-gray-500">
                If another salesperson is involved, select them here.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SPA Price (RM)</label>
              <input
                type="number"
                name="spaPrice"
                value={formData.spaPrice}
                onChange={handleChange}
                placeholder="e.g. 500000"
                className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nett Price (RM)</label>
              <input
                type="number"
                name="nettPrice"
                value={formData.nettPrice}
                onChange={handleChange}
                placeholder="e.g. 450000"
                className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Booking Fee (RM)</label>
              <input
                type="number"
                name="bookingFee"
                value={formData.bookingFee}
                onChange={handleChange}
                placeholder="e.g. 1000"
                className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Number</label>
              <input
                type="text"
                name="unitNumber"
                value={formData.unitNumber}
                onChange={handleChange}
                placeholder="e.g. A-12-01"
                className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                required
              />
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-gray-100 bg-gray-50/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-base font-semibold text-gray-800">Customer Details</h4>
              <button
                type="button"
                onClick={addCustomerDetail}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <Plus className="h-4 w-4" />
                Add Customer
              </button>
            </div>

            <div className="space-y-4">
              {formData.customers.map((customer, index) => (
                <div key={`customer-${index}`} className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-semibold text-gray-700">Customer {index + 1}</h5>
                    {formData.customers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCustomerDetail(index)}
                        className="inline-flex items-center gap-1 text-xs rounded-md border border-red-200 px-2 py-1 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                      <input
                        type="text"
                        value={customer.name}
                        onChange={(event) => handleCustomerChange(index, "name", event.target.value)}
                        placeholder="e.g. John Doe"
                        className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer IC / Passport
                      </label>
                      <input
                        type="text"
                        value={customer.id}
                        onChange={(event) => handleCustomerChange(index, "id", event.target.value)}
                        placeholder="e.g. 900101-01-1234"
                        className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer Contact Number
                      </label>
                      <input
                        type="text"
                        value={customer.contactNumber}
                        onChange={(event) => handleCustomerChange(index, "contactNumber", event.target.value)}
                        placeholder="e.g. 012-3456789"
                        className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Customer Email</label>
                      <input
                        type="email"
                        value={customer.email}
                        onChange={(event) => handleCustomerChange(index, "email", event.target.value)}
                        placeholder="e.g. john.doe@example.com"
                        className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Customer Address</label>
                    <input
                      type="text"
                      value={customer.address}
                      onChange={(event) => handleCustomerChange(index, "address", event.target.value)}
                      placeholder="e.g. 123, Jalan Ampang, 50450 Kuala Lumpur"
                      className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Attach Customer I/C (PDF/Image)</label>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:bg-gray-50">
                        <Upload className="w-4 h-4 text-gray-500" />
                        Upload File
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          onChange={(event) => handleCustomerIcChange(index, event)}
                          className="hidden"
                        />
                      </label>
                      <span className="text-xs text-gray-500">
                        {customerIcFiles[index]?.name || customer.icUrl.split("/").pop() || "No file selected"}
                      </span>
                      {customer.icUrl && (
                        <a
                          href={customer.icUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs rounded-md border border-blue-200 px-2 py-1 text-blue-700 hover:text-blue-800"
                        >
                          View
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-gray-100 bg-gray-50/60 p-4">
            <h4 className="text-base font-semibold text-gray-800">Emergency Contact</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  name="emergencyContactName"
                  value={formData.emergencyContactName}
                  onChange={handleChange}
                  placeholder="e.g. Jane Doe"
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
                <input
                  type="text"
                  name="emergencyContactRelationship"
                  value={formData.emergencyContactRelationship}
                  onChange={handleChange}
                  placeholder="e.g. Spouse"
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IC / Passport</label>
                <input
                  type="text"
                  name="emergencyContactIcPassport"
                  value={formData.emergencyContactIcPassport}
                  onChange={handleChange}
                  placeholder="e.g. 900101-01-1234"
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                <input
                  type="text"
                  name="emergencyContactNumber"
                  value={formData.emergencyContactNumber}
                  onChange={handleChange}
                  placeholder="e.g. 012-3456789"
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                name="emergencyContactEmail"
                value={formData.emergencyContactEmail}
                onChange={handleChange}
                placeholder="e.g. jane.doe@example.com"
                className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Race</label>
              <select
                name="race"
                value={formData.race}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white"
              >
                {["Malay", "Chinese", "Indian", "Other"].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            {formData.race === "Other" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Other Race</label>
                <input
                  type="text"
                  name="raceOther"
                  value={formData.raceOther}
                  onChange={handleChange}
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                  required
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buyer Type</label>
              <select
                name="buyerType"
                value={formData.buyerType}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white"
              >
                {["Loan", "Cash"].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Attach Booking Form (PDF)</label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:bg-gray-50">
                  <Upload className="w-4 h-4 text-gray-500" />
                  Upload PDF
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleBookingFormChange}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-gray-500">
                  {formData.bookingFormName || "No file selected"}
                </span>
                {initialCase?.booking_form_url && (
                  <a
                    href={initialCase.booking_form_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs rounded-md border border-blue-200 px-2 py-1 text-blue-700 hover:text-blue-800"
                  >
                    View
                  </a>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Upload only the booking form document.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Attach Booking Receipt (PDF/Image)</label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:bg-gray-50">
                  <Upload className="w-4 h-4 text-gray-500" />
                  Upload File
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={handleBookingReceiptChange}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-gray-500">
                  {formData.bookingReceiptName || "No file selected"}
                </span>
                {initialCase?.booking_receipt_url && (
                  <a
                    href={initialCase.booking_receipt_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs rounded-md border border-blue-200 px-2 py-1 text-blue-700 hover:text-blue-800"
                  >
                    View
                  </a>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                New cases require booking form, customer I/C, and booking receipt uploads.
              </p>
            </div>
          </div>

          {selectedProject && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-5">
              <div>
                <h4 className="text-sm font-semibold text-gray-800">Commission Breakdown</h4>
                <p className="text-xs text-gray-500 mt-1">
                  Based on nett price and split equally across the eligible members in each rank.
                </p>
                {selectedCommissionStructure && (
                  <p className="text-xs text-gray-500 mt-1">
                    Selected structure: {getCommissionStructureLabel(selectedCommissionStructure)}
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <h5 className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    Direct Commission Calculation
                  </h5>
                  <div className="mt-2 space-y-2">
                    {commissionRows.length > 0 ? (
                      commissionRows.map((row) => (
                        <div
                          key={`direct-${row.id}`}
                          className="flex items-center justify-between rounded-lg bg-white px-3 py-2 border border-gray-100 text-sm"
                        >
                          <div>
                            <div className="font-medium text-gray-800">{row.label}</div>
                            <div className="text-xs text-gray-500">
                              {commissionTypeLabel[row.type]} • {row.rank.replace("_", " ")}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-gray-800">
                              {formatCommissionPercentage(row.percentage)}%
                            </div>
                            <div className="text-xs text-gray-500">{formatCommissionAmount(row.amount)}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg bg-white px-3 py-2 border border-gray-100 text-sm text-gray-500">
                        No direct commission applies yet.
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {paidReceiptRows.length > 0 && (
                <div className="border-t border-gray-200 pt-5">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-800">Payout Receipts</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Admin and super admin can review and download any receipt that has already been uploaded after the payout is marked as paid.
                    </p>
                  </div>

                  <div className="mt-4 space-y-2">
                    {paidReceiptRows.map((receiptRow) => (
                      <div
                        key={receiptRow.id}
                        className="flex items-center justify-between rounded-lg bg-white px-3 py-2 border border-gray-100 text-sm"
                      >
                        <div>
                          <div className="font-medium text-gray-800">{receiptRow.memberLabel}</div>
                          <div className="text-xs text-gray-500">
                            {receiptRow.paidAt ? new Date(receiptRow.paidAt).toLocaleDateString() : "Paid receipt"}
                          </div>
                          <div className="text-xs text-gray-500">
                            Gross Amount: {formatCommissionAmount(receiptRow.grossAmount)}
                          </div>
                        </div>
                        <a
                          href={receiptRow.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          Download Receipt
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          </fieldset>

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              {isReadOnly ? "Close" : "Cancel"}
            </button>
            {!isReadOnly && isEditing && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )}
            {!isReadOnly && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                <Save className="w-4 h-4" />
                {isSubmitting ? "Saving..." : isEditing ? "Save Changes" : "Save Case"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
