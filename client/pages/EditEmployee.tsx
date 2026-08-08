import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, AlertCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";

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

interface Employee {
  id: number;
  matricule: string;
  nom: string;
  prenom: string;
  fonction: string;
  divisionId: number;
  serviceId: number;
  equipeId: number;
  status: string;
  habilitations?: Habilitation[];
}

interface Habilitation {
  id: number;
  stCodes: string[];
  htCodes: string[];
  numero: string;
  dateValidation: string;
  dateExpiration: string;
  pdfPath?: string;
}

interface FormData {
  fonction: string;
  divisionId: string;
  serviceId: string;
  equipeId: string;
  stCodes: string[];
  htCodes: string[];
  numero: string;
  dateValidation: string;
  dateExpiration: string;
}

interface Errors {
  [key: string]: string;
}

const HT_CODES = ["H1V", "H2V", "B1V", "B2V", "HC", "H1N"];
const ST_CODES = ["H1N", "H1V", "H2N", "H2V"];

export default function EditEmployee() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    fonction: "",
    divisionId: "",
    serviceId: "",
    equipeId: "",
    stCodes: [],
    htCodes: [],
    numero: "",
    dateValidation: "",
    dateExpiration: "",
  });

  useEffect(() => {
    fetchData();
  }, [id]);

  // Update services when division changes
  useEffect(() => {
    if (formData.divisionId) {
      const divisionIdNum = parseInt(formData.divisionId);
      const filteredServices = services.filter(
        (s) => s.divisionId === divisionIdNum
      );
      setFormData((prev) => ({
        ...prev,
        serviceId: "",
        equipeId: "",
      }));
    }
  }, [formData.divisionId]);

  // Update equipes when service changes
  useEffect(() => {
    if (formData.serviceId) {
      setFormData((prev) => ({
        ...prev,
        equipeId: "",
      }));
    }
  }, [formData.serviceId]);

  async function fetchData() {
    try {
      const [empRes, divRes, svcRes, eqpRes] = await Promise.all([
        fetch(`/api/employees/${id}`),
        fetch("/api/divisions"),
        fetch("/api/services"),
        fetch("/api/equipes"),
      ]);

      if (!empRes.ok) throw new Error("Failed to fetch employee");

      const empData = await empRes.json();
      const divData = await divRes.json();
      const svcData = await svcRes.json();
      const eqpData = await eqpRes.json();

      setEmployee(empData);
      setDivisions(divData);
      setServices(svcData);
      setEquipes(eqpData);

      // Initialize form with employee data
      if (empData.habilitations && empData.habilitations.length > 0) {
        const hab = empData.habilitations[0];
        setFormData({
          fonction: empData.fonction,
          divisionId: String(empData.divisionId),
          serviceId: String(empData.serviceId),
          equipeId: String(empData.equipeId),
          stCodes: Array.isArray(hab.stCodes) ? hab.stCodes : [],
          htCodes: Array.isArray(hab.htCodes) ? hab.htCodes : [],
          numero: hab.numero || "",
          dateValidation: hab.dateValidation || "",
          dateExpiration: hab.dateExpiration || "",
        });
      } else {
        setFormData({
          fonction: empData.fonction,
          divisionId: String(empData.divisionId),
          serviceId: String(empData.serviceId),
          equipeId: String(empData.equipeId),
          stCodes: [],
          htCodes: [],
          numero: "",
          dateValidation: "",
          dateExpiration: "",
        });
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast({
        title: "Error",
        description: "Failed to load employee",
        variant: "destructive",
      });
      navigate("/employees");
    } finally {
      setIsLoading(false);
    }
  }

  function validateForm(): boolean {
    const newErrors: Errors = {};

    if (!formData.fonction.trim()) {
      newErrors.fonction = "Fonction is required";
    }

    if (!formData.divisionId) {
      newErrors.divisionId = "Division is required";
    }

    if (!formData.serviceId) {
      newErrors.serviceId = "Service is required";
    }

    if (!formData.equipeId) {
      newErrors.equipeId = "Équipe is required";
    }

    if (formData.htCodes.length === 0 && formData.stCodes.length === 0) {
      newErrors.codes = "At least one HT code is required";
    }

    if (!formData.dateValidation) {
      newErrors.dateValidation = "Date validation is required";
    }

    if (!formData.dateExpiration) {
      newErrors.dateExpiration = "Date expiration is required";
    }

    if (formData.dateValidation && formData.dateExpiration) {
      const validation = new Date(formData.dateValidation);
      const expiration = new Date(formData.dateExpiration);

      if (expiration <= validation) {
        newErrors.dateExpiration =
          "Expiration date must be after validation date";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors in the form",
        variant: "destructive",
      });
      return;
    }

    if (!employee || !employee.habilitations) return;

    setIsSaving(true);

    try {
      // Update employee
      const empRes = await fetch(`/api/employees/${employee.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fonction: formData.fonction,
          divisionId: parseInt(formData.divisionId),
          serviceId: parseInt(formData.serviceId),
          equipeId: parseInt(formData.equipeId),
        }),
      });

      if (!empRes.ok) {
        throw new Error("Failed to update employee");
      }

      // Update habilitation
      const hab = employee.habilitations[0];
      const habRes = await fetch(`/api/habilitations/${hab.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stCodes: formData.stCodes,
          htCodes: formData.htCodes,
          numero: formData.numero,
          dateValidation: formData.dateValidation,
          dateExpiration: formData.dateExpiration,
        }),
      });

      if (!habRes.ok) {
        throw new Error("Failed to update habilitation");
      }

      toast({
        title: "Success",
        description: "Employee updated successfully",
      });

      navigate(`/employee/${employee.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save changes";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!employee) return;

    setIsSaving(true);

    try {
      const res = await fetch(`/api/employees/${employee.matricule}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete employee");
      }

      toast({
        title: "Success",
        description: "Employee moved to trash",
      });

      navigate("/employees");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete employee";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading || !employee) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <p>Loading...</p>
        </div>
      </Layout>
    );
  }

  const filteredServices = services.filter(
    (s) => formData.divisionId && s.divisionId === parseInt(formData.divisionId)
  );

  const filteredEquipes = equipes.filter(
    (e) => formData.serviceId && e.serviceId === parseInt(formData.serviceId)
  );

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <Link to={`/employee/${employee.id}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Edit Employee</h1>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Employee Info Section (Read-Only) */}
          <Card>
            <CardHeader>
              <CardTitle>Employee Information (Immutable)</CardTitle>
              <CardDescription>
                These fields cannot be changed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-500">Matricule</Label>
                  <p className="font-medium">{employee.matricule}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Nom</Label>
                  <p className="font-medium">{employee.nom}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Prénom</Label>
                  <p className="font-medium">{employee.prenom}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Status</Label>
                  <p className="font-medium">{employee.status}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Organization Section (Editable) */}
          <Card>
            <CardHeader>
              <CardTitle>Organization</CardTitle>
              <CardDescription>
                Update employee organization assignment
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fonction">Fonction *</Label>
                <Input
                  id="fonction"
                  value={formData.fonction}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      fonction: e.target.value,
                    }))
                  }
                  className={errors.fonction ? "border-red-500" : ""}
                />
                {errors.fonction && (
                  <p className="text-sm text-red-500">{errors.fonction}</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="division">Division *</Label>
                  <Select
                    value={formData.divisionId}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        divisionId: value,
                      }))
                    }
                  >
                    <SelectTrigger
                      id="division"
                      className={errors.divisionId ? "border-red-500" : ""}
                    >
                      <SelectValue placeholder="Select division" />
                    </SelectTrigger>
                    <SelectContent>
                      {divisions.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.divisionId && (
                    <p className="text-sm text-red-500">{errors.divisionId}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="service">Service *</Label>
                  <Select
                    value={formData.serviceId}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        serviceId: value,
                      }))
                    }
                    disabled={!formData.divisionId}
                  >
                    <SelectTrigger
                      id="service"
                      className={errors.serviceId ? "border-red-500" : ""}
                    >
                      <SelectValue placeholder="Select service" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredServices.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.serviceId && (
                    <p className="text-sm text-red-500">{errors.serviceId}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="equipe">Équipe *</Label>
                  <Select
                    value={formData.equipeId}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        equipeId: value,
                      }))
                    }
                    disabled={!formData.serviceId}
                  >
                    <SelectTrigger
                      id="equipe"
                      className={errors.equipeId ? "border-red-500" : ""}
                    >
                      <SelectValue placeholder="Select équipe" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredEquipes.map((e) => (
                        <SelectItem key={e.id} value={String(e.id)}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.equipeId && (
                    <p className="text-sm text-red-500">{errors.equipeId}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Habilitations Section */}
          <Card>
            <CardHeader>
              <CardTitle>Habilitations</CardTitle>
              <CardDescription>
                Update certification codes and dates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {errors.codes && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{errors.codes}</AlertDescription>
                </Alert>
              )}

              {/* HT Codes */}
              <div className="space-y-2">
                <Label>HT Codes</Label>
                <div className="flex flex-wrap gap-2">
                  {HT_CODES.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => {
                        setFormData((prev) => {
                          const hasCode = prev.htCodes.includes(code);
                          return {
                            ...prev,
                            htCodes: hasCode
                              ? prev.htCodes.filter((c) => c !== code)
                              : [...prev.htCodes, code],
                          };
                        });
                      }}
                      className={`px-3 py-2 rounded border transition-colors ${
                        formData.htCodes.includes(code)
                          ? "bg-blue-500 text-white border-blue-600"
                          : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
                      }`}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>

              {/* ST Codes */}
              <div className="space-y-2">
                <Label>ST Codes (Optional)</Label>
                <div className="flex flex-wrap gap-2">
                  {ST_CODES.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => {
                        setFormData((prev) => {
                          const hasCode = prev.stCodes.includes(code);
                          return {
                            ...prev,
                            stCodes: hasCode
                              ? prev.stCodes.filter((c) => c !== code)
                              : [...prev.stCodes, code],
                          };
                        });
                      }}
                      className={`px-3 py-2 rounded border transition-colors ${
                        formData.stCodes.includes(code)
                          ? "bg-green-500 text-white border-green-600"
                          : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
                      }`}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>

              {/* Numero */}
              <div className="space-y-2">
                <Label htmlFor="numero">
                  Titre d&apos;habilitation (N°)
                </Label>
                <Input
                  id="numero"
                  value={formData.numero}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      numero: e.target.value,
                    }))
                  }
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dateValidation">Date Validation *</Label>
                  <Input
                    id="dateValidation"
                    type="date"
                    value={formData.dateValidation}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        dateValidation: e.target.value,
                      }))
                    }
                    className={errors.dateValidation ? "border-red-500" : ""}
                  />
                  {errors.dateValidation && (
                    <p className="text-sm text-red-500">
                      {errors.dateValidation}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dateExpiration">Date Expiration *</Label>
                  <Input
                    id="dateExpiration"
                    type="date"
                    value={formData.dateExpiration}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        dateExpiration: e.target.value,
                      }))
                    }
                    className={errors.dateExpiration ? "border-red-500" : ""}
                  />
                  {errors.dateExpiration && (
                    <p className="text-sm text-red-500">
                      {errors.dateExpiration}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Employee
            </Button>

            <div className="flex gap-3">
              <Link to={`/employee/${employee.id}`}>
                <Button variant="outline" type="button">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </form>

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Delete Employee"
          description={`Are you sure you want to delete ${employee.prenom} ${employee.nom} (${employee.matricule})? They will be moved to trash.`}
          onConfirm={() => {
            setDeleteConfirmOpen(false);
            handleDelete();
          }}
        />
      </div>
    </Layout>
  );
}
