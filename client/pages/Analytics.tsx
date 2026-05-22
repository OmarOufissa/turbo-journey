import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Analytics() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/stats", { replace: true }); }, [navigate]);
  return null;
}
