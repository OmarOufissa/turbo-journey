import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getEmployees, deleteEmployee } from "@/api";
import { Employee } from "@/types";
import { useToast } from "./use-toast";

export function useEmployees() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: employees = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: getEmployees,
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: (id: number) => deleteEmployee(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({
        title: "Employé supprimé",
        description: "L'employé a été supprimé avec succès",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    employees,
    isLoading,
    error,
    refetch,
    deleteEmployee: deleteEmployeeMutation.mutate,
    isDeletingEmployee: deleteEmployeeMutation.isPending,
  };
}
