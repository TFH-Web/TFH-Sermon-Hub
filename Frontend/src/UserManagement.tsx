import { Icon } from "@iconify-icon/react";
import { useState } from "react";
import MainLayout from "$/components/MainLayout";
import AddUserModal from "$/modals/AddUserModal";
import "./UserManagement.css";
import {
  type User,
  canRemove,
  dateRelative,
  getFullName,
  getInitials,
  userHue,
  useUser,
} from "$/types/user";

export default function UserManagement() {
  const [addUserOpen, setAddUserOpen] = useState(false);
  const currentUser = useUser();
  // ProtectedRoute redirects to sign-in on session loss; render nothing until it does.
  if (!currentUser) return null;

  //TO DO: query the users in system
  const users: User[] = [];

  return (
    <MainLayout title="User Management">
      <header className="UserManagement-header">
        <p className="Header-info">
          Authentication is managed through Microsoft Entra SSO. All users must
          sign in with their organizational Microsoft account.
        </p>
      </header>

      <div className="UserManagement-tableWrap">
        <table className="UserManagement-users">
          <thead className="Users-thead">
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Last Active</th>
              {/*
			  <th>Actions</th>
			  */}
            </tr>
          </thead>
          <tbody>
            {users.length !== 0 ? (
              users.map((user) => (
                <tr key={user.id}>
                  <td className="Users-name">
                    <p
                      className="Users-initials"
                      style={{ "--h": userHue(user) } as React.CSSProperties}
                    >
                      {getInitials(user)}
                    </p>
                    <p className="Users-fullName">{getFullName(user)}</p>
                  </td>
                  <td className="Users-email">{user.email}</td>
                  <td className="Users-role">
                    <p
                      className={`Users-roleChip is-${user.role.toLowerCase()}`}
                    >
                      {user.role}
                    </p>
                  </td>
                  <td className="Users-lastActive">
                    <time dateTime={user.lastActive.toISOString()}>
                      {dateRelative(user)}
                    </time>
                  </td>

                  {/*
				<td className="Users-actions">
					<button type="button" className="Users-actionEdit u-button">
						Edit
					</button>
					<button
						type="button"
						className="Users-actionRemove u-button"
						hidden={!canRemove(currentUser, user)}
					>
						Remove
					</button>
				</td>
				*/}
                </tr>
              ))
            ) : (
              <p>No Users Found</p>
            )}
          </tbody>
        </table>
      </div>

      <AddUserModal
        isOpen={addUserOpen}
        onClose={() => setAddUserOpen(false)}
      />
    </MainLayout>
  );
}
