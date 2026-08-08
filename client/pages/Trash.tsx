import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface DeletedEmployee {
  id: number;
  matricule: string;
  prenom: string;
  nom: string;
  fonction: string;
  divisionName?: string;
  serviceName?: string;
  deleted: boolean;
  deletedAt?: string;
}

export default function Trash() {
  const { toast } = useToast();
  const [deletedEmployees, setDeletedEmployees] = useState<DeletedEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDivision, setFilterDivision] = useState<string>("all");
  const [divisions, setDivisions] = useState<any[]>([]);

  // Dialogs
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState<{
    open: boolean;
    employeeId?: number;
    matricule?: string;
  }>({ open: false });
  const [matriculeConfirm, setMatriculeConfirm] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setIsLoading(true);

      // Fetch deleted employees
      const empRes = await fetch("/api/employees?deleted=true");
      if (!empRes.ok) throw new Error("Failed to fetch deleted employees");
      const empData = await empRes.json();

      // Fetch divisions for display
      const divRes = await fetch("/api/divisions");
      if (!divRes.ok) throw new Error("Failed to fetch divisions");
      const divData = await divRes.json();

      setDivisions(divData);
      setDeletedEmployees(empData);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast({
        title: "Error",
        description: "Failed to load trash",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  // Filter employees
  const filteredEmployees = deletedEmployees.filter((emp) => {
    // Search filter
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      emp.matricule.toLowerCase().includes(searchLower) ||
      emp.nom.toLowerCase().includes(searchLower) ||
      emp.prenom.toLowerCase().includes(searchLower);

    if (!matchesSearch) return false;

    // Division filter
    if (filterDivision !== "all" && emp.divisionName !== filterDivision)
      return false;

    return true;
  });

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
    if (selectedRows.size === filteredEmployees.length) {
      setSelectedRows(new Set());
    } else {
      const allIds = new Set(filteredEmployees.map((e) => e.id));
      setSelectedRows(allIds);
    }
  }

  // Restore employee
  async function restoreEmployee(id: number) {
    try {
      const emp = deletedEmployees.find((e) => e.id === id);
      if (!emp) return;

      const res = await fetch(`/api/employees/${emp.matricule}/restore`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Failed to restore employee");
      }

      toast({
        title: "Success",
        description: `${emp.prenom} ${emp.nom} has been restored`,
      });

      await fetchData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to restore employee";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    }
  }

  // Bulk restore
  async function handleBulkRestore() {
    const matricules = Array.from(selectedRows)
      .map((id) => deletedEmployees.find((e) => e.id === id)?.matricule)
      .filter(Boolean);

    if (matricules.length === 0) return;

    try {
      for (const matricule of matricules) {
        await fetch(`/api/employees/${matricule}/restore`, {
          method: "POST",
        });
      }

      toast({
        title: "Success",
        description: `${matricules.length} employee(s) restored`,
      });

      setSelectedRows(new Set());
      await fetchData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to restore employees";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    }
  }

  // Permanently delete employee
  async function permanentlyDeleteEmployee() {
    if (!permanentDeleteConfirm.employeeId) return;
    if (matriculeConfirm !== permanentDeleteConfirm.matricule) {
      toast({
        title: "Error",
        description: "Matricule does not match",
        variant: "destructive",
      });
      return;
    }

    try {
      const emp = deletedEmployees.find((e) => e.id === permanentDeleteConfirm.employeeId);
      if (!emp) return;

      const res = await fetch(`/api/employees/${emp.matricule}/permanent-delete`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to permanently delete employee");
      }

      toast({
        title: "Success",
        description: `${emp.prenom} ${emp.nom} has been permanently deleted`,
      });

      setPermanentDeleteConfirm({ open: false });
      setMatriculeConfirm("");
      await fetchData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete employee";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    }
  }

  // Format date
  function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
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

  if (deletedEmployees.length === 0) {
    return (
      <Layout>
        <div className="flex items-center gap-2 mb-6">
          <Link to="/employees">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Trash</h1>
        </div>

        <EmptyState
          title="No deleted employees"
          description="Deleted employees will appear here"
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/employees">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </Link>
            <h1 className="text-3xl font-bold">Trash</h1>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
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
              onClick={handleBulkRestore}
              className="ml-auto"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restore All
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
            placeholder="Search matricule, nom, prénom..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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
        </div>

        {/* Results info */}
        <div className="text-sm text-gray-600">
          Showing {filteredEmployees.length} of {deletedEmployees.length} deleted employees
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      selectedRows.size === filteredEmployees.length &&
                      filteredEmployees.length > 0
                    }
                    onChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="font-semibold">Matricule</TableHead>
                <TableHead className="font-semibold">Nom</TableHead>
                <TableHead className="font-semibold">Prénom</TableHead>
                <TableHead className="font-semibold">Fonction</TableHead>
                <TableHead className="font-semibold">Division</TableHead>
                <TableHead className="font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.map((emp) => (
                <TableRow key={emp.id} className="hover:bg-gray-50">
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedRows.has(emp.id)}
                      onChange={() => toggleRowSelection(emp.id)}
                    />
                  </TableCell>
                  <TableCell>{emp.matricule}</TableCell>
                  <TableCell>{emp.nom}</TableCell>
                  <TableCell>{emp.prenom}</TableCell>
                  <TableCell>{emp.fonction}</TableCell>
                  <TableCell>{emp.divisionName || "-"}</TableCell>
                  <TableCell className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => restoreEmployee(emp.id)}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Restore
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        setPermanentDeleteConfirm({
                          open: true,
                          employeeId: emp.id,
                          matricule: emp.matricule,
                        })
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Permanent Delete Confirmation Dialog */}
      <ConfirmDialog
        open={permanentDeleteConfirm.open}
        onOpenChange={(open) =>
          setPermanentDeleteConfirm({ ...permanentDeleteConfirm, open })
        }
        title="Permanently Delete Employee"
        description={`Are you sure you want to permanently delete this employee? This cannot be undone. Type the matricule to confirm: ${permanentDeleteConfirm.matricule}`}
        onConfirm={() => permanentlyDeleteEmployee()}
      >
        <Input
          placeholder={`Type ${permanentDeleteConfirm.matricule} to confirm`}
          value={matriculeConfirm}
          onChange={(e) => setMatriculeConfirm(e.target.value)}
          className="my-4"
        />
      </ConfirmDialog>
    </Layout>
  );
}
