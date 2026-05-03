import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Download, Trash2, RefreshCw } from "lucide-react";
import { Layout } from "@/components/Layout";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/components/shared/TablePagination";

interface EmployeeRow {
  id: number;
  matricule: string;
  prenom: string;
  nom: string;
  fonction: string;
  divisionId: number;
  divisionName?: string;
  serviceId: number;
  serviceName?: string;
  equipeId: number;
  equipeName?: string;
  stCodes?: string[];
  htCodes?: string[];
  numero?: string;
  dateValidation?: string;
  dateExpiration?: string;
  status: string;
  deleted: boolean;
}

interface Division {
  id: number;
  name: string;
}

interface Service {
  id: number;
  name: string;
  divisionId: number;
}

interface Equipe {
  id: number;
  name: string;
  serviceId: number;
}

export default function Employees() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [colorCodingEnabled, setColorCodingEnabled] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDivision, setFilterDivision] = useState<string>("all");
  const [filterService, setFilterService] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // Fetch employees and org structure
  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setIsLoading(true);

      // Fetch employees
      const empRes = await fetch("/api/employees");
      if (!empRes.ok) throw new Error("Failed to fetch employees");
      const empData: EmployeeRow[] = await empRes.json();

      // Fetch divisions
      const divRes = await fetch("/api/divisions");
      if (!divRes.ok) throw new Error("Failed to fetch divisions");
      const divData: Division[] = await divRes.json();

      // Fetch services
      const svcRes = await fetch("/api/services");
      if (!svcRes.ok) throw new Error("Failed to fetch services");
      const svcData: Service[] = await svcRes.json();

      // Fetch equipes
      const eqpRes = await fetch("/api/equipes");
      if (!eqpRes.ok) throw new Error("Failed to fetch equipes");
      const eqpData: Equipe[] = await eqpRes.json();

      // Enrich employees with org structure names
      const enrichedEmployees = empData.map((emp) => ({
        ...emp,
        divisionName: divData.find((d) => d.id === emp.divisionId)?.name,
        serviceName: svcData.find((s) => s.id === emp.serviceId)?.name,
        equipeName: eqpData.find((e) => e.id === emp.equipeId)?.name,
      }));

      setEmployees(enrichedEmployees.filter((e) => !e.deleted)); // Hide soft-deleted
      setDivisions(divData);
      setServices(svcData);
      setEquipes(eqpData);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast({
        title: "Error",
        description: "Failed to load employees",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  // Filter employees
  const filteredEmployees = employees.filter((emp) => {
    // Search filter
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      emp.matricule.toLowerCase().includes(searchLower) ||
      emp.nom.toLowerCase().includes(searchLower) ||
      emp.prenom.toLowerCase().includes(searchLower) ||
      emp.fonction.toLowerCase().includes(searchLower);

    if (!matchesSearch) return false;

    // Division filter
    if (filterDivision !== "all" && emp.divisionName !== filterDivision)
      return false;

    // Service filter
    if (
      filterService !== "all" &&
      emp.serviceName !== filterService
    )
      return false;

    // Status filter
    if (filterStatus !== "all" && emp.status !== filterStatus) return false;

    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredEmployees.length / pageSize);
  const paginatedEmployees = filteredEmployees.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  // Get filtered services based on selected division
  const filteredServices =
    filterDivision === "all"
      ? services
      : services.filter((s) => {
          const div = divisions.find((d) => d.name === filterDivision);
          return div && s.divisionId === div.id;
        });

  // Get expiration color
  function getExpirationColor(
    dateExpiration: string | undefined
  ): string {
    if (!dateExpiration) return "";

    const today = new Date();
    const expirationDate = new Date(dateExpiration);
    const daysUntilExpiration = Math.floor(
      (expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (expirationDate < today) return "text-red-900 bg-red-100"; // Expired
    if (daysUntilExpiration < 90) return "text-red-700 bg-red-50"; // Critical
    if (daysUntilExpiration < 180) return "text-orange-700 bg-orange-50"; // Warning
    if (daysUntilExpiration < 270) return "text-yellow-700 bg-yellow-50"; // Caution

    return ""; // Normal
  }

  // Format habilitations display
  function formatHabilitations(emp: EmployeeRow): string {
    const parts: string[] = [];

    if (emp.stCodes && emp.stCodes.length > 0) {
      parts.push(`ST: ${emp.stCodes.join(", ")}`);
    }

    if (emp.htCodes && emp.htCodes.length > 0) {
      parts.push(`HT: ${emp.htCodes.join(", ")}`);
    }

    return parts.join(" / ");
  }

  // Format date as DD/MM/YYYY
  function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  // Handle row selection
  function toggleRowSelection(employeeId: number) {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(employeeId)) {
      newSelected.delete(employeeId);
    } else {
      newSelected.add(employeeId);
    }
    setSelectedRows(newSelected);
  }

  // Handle select all
  function toggleSelectAll() {
    if (selectedRows.size === paginatedEmployees.length) {
      setSelectedRows(new Set());
    } else {
      const allIds = new Set(paginatedEmployees.map((e) => e.id));
      setSelectedRows(allIds);
    }
  }

  // Handle bulk delete
  async function handleBulkDelete() {
    const matricules = Array.from(selectedRows)
      .map((id) => employees.find((e) => e.id === id)?.matricule)
      .filter(Boolean);

    if (matricules.length === 0) return;

    try {
      for (const matricule of matricules) {
        await fetch(`/api/employees/${matricule}`, {
          method: "DELETE",
        });
      }

      toast({
        title: "Success",
        description: `${matricules.length} employee(s) moved to trash`,
      });

      setSelectedRows(new Set());
      await fetchData();
    } catch (error) {
      console.error("Failed to delete employees:", error);
      toast({
        title: "Error",
        description: "Failed to delete employees",
        variant: "destructive",
      });
    }
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <LoadingSpinner />
        </div>
      </Layout>
    );
  }

  if (employees.length === 0) {
    return (
      <Layout>
        <EmptyState
          title="No employees"
          description="Get started by adding your first employee"
          action={
            <Link to="/add-employee">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Employee
              </Button>
            </Link>
          }
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Employees</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Link to="/add-employee">
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Employee
              </Button>
            </Link>
          </div>
        </div>

        {/* Bulk actions toolbar */}
        {selectedRows.size > 0 && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded border border-blue-200">
            <span className="text-sm font-medium">
              {selectedRows.size} selected
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkDelete}
              className="ml-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedRows(new Set())}
            >
              Clear
            </Button>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <Input
            placeholder="Search matricule, nom, prénom, fonction..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="flex-1 min-w-[300px]"
          />

          <Select value={filterDivision} onValueChange={setFilterDivision}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Division" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Divisions</SelectItem>
              {divisions.map((d) => (
                <SelectItem key={d.id} value={d.name}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterService} onValueChange={setFilterService}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              {filteredServices.map((s) => (
                <SelectItem key={s.id} value={s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
              <SelectItem value="PENDING_RENEWAL">Pending Renewal</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setColorCodingEnabled(!colorCodingEnabled)}
          >
            {colorCodingEnabled ? "Hide" : "Show"} Color Coding
          </Button>
        </div>

        {/* Results info */}
        <div className="text-sm text-gray-600">
          Showing {paginatedEmployees.length} of {filteredEmployees.length} employees
          {filteredEmployees.length !== employees.length && ` (${employees.length} total)`}
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      selectedRows.size === paginatedEmployees.length &&
                      paginatedEmployees.length > 0
                    }
                    onChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="font-semibold">Nom</TableHead>
                <TableHead className="font-semibold">Matricule</TableHead>
                <TableHead className="font-semibold">Division</TableHead>
                <TableHead className="font-semibold">Service</TableHead>
                <TableHead className="font-semibold">Équipe</TableHead>
                <TableHead className="font-semibold">Fonction</TableHead>
                <TableHead className="font-semibold">Habilitations</TableHead>
                <TableHead className="font-semibold">Date Valid.</TableHead>
                <TableHead className="font-semibold">Date Expir.</TableHead>
                <TableHead className="font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedEmployees.map((emp) => (
                <TableRow
                  key={emp.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => navigate(`/employee/${emp.id}`)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedRows.has(emp.id)}
                      onChange={() => toggleRowSelection(emp.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {emp.prenom} {emp.nom}
                  </TableCell>
                  <TableCell>{emp.matricule}</TableCell>
                  <TableCell>{emp.divisionName || "-"}</TableCell>
                  <TableCell>{emp.serviceName || "-"}</TableCell>
                  <TableCell>{emp.equipeName || "-"}</TableCell>
                  <TableCell>{emp.fonction}</TableCell>
                  <TableCell className="text-sm">
                    {formatHabilitations(emp) || "-"}
                  </TableCell>
                  <TableCell>{formatDate(emp.dateValidation)}</TableCell>
                  <TableCell
                    className={cn(
                      "font-medium rounded px-2 py-1",
                      colorCodingEnabled && getExpirationColor(emp.dateExpiration)
                    )}
                  >
                    {formatDate(emp.dateExpiration)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Link to={`/employee/${emp.id}`}>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          totalItems={filteredEmployees.length}
        />
      </div>
    </Layout>
  );
}
