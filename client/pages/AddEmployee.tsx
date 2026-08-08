import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
import { ArrowLeft, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "react-router-dom";

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

interface FormData {
  matricule: string;
  nom: string;
  prenom: string;
  fonction: string;
  divisionId: string;
  serviceId: string;
  equipeId: string;
  stCodes: string[];
  htCodes: string[];
  numero: string;
  dateValidation: string;
  dateExpiration: string;
  pdfOption: "generate" | "upload" | "skip";
  pdfFile?: File;
}

interface Errors {
  [key: string]: string;
}

const HT_CODES = ["H1V", "H2V", "B1V", "B2V", "HC", "H1N"];
const ST_CODES = ["H1N", "H1V", "H2N", "H2V"];

export default function AddEmployee() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const [formData, setFormData] = useState<FormData>({
    matricule: "",
    nom: "",
    prenom: "",
    fonction: "",
    divisionId: "",
    serviceId: "",
    equipeId: "",
    stCodes: [],
    htCodes: [],
    numero: "",
    dateValidation: "",
    dateExpiration: "",
    pdfOption: "skip",
  });

  // Fetch org structure
  useEffect(() => {
    fetchOrgStructure();
  }, []);

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

  async function fetchOrgStructure() {
    try {
      const [divRes, svcRes, eqpRes] = await Promise.all([
        fetch("/api/divisions"),
        fetch("/api/services"),
        fetch("/api/equipes"),
      ]);

      if (!divRes.ok || !svcRes.ok || !eqpRes.ok) {
        throw new Error("Failed to fetch organization structure");
      }

      const divData = await divRes.json();
      const svcData = await svcRes.json();
      const eqpData = await eqpRes.json();

      setDivisions(divData);
      setServices(svcData);
      setEquipes(eqpData);
    } catch (error) {
      console.error("Failed to fetch org structure:", error);
      toast({
        title: "Error",
        description: "Failed to load organization structure",
        variant: "destructive",
      });
    }
  }

  function validateForm(): boolean {
    const newErrors: Errors = {};

    if (!formData.matricule.trim()) {
      newErrors.matricule = "Matricule is required";
    } else if (!/^\d{5}$|^[A-Z0-9]{5}$/.test(formData.matricule)) {
      newErrors.matricule = "Matricule must be 5 digits or alphanumeric";
    }

    if (!formData.nom.trim()) {
      newErrors.nom = "Nom is required";
    }

    if (!formData.prenom.trim()) {
      newErrors.prenom = "Prénom is required";
    }

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors in the form",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Create employee
      const employeeRes = await fetch("/api/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          matricule: formData.matricule,
          nom: formData.nom,
          prenom: formData.prenom,
          fonction: formData.fonction,
          divisionId: parseInt(formData.divisionId),
          serviceId: parseInt(formData.serviceId),
          equipeId: parseInt(formData.equipeId),
        }),
      });

      if (!employeeRes.ok) {
        const errorData = await employeeRes.json();
        throw new Error(errorData.message || "Failed to create employee");
      }

      const employee = await employeeRes.json();

      // Create habilitation
      const habRes = await fetch("/api/habilitations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employee.id,
          stCodes: formData.stCodes,
          htCodes: formData.htCodes,
          numero: formData.numero || `${formData.matricule}_01`,
          dateValidation: formData.dateValidation,
          dateExpiration: formData.dateExpiration,
        }),
      });

      if (!habRes.ok) {
        throw new Error("Failed to create habilitation");
      }

      toast({
        title: "Success",
        description: "Employee created successfully",
      });

      navigate(`/employee/${employee.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create employee";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
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
          <Link to="/employees">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Add Employee</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Employee Info Section */}
          <Card>
            <CardHeader>
              <CardTitle>Employee Information</CardTitle>
              <CardDescription>
                Basic employee details (immutable)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="matricule">Matricule *</Label>
                  <Input
                    id="matricule"
                    placeholder="e.g., 81628"
                    value={formData.matricule}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        matricule: e.target.value,
                      }))
                    }
                    className={errors.matricule ? "border-red-500" : ""}
                  />
                  {errors.matricule && (
                    <p className="text-sm text-red-500">{errors.matricule}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nom">Nom *</Label>
                  <Input
                    id="nom"
                    placeholder="e.g., DUBOIS"
                    value={formData.nom}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        nom: e.target.value,
                      }))
                    }
                    className={errors.nom ? "border-red-500" : ""}
                  />
                  {errors.nom && (
                    <p className="text-sm text-red-500">{errors.nom}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prenom">Prénom *</Label>
                  <Input
                    id="prenom"
                    placeholder="e.g., Jean"
                    value={formData.prenom}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        prenom: e.target.value,
                      }))
                    }
                    className={errors.prenom ? "border-red-500" : ""}
                  />
                  {errors.prenom && (
                    <p className="text-sm text-red-500">{errors.prenom}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fonction">Fonction *</Label>
                  <Input
                    id="fonction"
                    placeholder="e.g., Électricien"
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
              </div>
            </CardContent>
          </Card>

          {/* Organization Section */}
          <Card>
            <CardHeader>
              <CardTitle>Organization</CardTitle>
              <CardDescription>
                Select division, service, and team
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                Add HT and/or ST codes, validation and expiration dates
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
                  Titre d&apos;habilitation (N°) (Optional)
                </Label>
                <Input
                  id="numero"
                  placeholder="e.g., 291_03/22"
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

          {/* PDF Section */}
          <Card>
            <CardHeader>
              <CardTitle>PDF (Optional)</CardTitle>
              <CardDescription>
                Choose whether to upload, generate, or skip PDF
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {[
                  { value: "skip", label: "Skip for now" },
                  { value: "upload", label: "Upload PDF" },
                  { value: "generate", label: "Generate PDF (coming soon)" },
                ].map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="pdfOption"
                      value={option.value}
                      checked={formData.pdfOption === option.value}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          pdfOption: e.target.value as
                            | "generate"
                            | "upload"
                            | "skip",
                        }))
                      }
                      className="w-4 h-4"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>

              {formData.pdfOption === "upload" && (
                <div className="space-y-2">
                  <Input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setFormData((prev) => ({
                          ...prev,
                          pdfFile: e.target.files![0],
                        }));
                      }
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end">
            <Link to="/employees">
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Employee"}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
