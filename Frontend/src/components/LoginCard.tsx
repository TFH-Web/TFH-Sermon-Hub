import "./LoginCard.css";
import { useNavigate } from "react-router";
import { Card, CardHeader } from "./Card";

export function LoginCard() {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader title="Login Placeholder" />
      <div className="Card-body">
        <div className="Login-placeholder">
          <button
            type="button"
            className="login u-button"
            onClick={() => navigate("/")}
          >
            Log In
          </button>
        </div>
      </div>
    </Card>
  );
}
