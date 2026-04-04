import { useState } from "react";
import MainLayout from "$/components/MainLayout";
import AddUserModal from "$/modals/AddUserModal";
import "./UserManagement.css";

export default function UserManagement() {
  const [addUserOpen, setAddUserOpen] = useState(false);

  return (
    <MainLayout title="User Management">
      <div className="UserManagement-header">
        <button
          type="button"
          className="UserManagement-addButton"
          onClick={() => setAddUserOpen(true)}
        >
          + Add User
        </button>
      </div>

      <h2>Stinky cheese</h2>

      <AddUserModal
        isOpen={addUserOpen}
        onClose={() => setAddUserOpen(false)}
      />
    </MainLayout>
  );
}
