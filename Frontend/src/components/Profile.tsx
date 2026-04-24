import { getFullName, getInitials, getUser } from "$/types/user";
import "./Profile.css";
import { useNavigate } from "react-router";

export default function Profile() {
  const user = getUser();
  const initials = getInitials(user);
  const name = getFullName(user);
  const navigate = useNavigate();

  return (
    <div className="Profile">
      <h2 className="Profile-name">{name}</h2>
      <p className="Profile-role">{user.role}</p>
      <p className="Profile-initials">{initials}</p>
      <button
        type="button"
        className="Profile-logOut u-button"
        onClick={() => navigate("/")}
      >
        Log Out
      </button>
    </div>
  );
}
